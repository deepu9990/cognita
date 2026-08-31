import json
import math
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import psycopg2
from psycopg2.extras import RealDictCursor

from .config import get_rag_config, logger
from .schemas import (
    Chunk,
    DocumentMetadata,
    DocumentPermission,
    DocumentVersion,
    SearchResult,
    UserContext,
)


class VectorStoreInterface(ABC):
    """Abstract interface for vector database operations."""

    @abstractmethod
    def is_available(self) -> bool:
        """Check if the vector database is configured and reachable."""
        pass

    @abstractmethod
    def init_schema(self, dimension: int = 384) -> None:
        """Initialize database schema/tables and extensions."""
        pass

    @abstractmethod
    def save_document(self, doc: DocumentMetadata) -> None:
        """Persist document metadata."""
        pass

    @abstractmethod
    def save_document_version(self, version: DocumentVersion) -> None:
        """Persist document version."""
        pass

    @abstractmethod
    def save_chunks(self, chunks: List[Chunk]) -> None:
        """Persist document chunks with embeddings."""
        pass

    @abstractmethod
    def search_chunks(
        self,
        query_embedding: List[float],
        user_context: UserContext,
        top_k: int = 4,
        min_score: float = 0.5,
    ) -> List[SearchResult]:
        """Perform permission-aware, tenant-isolated vector similarity search."""
        pass

    @abstractmethod
    def get_document(self, document_id: str, organization_id: str) -> Optional[DocumentMetadata]:
        """Get document metadata by ID and organization."""
        pass

    @abstractmethod
    def list_documents(self, organization_id: str) -> List[DocumentMetadata]:
        """List all documents for an organization."""
        pass

    @abstractmethod
    def delete_document(self, document_id: str, organization_id: str) -> bool:
        """Delete document, versions, and chunks."""
        pass


class PgVectorStore(VectorStoreInterface):
    """PostgreSQL + pgvector implementation."""

    def __init__(self, database_url: Optional[str] = None):
        self.database_url = database_url or get_rag_config().database_url

    def _get_connection(self):
        if not self.database_url:
            raise RuntimeError(
                "DATABASE_URL is not configured. PostgreSQL + pgvector is required for RAG database storage."
            )
        return psycopg2.connect(self.database_url)

    def is_available(self) -> bool:
        if not self.database_url:
            return False
        try:
            with self._get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1;")
                    return True
        except Exception as error:
            logger.warning(f"PostgreSQL connection check failed: {error}")
            return False

    def init_schema(self, dimension: int = 384) -> None:
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS organizations (
                        id VARCHAR(64) PRIMARY KEY,
                        name VARCHAR(255) NOT NULL,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );
                    CREATE TABLE IF NOT EXISTS documents (
                        id VARCHAR(64) PRIMARY KEY,
                        organization_id VARCHAR(64) NOT NULL,
                        filename VARCHAR(512) NOT NULL,
                        title VARCHAR(512) NOT NULL,
                        mime_type VARCHAR(128) DEFAULT 'text/plain',
                        version VARCHAR(32) DEFAULT 'v1',
                        status VARCHAR(64) DEFAULT 'indexed',
                        effective_from TIMESTAMP WITH TIME ZONE,
                        effective_until TIMESTAMP WITH TIME ZONE,
                        is_active BOOLEAN DEFAULT TRUE,
                        is_public BOOLEAN DEFAULT FALSE,
                        allowed_departments TEXT[] DEFAULT '{}',
                        allowed_roles TEXT[] DEFAULT '{}',
                        metadata JSONB DEFAULT '{}'::jsonb,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );
                    CREATE TABLE IF NOT EXISTS document_versions (
                        id VARCHAR(64) PRIMARY KEY,
                        document_id VARCHAR(64) NOT NULL,
                        organization_id VARCHAR(64) NOT NULL,
                        version_number VARCHAR(32) NOT NULL DEFAULT 'v1',
                        effective_from TIMESTAMP WITH TIME ZONE,
                        effective_until TIMESTAMP WITH TIME ZONE,
                        is_active BOOLEAN DEFAULT TRUE,
                        metadata JSONB DEFAULT '{}'::jsonb,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );
                    """
                )
                cur.execute(
                    f"""
                    CREATE TABLE IF NOT EXISTS document_chunks (
                        id VARCHAR(64) PRIMARY KEY,
                        document_id VARCHAR(64) NOT NULL,
                        document_version_id VARCHAR(64) NOT NULL,
                        organization_id VARCHAR(64) NOT NULL,
                        content TEXT NOT NULL,
                        embedding vector({dimension}),
                        page_number INTEGER DEFAULT 1,
                        section VARCHAR(512) DEFAULT '',
                        chunk_index INTEGER DEFAULT 0,
                        metadata JSONB DEFAULT '{{}}'::jsonb,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );
                    CREATE INDEX IF NOT EXISTS idx_chunks_org_doc ON document_chunks(organization_id, document_id);
                    """
                )
            conn.commit()

    def save_document(self, doc: DocumentMetadata) -> None:
        perm = doc.permissions
        allowed_depts = perm.allowed_departments if perm else []
        allowed_roles = perm.allowed_roles if perm else []
        is_public = perm.is_public if perm else True

        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO documents (
                        id, organization_id, filename, title, mime_type, version, status,
                        effective_from, effective_until, is_active, is_public,
                        allowed_departments, allowed_roles, metadata, created_at, updated_at
                    ) VALUES (
                        %(id)s, %(org_id)s, %(filename)s, %(title)s, %(mime_type)s, %(version)s, %(status)s,
                        %(eff_from)s, %(eff_until)s, %(is_active)s, %(is_public)s,
                        %(allowed_depts)s, %(allowed_roles)s, %(metadata)s, %(created_at)s, %(updated_at)s
                    )
                    ON CONFLICT (id) DO UPDATE SET
                        title = EXCLUDED.title,
                        version = EXCLUDED.version,
                        status = EXCLUDED.status,
                        is_active = EXCLUDED.is_active,
                        is_public = EXCLUDED.is_public,
                        allowed_departments = EXCLUDED.allowed_departments,
                        allowed_roles = EXCLUDED.allowed_roles,
                        metadata = EXCLUDED.metadata,
                        updated_at = EXCLUDED.updated_at;
                    """,
                    {
                        "id": doc.id,
                        "org_id": doc.organization_id,
                        "filename": doc.filename,
                        "title": doc.title,
                        "mime_type": doc.mime_type,
                        "version": doc.version,
                        "status": doc.status,
                        "eff_from": doc.effective_from,
                        "eff_until": doc.effective_until,
                        "is_active": doc.is_active,
                        "is_public": is_public,
                        "allowed_depts": allowed_depts,
                        "allowed_roles": allowed_roles,
                        "metadata": json.dumps(doc.metadata),
                        "created_at": doc.created_at,
                        "updated_at": doc.updated_at,
                    },
                )
            conn.commit()

    def save_document_version(self, version: DocumentVersion) -> None:
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO document_versions (
                        id, document_id, organization_id, version_number,
                        effective_from, effective_until, is_active, metadata, created_at
                    ) VALUES (
                        %(id)s, %(doc_id)s, %(org_id)s, %(ver_num)s,
                        %(eff_from)s, %(eff_until)s, %(is_active)s, %(metadata)s, %(created_at)s
                    )
                    ON CONFLICT (id) DO UPDATE SET
                        is_active = EXCLUDED.is_active,
                        effective_from = EXCLUDED.effective_from,
                        effective_until = EXCLUDED.effective_until,
                        metadata = EXCLUDED.metadata;
                    """,
                    {
                        "id": version.id,
                        "doc_id": version.document_id,
                        "org_id": version.organization_id,
                        "ver_num": version.version_number,
                        "eff_from": version.effective_from,
                        "eff_until": version.effective_until,
                        "is_active": version.is_active,
                        "metadata": json.dumps(version.metadata),
                        "created_at": version.created_at,
                    },
                )
            conn.commit()

    def save_chunks(self, chunks: List[Chunk]) -> None:
        if not chunks:
            return
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                for chunk in chunks:
                    embedding_str = f"[{','.join(map(str, chunk.embedding))}]" if chunk.embedding else None
                    cur.execute(
                        """
                        INSERT INTO document_chunks (
                            id, document_id, document_version_id, organization_id,
                            content, embedding, page_number, section, chunk_index,
                            metadata, created_at
                        ) VALUES (
                            %(id)s, %(doc_id)s, %(version_id)s, %(org_id)s,
                            %(content)s, %(embedding)s::vector, %(page_number)s, %(section)s, %(chunk_index)s,
                            %(metadata)s, %(created_at)s
                        )
                        ON CONFLICT (id) DO UPDATE SET
                            content = EXCLUDED.content,
                            embedding = EXCLUDED.embedding,
                            metadata = EXCLUDED.metadata;
                        """,
                        {
                            "id": chunk.id,
                            "doc_id": chunk.document_id,
                            "version_id": chunk.document_version_id,
                            "org_id": chunk.organization_id,
                            "content": chunk.content,
                            "embedding": embedding_str,
                            "page_number": chunk.page_number,
                            "section": chunk.section,
                            "chunk_index": chunk.chunk_index,
                            "metadata": json.dumps(chunk.metadata),
                            "created_at": chunk.created_at,
                        },
                    )
            conn.commit()

    def search_chunks(
        self,
        query_embedding: List[float],
        user_context: UserContext,
        top_k: int = 4,
        min_score: float = 0.5,
    ) -> List[SearchResult]:
        embedding_str = f"[{','.join(map(str, query_embedding))}]"
        now = datetime.now(timezone.utc)

        query = """
            SELECT 
                c.document_id,
                d.title AS document_title,
                c.content,
                c.page_number,
                c.section,
                d.version,
                c.metadata,
                (1 - (c.embedding <=> %(query_embedding)s::vector)) AS score
            FROM document_chunks c
            JOIN documents d ON c.document_id = d.id AND c.organization_id = d.organization_id
            JOIN document_versions v ON c.document_version_id = v.id AND c.organization_id = v.organization_id
            WHERE c.organization_id = %(org_id)s
              AND d.is_active = TRUE
              AND v.is_active = TRUE
              AND (v.effective_from IS NULL OR v.effective_from <= %(now)s)
              AND (v.effective_until IS NULL OR v.effective_until >= %(now)s)
              AND (
                  d.is_public = TRUE
                  OR (
                      %(dept)s IS NOT NULL 
                      AND cardinality(d.allowed_departments) > 0 
                      AND %(dept)s = ANY(d.allowed_departments)
                  )
                  OR (
                      cardinality(d.allowed_roles) > 0 
                      AND %(roles)s && d.allowed_roles
                  )
                  OR (
                      cardinality(d.allowed_departments) = 0 
                      AND cardinality(d.allowed_roles) = 0
                  )
              )
              AND (1 - (c.embedding <=> %(query_embedding)s::vector)) >= %(min_score)s
            ORDER BY score DESC
            LIMIT %(limit)s;
        """

        with self._get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    query,
                    {
                        "query_embedding": embedding_str,
                        "org_id": user_context.organization_id,
                        "now": now,
                        "dept": user_context.department,
                        "roles": user_context.roles,
                        "min_score": min_score,
                        "limit": top_k,
                    },
                )
                rows = cur.fetchall()

        return [
            SearchResult(
                document_id=row["document_id"],
                document_title=row["document_title"],
                content=row["content"],
                page_number=row["page_number"],
                section=row["section"] or "",
                score=float(row["score"]),
                version=row["version"],
                metadata=row["metadata"] if isinstance(row["metadata"], dict) else json.loads(row["metadata"] or "{}"),
            )
            for row in rows
        ]

    def get_document(self, document_id: str, organization_id: str) -> Optional[DocumentMetadata]:
        with self._get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    "SELECT * FROM documents WHERE id = %s AND organization_id = %s;",
                    (document_id, organization_id),
                )
                row = cur.fetchone()
                if not row:
                    return None
                return DocumentMetadata(
                    id=row["id"],
                    organization_id=row["organization_id"],
                    filename=row["filename"],
                    title=row["title"],
                    mime_type=row["mime_type"],
                    version=row["version"],
                    status=row["status"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                    effective_from=row["effective_from"],
                    effective_until=row["effective_until"],
                    is_active=row["is_active"],
                    permissions=DocumentPermission(
                        organization_id=row["organization_id"],
                        allowed_departments=row["allowed_departments"] or [],
                        allowed_roles=row["allowed_roles"] or [],
                        is_public=row["is_public"],
                    ),
                    metadata=row["metadata"] if isinstance(row["metadata"], dict) else json.loads(row["metadata"] or "{}"),
                )

    def list_documents(self, organization_id: str) -> List[DocumentMetadata]:
        with self._get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    "SELECT * FROM documents WHERE organization_id = %s ORDER BY created_at DESC;",
                    (organization_id,),
                )
                rows = cur.fetchall()
                return [
                    DocumentMetadata(
                        id=row["id"],
                        organization_id=row["organization_id"],
                        filename=row["filename"],
                        title=row["title"],
                        mime_type=row["mime_type"],
                        version=row["version"],
                        status=row["status"],
                        created_at=row["created_at"],
                        updated_at=row["updated_at"],
                        effective_from=row["effective_from"],
                        effective_until=row["effective_until"],
                        is_active=row["is_active"],
                        permissions=DocumentPermission(
                            organization_id=row["organization_id"],
                            allowed_departments=row["allowed_departments"] or [],
                            allowed_roles=row["allowed_roles"] or [],
                            is_public=row["is_public"],
                        ),
                        metadata=row["metadata"] if isinstance(row["metadata"], dict) else json.loads(row["metadata"] or "{}"),
                    )
                    for row in rows
                ]

    def delete_document(self, document_id: str, organization_id: str) -> bool:
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM documents WHERE id = %s AND organization_id = %s;",
                    (document_id, organization_id),
                )
                deleted = cur.rowcount > 0
            conn.commit()
            return deleted


def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    dot = sum(a * b for a, b in zip(v1, v2))
    norm1 = math.sqrt(sum(a * a for a in v1))
    norm2 = math.sqrt(sum(b * b for b in v2))
    if norm1 == 0.0 or norm2 == 0.0:
        return 0.0
    return dot / (norm1 * norm2)


class InMemoryVectorStore(VectorStoreInterface):
    """In-memory vector store for unit tests and local mock verification."""

    def __init__(self):
        self.documents: Dict[str, DocumentMetadata] = {}
        self.versions: Dict[str, DocumentVersion] = {}
        self.chunks: Dict[str, Chunk] = {}

    def is_available(self) -> bool:
        return True

    def init_schema(self, dimension: int = 384) -> None:
        pass

    def save_document(self, doc: DocumentMetadata) -> None:
        self.documents[doc.id] = doc

    def save_document_version(self, version: DocumentVersion) -> None:
        self.versions[version.id] = version

    def save_chunks(self, chunks: List[Chunk]) -> None:
        for chunk in chunks:
            self.chunks[chunk.id] = chunk

    def search_chunks(
        self,
        query_embedding: List[float],
        user_context: UserContext,
        top_k: int = 4,
        min_score: float = 0.5,
    ) -> List[SearchResult]:
        from .permissions import can_access_document

        now = datetime.now(timezone.utc)
        results = []

        for chunk in self.chunks.values():
            if chunk.organization_id != user_context.organization_id:
                continue

            doc = self.documents.get(chunk.document_id)
            if not doc or not doc.is_active:
                continue

            version = self.versions.get(chunk.document_version_id)
            if not version or not version.is_active:
                continue

            if version.effective_from and version.effective_from > now:
                continue
            if version.effective_until and version.effective_until < now:
                continue

            if not can_access_document(user_context, doc.permissions):
                continue

            if not chunk.embedding:
                continue

            score = cosine_similarity(query_embedding, chunk.embedding)
            if score >= min_score:
                results.append(
                    SearchResult(
                        document_id=doc.id,
                        document_title=doc.title,
                        content=chunk.content,
                        page_number=chunk.page_number,
                        section=chunk.section,
                        score=score,
                        version=version.version_number,
                        metadata=chunk.metadata,
                    )
                )

        results.sort(key=lambda item: item.score, reverse=True)
        return results[:top_k]

    def get_document(self, document_id: str, organization_id: str) -> Optional[DocumentMetadata]:
        doc = self.documents.get(document_id)
        if doc and doc.organization_id == organization_id:
            return doc
        return None

    def list_documents(self, organization_id: str) -> List[DocumentMetadata]:
        return [doc for doc in self.documents.values() if doc.organization_id == organization_id]

    def delete_document(self, document_id: str, organization_id: str) -> bool:
        if document_id in self.documents and self.documents[document_id].organization_id == organization_id:
            del self.documents[document_id]
            self.versions = {k: v for k, v in self.versions.items() if v.document_id != document_id}
            self.chunks = {k: v for k, v in self.chunks.items() if v.document_id != document_id}
            return True
        return False


_global_vector_store: Optional[VectorStoreInterface] = None


def get_vector_store(store_type: Optional[str] = None) -> VectorStoreInterface:
    global _global_vector_store
    if _global_vector_store is not None and store_type is None:
        return _global_vector_store

    cfg = get_rag_config()
    if store_type == "memory":
        return InMemoryVectorStore()

    if cfg.database_url:
        _global_vector_store = PgVectorStore(cfg.database_url)
    else:
        # Default when no DATABASE_URL is provided: PgVectorStore initialized with None (is_available() -> False)
        _global_vector_store = PgVectorStore(None)
    return _global_vector_store

