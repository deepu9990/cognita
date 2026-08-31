import json
import os
import re
import shutil
from datetime import datetime, timezone
from threading import Thread
from typing import Any, Dict, List, Literal, Optional

try:
    import torch
    from transformers import TextIteratorStreamer
    TORCH_AVAILABLE = True
except ImportError:
    torch = None
    TextIteratorStreamer = None
    TORCH_AVAILABLE = False

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
try:
    from tavily import TavilyClient
except ImportError:
    TavilyClient = None

from load_models import (
    MODEL_CONFIGS,
    load_configured_models,
    load_embedding_model,
    models,
    tokenizers,
)
from rag.config import get_rag_config, logger
from rag.context import build_rag_context, format_rag_system_prompt
from rag.database import get_vector_store
from rag.embeddings import EmbeddingService
from rag.ingestion import ingest_document
from rag.retriever import Retriever
from rag.router import QueryRouter, RouteType
from rag.schemas import (
    DocumentMetadata,
    DocumentPermission,
    DocumentUploadResponse,
    RagSearchRequest,
    RagSearchResponse,
    SearchResult,
    UserContext,
)

from contextlib import asynccontextmanager

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_configured_models()
    load_embedding_model()
    yield


app = FastAPI(title="Cognita AI", version="1.2.0", lifespan=lifespan)
MAX_SEARCH_RESULTS = 3
MAX_TOOL_RESULT_CHARS = 3500
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
os.makedirs(DATA_DIR, exist_ok=True)


class Message(BaseModel):
    role: Literal["system", "user", "assistant", "tool"]
    content: str


class ChatRequest(BaseModel):
    model: str = Field(default_factory=lambda: os.getenv("DEFAULT_MODEL", "qwen3-4b"))
    messages: List[Message]
    max_new_tokens: int = Field(
        default_factory=lambda: int(os.getenv("MAX_NEW_TOKENS", "2000")),
        ge=1,
        le=8192,
    )
    user_context: Optional[UserContext] = None
    organization_id: Optional[str] = None


def sse(event_type: str, **payload: object) -> str:
    return f"data: {json.dumps({'type': event_type, **payload}, ensure_ascii=False)}\n\n"


def latest_user_message(messages: List[dict]) -> str:
    return next(
        (message["content"].strip() for message in reversed(messages) if message["role"] == "user"),
        "",
    )


def search_web(query: str) -> str:
    api_key = os.getenv("TAVILY_API_KEY")
    if not api_key:
        raise RuntimeError("TAVILY_API_KEY is not configured.")
    if TavilyClient is None:
        raise RuntimeError("tavily-python is not installed.")

    response = TavilyClient(api_key=api_key).search(
        query=query,
        search_depth="basic",
        max_results=MAX_SEARCH_RESULTS,
    )
    results = [
        {
            "title": item.get("title", ""),
            "url": item.get("url", ""),
            "content": item.get("content", "")[:900],
        }
        for item in response.get("results", [])[:MAX_SEARCH_RESULTS]
    ]
    if not results:
        raise RuntimeError("Web search returned no results.")
    return json.dumps(results, ensure_ascii=False)[:MAX_TOOL_RESULT_CHARS]


def stream_rag_chat(
    model_id: str,
    messages: List[dict],
    max_new_tokens: int,
    user_query: str,
    user_context: Optional[UserContext],
    route: RouteType,
):
    """
    Stream chat response handling RAG knowledge retrieval, Web search, and Qwen generation.
    Emits status, sources, content, done, error events.
    """
    rag_config = get_rag_config()
    vector_store = get_vector_store()
    retriever = Retriever(vector_store=vector_store)

    retrieved_sources: List[SearchResult] = []

    # 1. Company RAG retrieval
    if route in (RouteType.COMPANY_RAG, RouteType.BOTH):
        yield sse("status", message="Searching company knowledge...")

        if vector_store.is_available():
            try:
                retrieved_sources = retriever.search(
                    query=user_query,
                    user_context=user_context,
                    limit=rag_config.rag_top_k,
                    min_score=rag_config.rag_min_score,
                )
            except Exception as err:
                logger.error(f"RAG retrieval error: {err}")

            if retrieved_sources:
                sources_payload = [
                    {
                        "documentId": s.document_id,
                        "documentTitle": s.document_title,
                        "pageNumber": s.page_number,
                        "section": s.section,
                        "score": round(s.score, 3),
                    }
                    for s in retrieved_sources
                ]
                yield sse("sources", sources=sources_payload)

                rag_context = build_rag_context(retrieved_sources)
                system_msg_idx = next(
                    (i for i, m in enumerate(messages) if m["role"] == "system"),
                    None,
                )
                if system_msg_idx is not None:
                    base_sys = messages[system_msg_idx]["content"]
                    messages[system_msg_idx]["content"] = format_rag_system_prompt(base_sys, rag_context)
                else:
                    messages.insert(
                        0,
                        {
                            "role": "system",
                            "content": format_rag_system_prompt(
                                "You are a helpful AI assistant.", rag_context
                            ),
                        },
                    )
            else:
                logger.info("No relevant company documents found above score threshold.")
                messages.insert(
                    0,
                    {
                        "role": "system",
                        "content": (
                            "You are a helpful AI assistant. Note: No relevant company documentation "
                            "was found matching this query in the authorized knowledge base. If the user is asking "
                            "specifically about company policy or internal information, state clearly that "
                            "no matching company information is available."
                        ),
                    },
                )
        else:
            logger.warning("RAG database is not configured. Skipping knowledge base search.")
            messages.insert(
                0,
                {
                    "role": "system",
                    "content": (
                        "You are a helpful AI assistant. Note: The company knowledge base (PostgreSQL/pgvector) "
                        "is currently unconfigured. Inform the user if they requested internal company documentation."
                    ),
                },
            )

    # 2. Web search
    if route in (RouteType.WEB_SEARCH, RouteType.BOTH):
        yield sse("status", message="Searching the web...")
        try:
            web_result = search_web(user_query)
            messages.extend([
                {"role": "assistant", "content": "I will use web search for current information."},
                {"role": "tool", "content": web_result},
            ])
        except Exception as error:
            logger.error(f"Web search error: {error}")
            yield sse("error", message=f"Web search failed: {error}")

    # 3. LLM generation with Qwen
    if model_id not in models or not TORCH_AVAILABLE:
        yield sse("error", message=f"Model {model_id} is not loaded or PyTorch is not available in current environment.")
        yield sse("done")
        return

    model = models[model_id]
    tokenizer = tokenizers[model_id]
    prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer([prompt], return_tensors="pt", truncation=True)
    inputs = {key: value.to(model.device) for key, value in inputs.items()}
    streamer = TextIteratorStreamer(tokenizer, skip_prompt=True, skip_special_tokens=True)
    errors = []

    def generate() -> None:
        try:
            with torch.inference_mode():
                model.generate(
                    **inputs,
                    streamer=streamer,
                    max_new_tokens=max_new_tokens,
                    do_sample=True,
                    temperature=0.7,
                    top_p=0.8,
                    use_cache=True,
                )
        except Exception as error:
            errors.append(error)

    Thread(target=generate, daemon=True).start()

    for chunk in streamer:
        if chunk:
            yield sse("content", content=chunk, model=model_id, tool_used=bool(retrieved_sources or route == RouteType.WEB_SEARCH))

    if errors:
        yield sse("error", message=f"Generation failed: {errors[0]}")
    else:
        yield sse("done")




@app.get("/health")
def health() -> dict:
    rag_config = get_rag_config()
    vector_store = get_vector_store()
    db_available = vector_store.is_available()

    return {
        "status": "ok",
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "cuda": bool(TORCH_AVAILABLE and torch and torch.cuda.is_available()),
        "models_loaded": list(models),
        "web_search": bool(os.getenv("TAVILY_API_KEY")),
        "rag": {
            "available": db_available,
            "database": db_available,
            "embedding_model": rag_config.embedding_model,
            "embedding_dimension": rag_config.embedding_dimension,
        },
    }


@app.get("/models")
def available_models() -> dict:
    return {
        "models": [
            {
                "id": model_id,
                "name": config["display_name"],
                "description": config["description"],
                "loaded": model_id in models,
            }
            for model_id, config in MODEL_CONFIGS.items()
        ]
    }


@app.post("/rag/search", response_model=RagSearchResponse)
def rag_search(request: RagSearchRequest) -> RagSearchResponse:
    vector_store = get_vector_store()
    if not vector_store.is_available():
        raise HTTPException(
            status_code=503,
            detail="RAG database (PostgreSQL + pgvector) is not configured. Set DATABASE_URL.",
        )

    retriever = Retriever(vector_store=vector_store)
    results = retriever.search(
        query=request.query,
        user_context=request.user_context,
        limit=request.limit,
        min_score=request.min_score,
    )
    return RagSearchResponse(results=results)


@app.post("/documents", response_model=DocumentUploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    organization_id: str = Form(...),
    title: Optional[str] = Form(None),
    version: str = Form("v1"),
    is_public: bool = Form(True),
    allowed_departments: Optional[str] = Form(None),
    allowed_roles: Optional[str] = Form(None),
) -> DocumentUploadResponse:
    vector_store = get_vector_store()
    if not vector_store.is_available():
        raise HTTPException(
            status_code=503,
            detail="RAG database (PostgreSQL + pgvector) is not configured. Set DATABASE_URL.",
        )

    temp_path = os.path.join(DATA_DIR, file.filename or "uploaded_file")
    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        depts = [d.strip() for d in allowed_departments.split(",") if d.strip()] if allowed_departments else []
        roles = [r.strip() for r in allowed_roles.split(",") if r.strip()] if allowed_roles else []

        permissions = DocumentPermission(
            organization_id=organization_id,
            allowed_departments=depts,
            allowed_roles=roles,
            is_public=is_public,
        )

        response = ingest_document(
            file_path=temp_path,
            organization_id=organization_id,
            title=title,
            version=version,
            permissions=permissions,
            vector_store=vector_store,
        )
        return response
    finally:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass


@app.get("/documents", response_model=List[DocumentMetadata])
def list_documents(organization_id: str = Query(...)) -> List[DocumentMetadata]:
    vector_store = get_vector_store()
    if not vector_store.is_available():
        raise HTTPException(
            status_code=503,
            detail="RAG database is not configured.",
        )
    return vector_store.list_documents(organization_id=organization_id)


@app.get("/documents/{document_id}", response_model=DocumentMetadata)
def get_document(
    document_id: str,
    organization_id: str = Query(...),
) -> DocumentMetadata:
    vector_store = get_vector_store()
    if not vector_store.is_available():
        raise HTTPException(status_code=503, detail="RAG database is not configured.")

    doc = vector_store.get_document(document_id=document_id, organization_id=organization_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    return doc


@app.delete("/documents/{document_id}")
def delete_document(
    document_id: str,
    organization_id: str = Query(...),
) -> dict:
    vector_store = get_vector_store()
    if not vector_store.is_available():
        raise HTTPException(status_code=503, detail="RAG database is not configured.")

    success = vector_store.delete_document(document_id=document_id, organization_id=organization_id)
    if not success:
        raise HTTPException(status_code=404, detail="Document not found or already deleted.")
    return {"status": "deleted", "id": document_id}


@app.post("/documents/{document_id}/reindex")
def reindex_document(
    document_id: str,
    organization_id: str = Query(...),
) -> dict:
    vector_store = get_vector_store()
    if not vector_store.is_available():
        raise HTTPException(status_code=503, detail="RAG database is not configured.")

    doc = vector_store.get_document(document_id=document_id, organization_id=organization_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    return {"status": "reindexed", "id": document_id, "version": doc.version}


@app.post("/chat")
def chat(request: ChatRequest) -> StreamingResponse:
    if request.model not in models:
        # Check if running in mock/test mode without loaded models
        if not models:
            raise HTTPException(status_code=400, detail=f"Model is not loaded: {request.model}")

    messages = [message.model_dump() for message in request.messages]
    user_query = latest_user_message(messages)
    if not user_query:
        raise HTTPException(status_code=400, detail="At least one user message is required.")

    # Determine routing
    route = QueryRouter.route(user_query)
    logger.info(f"Routed chat query '{user_query[:50]}' to {route.value}")

    user_context = request.user_context
    if user_context is None and request.organization_id:
        user_context = UserContext(
            user_id="request_user",
            organization_id=request.organization_id,
            department=None,
            roles=[],
        )

    return StreamingResponse(
        stream_rag_chat(
            model_id=request.model,
            messages=messages,
            max_new_tokens=request.max_new_tokens,
            user_query=user_query,
            user_context=user_context,
            route=route,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )