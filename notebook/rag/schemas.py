from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class DocumentPage(BaseModel):
    text: str
    page_number: int = 1
    section: str = ""
    metadata: Dict[str, Any] = Field(default_factory=dict)


class LoadedDocument(BaseModel):
    filename: str
    title: str
    mime_type: str
    pages: List[DocumentPage]
    metadata: Dict[str, Any] = Field(default_factory=dict)


class Chunk(BaseModel):
    id: str
    document_id: str
    document_version_id: str
    organization_id: str
    content: str
    embedding: Optional[List[float]] = None
    page_number: int = 1
    section: str = ""
    chunk_index: int = 0
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserContext(BaseModel):
    user_id: str
    organization_id: str
    department: Optional[str] = None
    roles: List[str] = Field(default_factory=list)


class DocumentPermission(BaseModel):
    organization_id: str
    allowed_departments: List[str] = Field(default_factory=list)
    allowed_roles: List[str] = Field(default_factory=list)
    is_public: bool = False


class DocumentMetadata(BaseModel):
    id: str
    organization_id: str
    filename: str
    title: str
    mime_type: str = "text/plain"
    version: str = "v1"
    status: str = "indexed"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    effective_from: Optional[datetime] = None
    effective_until: Optional[datetime] = None
    is_active: bool = True
    permissions: Optional[DocumentPermission] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class DocumentVersion(BaseModel):
    id: str
    document_id: str
    organization_id: str
    version_number: str = "v1"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    effective_from: Optional[datetime] = None
    effective_until: Optional[datetime] = None
    is_active: bool = True
    metadata: Dict[str, Any] = Field(default_factory=dict)


class SearchResult(BaseModel):
    document_id: str
    document_title: str
    content: str
    page_number: int = 1
    section: str = ""
    score: float
    version: str = "v1"
    metadata: Dict[str, Any] = Field(default_factory=dict)


class RagSearchRequest(BaseModel):
    query: str
    limit: int = Field(default=4, ge=1, le=20)
    min_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    user_context: Optional[UserContext] = None


class RagSearchResponse(BaseModel):
    results: List[SearchResult]


class DocumentUploadResponse(BaseModel):
    id: str
    organization_id: str
    filename: str
    title: str
    version: str
    chunk_count: int
    status: str
    created_at: datetime

