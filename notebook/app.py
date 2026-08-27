import json
import os
import re
from datetime import datetime
from threading import Thread
from typing import Literal

import torch
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from tavily import TavilyClient
from transformers import TextIteratorStreamer

from load_models import MODEL_CONFIGS, load_configured_models, models, tokenizers

load_dotenv()

app = FastAPI(title="Cognita AI", version="1.1.0")
MAX_SEARCH_RESULTS = 3
MAX_TOOL_RESULT_CHARS = 3500
FRESHNESS_PATTERN = re.compile(
    r"\b(latest|current|recent|today|tonight|yesterday|tomorrow|this week|"
    r"this month|this year|newest|breaking|live|currently|recently|news|"
    r"price|prices|release|released|announced|announcement)\b",
    re.IGNORECASE,
)


class Message(BaseModel):
    role: Literal["system", "user", "assistant", "tool"]
    content: str


class ChatRequest(BaseModel):
    model: str = Field(default_factory=lambda: os.getenv("DEFAULT_MODEL", "qwen3-4b"))
    messages: list[Message]
    max_new_tokens: int = Field(
        default_factory=lambda: int(os.getenv("MAX_NEW_TOKENS", "2000")),
        ge=1,
        le=8192,
    )


def sse(event_type: str, **payload: object) -> str:
    return f"data: {json.dumps({'type': event_type, **payload}, ensure_ascii=False)}\n\n"


def latest_user_message(messages: list[dict]) -> str:
    return next(
        (message["content"].strip() for message in reversed(messages) if message["role"] == "user"),
        "",
    )


def requires_web_search(query: str) -> bool:
    return bool(FRESHNESS_PATTERN.search(query))


def search_web(query: str) -> str:
    api_key = os.getenv("TAVILY_API_KEY")
    if not api_key:
        raise RuntimeError("TAVILY_API_KEY is not configured.")

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


def stream_response(model_id: str, messages: list[dict], max_new_tokens: int):
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
            yield sse("content", content=chunk, model=model_id, tool_used=False)
    if errors:
        yield sse("error", message=f"Generation failed: {errors[0]}")
    else:
        yield sse("done")


@app.on_event("startup")
def startup() -> None:
    load_configured_models()


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "date": datetime.now().strftime("%Y-%m-%d"),
        "cuda": torch.cuda.is_available(),
        "models_loaded": list(models),
        "web_search": bool(os.getenv("TAVILY_API_KEY")),
    }


@app.get("/models")
def available_models() -> dict:
    return {
        "models": [
            {"id": model_id, "name": config["display_name"], "description": config["description"], "loaded": model_id in models}
            for model_id, config in MODEL_CONFIGS.items()
        ]
    }


@app.post("/chat")
def chat(request: ChatRequest) -> StreamingResponse:
    if request.model not in models:
        raise HTTPException(status_code=400, detail=f"Model is not loaded: {request.model}")

    messages = [message.model_dump() for message in request.messages]
    user_query = latest_user_message(messages)
    if not user_query:
        raise HTTPException(status_code=400, detail="At least one user message is required.")

    if requires_web_search(user_query):
        try:
            result = search_web(user_query)
        except Exception as error:
            def failed_search():
                yield sse("error", message=f"Web search failed: {error}")
                yield sse("done")
            return StreamingResponse(failed_search(), media_type="text/event-stream")

        messages.extend([
            {"role": "assistant", "content": "I will use web search for current information."},
            {"role": "tool", "content": result},
        ])

    return StreamingResponse(
        stream_response(request.model, messages, request.max_new_tokens),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )