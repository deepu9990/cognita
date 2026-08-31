import re
import uuid
from typing import List, Optional

from .config import get_rag_config
from .schemas import Chunk, LoadedDocument


class DocumentChunker:
    """Configurable document chunker preserving structural and tenant metadata."""

    def __init__(self, chunk_size: Optional[int] = None, chunk_overlap: Optional[int] = None):
        cfg = get_rag_config()
        self.chunk_size = chunk_size or cfg.chunk_size
        self.chunk_overlap = chunk_overlap or cfg.chunk_overlap
        if self.chunk_overlap >= self.chunk_size:
            self.chunk_overlap = max(0, self.chunk_size // 5)

    def _split_text(self, text: str) -> List[str]:
        """Split text respecting paragraph and sentence boundaries."""
        if not text or not text.strip():
            return []

        text = text.strip()
        if len(text) <= self.chunk_size:
            return [text]

        # First split into paragraphs
        paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
        chunks: List[str] = []
        current_chunk: List[str] = []
        current_length = 0

        for para in paragraphs:
            para_len = len(para)
            if current_length + para_len + 1 <= self.chunk_size:
                current_chunk.append(para)
                current_length += para_len + 1
            else:
                # If current chunk has content, finish it
                if current_chunk:
                    chunk_text = "\n\n".join(current_chunk)
                    chunks.append(chunk_text)
                    # For overlap, keep the tail
                    overlap_chars = 0
                    overlap_paras = []
                    for p in reversed(current_chunk):
                        if overlap_chars + len(p) <= self.chunk_overlap:
                            overlap_paras.insert(0, p)
                            overlap_chars += len(p) + 1
                        else:
                            break
                    current_chunk = overlap_paras
                    current_length = sum(len(p) + 1 for p in current_chunk)

                # If single paragraph exceeds chunk_size, split by sentences
                if para_len > self.chunk_size:
                    sentences = [s.strip() for s in re.split(r"(?<=[.?!])\s+", para) if s.strip()]
                    for sentence in sentences:
                        sent_len = len(sentence)
                        if current_length + sent_len + 1 <= self.chunk_size:
                            current_chunk.append(sentence)
                            current_length += sent_len + 1
                        else:
                            if current_chunk:
                                chunks.append(" ".join(current_chunk))
                                current_chunk = []
                                current_length = 0
                            # If single sentence exceeds chunk_size, hard slice
                            if sent_len > self.chunk_size:
                                start = 0
                                while start < sent_len:
                                    end = start + self.chunk_size
                                    chunks.append(sentence[start:end])
                                    start += self.chunk_size - self.chunk_overlap
                            else:
                                current_chunk.append(sentence)
                                current_length = sent_len + 1
                else:
                    current_chunk.append(para)
                    current_length += para_len + 1

        if current_chunk:
            chunks.append("\n\n".join(current_chunk))

        return chunks

    def chunk_document(
        self,
        document: LoadedDocument,
        document_id: str,
        document_version_id: str,
        organization_id: str,
    ) -> List[Chunk]:
        """Split a loaded document into chunks while preserving metadata."""
        chunks: List[Chunk] = []
        chunk_index = 0

        for page in document.pages:
            page_chunks = self._split_text(page.text)
            for text_chunk in page_chunks:
                chunk_id = f"{document_id}_{document_version_id}_{chunk_index}"
                chunk_metadata = {
                    **document.metadata,
                    **page.metadata,
                    "title": document.title,
                    "filename": document.filename,
                }
                chunks.append(
                    Chunk(
                        id=chunk_id,
                        document_id=document_id,
                        document_version_id=document_version_id,
                        organization_id=organization_id,
                        content=text_chunk,
                        page_number=page.page_number,
                        section=page.section,
                        chunk_index=chunk_index,
                        metadata=chunk_metadata,
                    )
                )
                chunk_index += 1

        return chunks

