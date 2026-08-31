import time
from typing import List, Optional

from .config import get_rag_config, logger
from .database import VectorStoreInterface, get_vector_store
from .embeddings import EmbeddingService
from .schemas import SearchResult, UserContext


class Retriever:
    """Retrieval service managing query embedding, vector search, and score filtering."""

    def __init__(
        self,
        vector_store: Optional[VectorStoreInterface] = None,
        embedding_service: Optional[EmbeddingService] = None,
    ):
        self.config = get_rag_config()
        self.vector_store = vector_store or get_vector_store()
        self.embedding_service = embedding_service or EmbeddingService.get_instance()

    def is_available(self) -> bool:
        return self.vector_store.is_available()

    def search(
        self,
        query: str,
        user_context: Optional[UserContext] = None,
        limit: Optional[int] = None,
        min_score: Optional[float] = None,
    ) -> List[SearchResult]:
        if not query or not query.strip():
            return []

        effective_limit = limit or self.config.rag_top_k
        effective_min_score = min_score if min_score is not None else self.config.rag_min_score

        # If user context is not provided, use default public organization context
        effective_context = user_context or UserContext(
            user_id="anonymous",
            organization_id="default_org",
            department=None,
            roles=[],
        )

        start_time = time.perf_counter()
        query_embedding = self.embedding_service.embed_query(query)
        embed_time = time.perf_counter() - start_time

        search_start = time.perf_counter()
        results = self.vector_store.search_chunks(
            query_embedding=query_embedding,
            user_context=effective_context,
            top_k=effective_limit,
            min_score=effective_min_score,
        )
        search_time = time.perf_counter() - search_start

        logger.info(
            f"RAG search query='{query[:40]}...' "
            f"org_id='{effective_context.organization_id}' "
            f"results={len(results)} "
            f"embed_ms={embed_time*1000:.1f} "
            f"search_ms={search_time*1000:.1f} "
            f"doc_ids={[r.document_id for r in results]}"
        )

        return results

