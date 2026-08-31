from typing import List
from .schemas import SearchResult


def build_rag_context(results: List[SearchResult]) -> str:
    """Transform retrieved search results into a clean, structured context string."""
    if not results:
        return ""

    context_parts = []
    for idx, result in enumerate(results, start=1):
        section_text = f"\nSection: {result.section}" if result.section else ""
        page_text = f"\nPage: {result.page_number}" if result.page_number else ""
        part = (
            f"SOURCE {idx}\n"
            f"Document: {result.document_title}"
            f"{section_text}"
            f"{page_text}\n\n"
            f"Content:\n{result.content.strip()}"
        )
        context_parts.append(part)

    return "\n\n---\n\n".join(context_parts)


def format_rag_system_prompt(base_prompt: str, context_str: str) -> str:
    """
    Append RAG sources and strict anti-hallucination instructions to system prompt.
    """
    if not context_str:
        return base_prompt

    instructions = (
        "\n\n============================================================\n"
        "COMPANY KNOWLEDGE CONTEXT (USE AS GROUND TRUTH):\n"
        "============================================================\n"
        f"{context_str}\n"
        "============================================================\n"
        "INSTRUCTIONS FOR ANSWERING WITH COMPANY KNOWLEDGE:\n"
        "1. Base your answer strictly on the provided company sources above.\n"
        "2. Do NOT invent, assume, or hallucinate company policies, numbers, or terms.\n"
        "3. If the provided sources do not contain the answer, explicitly state that "
        "the requested information is not available in the company documentation.\n"
        "4. Always cite relevant document titles, sections, and page numbers when stating facts.\n"
        "5. Do NOT expose internal permissions or confidential data not present in the sources.\n"
        "============================================================"
    )

    return f"{base_prompt}{instructions}"

