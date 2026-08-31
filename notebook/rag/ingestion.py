import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from .chunking import DocumentChunker
from .config import get_rag_config, logger
from .database import VectorStoreInterface, get_vector_store
from .embeddings import EmbeddingService
from .loaders import load_document
from .schemas import (
    DocumentMetadata,
    DocumentPermission,
    DocumentUploadResponse,
    DocumentVersion,
)


def ingest_document(
    file_path: str,
    organization_id: str,
    title: Optional[str] = None,
    version: str = "v1",
    permissions: Optional[DocumentPermission] = None,
    effective_from: Optional[datetime] = None,
    effective_until: Optional[datetime] = None,
    is_active: bool = True,
    vector_store: Optional[VectorStoreInterface] = None,
    embedding_service: Optional[EmbeddingService] = None,
) -> DocumentUploadResponse:
    """
    Ingest a document through: load -> chunk -> embed -> save to vector store.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    store = vector_store or get_vector_store()
    embedder = embedding_service or EmbeddingService.get_instance()
    chunker = DocumentChunker()

    filename = os.path.basename(file_path)
    doc_title = title or os.path.splitext(filename)[0]

    logger.info(f"Ingesting document: '{filename}' for org: '{organization_id}' (version: {version})")

    # 1. Load document
    loaded_doc = load_document(file_path, filename=filename, title=doc_title)

    # 2. Generate IDs
    doc_id = str(uuid.uuid4())
    version_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    # 3. Create Chunks
    chunks = chunker.chunk_document(
        document=loaded_doc,
        document_id=doc_id,
        document_version_id=version_id,
        organization_id=organization_id,
    )

    if not chunks:
        logger.warning(f"No content chunks extracted from document: {filename}")

    # 4. Generate Embeddings in batch
    texts_to_embed = [chunk.content for chunk in chunks]
    embeddings = embedder.embed_documents(texts_to_embed)

    for chunk, emb in zip(chunks, embeddings):
        chunk.embedding = emb

    # 5. Build Permissions
    doc_permissions = permissions or DocumentPermission(
        organization_id=organization_id,
        allowed_departments=[],
        allowed_roles=[],
        is_public=True,
    )

    # 6. Build Metadata
    doc_metadata = DocumentMetadata(
        id=doc_id,
        organization_id=organization_id,
        filename=filename,
        title=doc_title,
        mime_type=loaded_doc.mime_type,
        version=version,
        status="indexed",
        created_at=now,
        updated_at=now,
        effective_from=effective_from,
        effective_until=effective_until,
        is_active=is_active,
        permissions=doc_permissions,
        metadata={
            "chunk_count": len(chunks),
            "file_size": os.path.getsize(file_path),
            **loaded_doc.metadata,
        },
    )

    doc_version = DocumentVersion(
        id=version_id,
        document_id=doc_id,
        organization_id=organization_id,
        version_number=version,
        created_at=now,
        effective_from=effective_from,
        effective_until=effective_until,
        is_active=is_active,
        metadata={"chunk_count": len(chunks)},
    )

    # 7. Persist to Vector Store
    store.save_document(doc_metadata)
    store.save_document_version(doc_version)
    store.save_chunks(chunks)

    logger.info(f"Successfully ingested document '{doc_title}' ({doc_id}) with {len(chunks)} chunks.")

    return DocumentUploadResponse(
        id=doc_id,
        organization_id=organization_id,
        filename=filename,
        title=doc_title,
        version=version,
        chunk_count=len(chunks),
        status="indexed",
        created_at=now,
    )

