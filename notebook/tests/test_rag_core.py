import json
import os
import tempfile
import unittest
from datetime import datetime, timezone

from rag.chunking import DocumentChunker
from rag.config import RagConfig
from rag.context import build_rag_context, format_rag_system_prompt
from rag.database import InMemoryVectorStore, cosine_similarity
from rag.embeddings import EmbeddingService
from rag.ingestion import ingest_document
from rag.loaders import MarkdownLoader, TxtLoader, load_document
from rag.permissions import can_access_document
from rag.retriever import Retriever
from rag.router import QueryRouter, RouteType
from rag.schemas import (
    DocumentMetadata,
    DocumentPage,
    DocumentPermission,
    DocumentVersion,
    LoadedDocument,
    SearchResult,
    UserContext,
)


class TestRagCore(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.embedding_service = EmbeddingService(dimension=384)

    def tearDown(self):
        import shutil

        shutil.rmtree(self.temp_dir, ignore_errors=True)

    # 1. Document loading tests (TXT and Markdown, and loader dispatch)
    def test_document_loading_txt(self):
        txt_path = os.path.join(self.temp_dir, "leave_policy.txt")
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write("Casual Leave Policy\n\nEmployees receive 12 casual leaves per calendar year.")

        loaded = load_document(txt_path)
        self.assertIsInstance(loaded, LoadedDocument)
        self.assertEqual(len(loaded.pages), 1)
        self.assertIn("12 casual leaves", loaded.pages[0].text)
        self.assertEqual(loaded.title, "leave_policy")

    def test_document_loading_markdown(self):
        md_path = os.path.join(self.temp_dir, "handbook.md")
        with open(md_path, "w", encoding="utf-8") as f:
            f.write(
                "# Overview\nWelcome to the company.\n\n"
                "# Leave Policy\nCasual leaves are 12 days annually.\n\n"
                "# Health Benefits\nMedical insurance covers employees and dependents."
            )

        loaded = MarkdownLoader().load(md_path)
        self.assertIsInstance(loaded, LoadedDocument)
        self.assertGreaterEqual(len(loaded.pages), 3)
        sections = [p.section for p in loaded.pages]
        self.assertIn("Overview", sections)
        self.assertIn("Leave Policy", sections)
        self.assertIn("Health Benefits", sections)

    # 2. Chunking tests (chunk size, overlap, metadata preservation)
    def test_chunking_metadata_preservation(self):
        doc = LoadedDocument(
            filename="policy.txt",
            title="Leave Policy",
            mime_type="text/plain",
            pages=[
                DocumentPage(
                    text="Paragraph 1: Casual leaves are allocated at the beginning of each fiscal year. " * 5,
                    page_number=3,
                    section="Casual Leave",
                    metadata={"extra_key": "extra_val"},
                )
            ],
            metadata={"doc_key": "doc_val"},
        )

        chunker = DocumentChunker(chunk_size=150, chunk_overlap=30)
        chunks = chunker.chunk_document(
            document=doc,
            document_id="doc_101",
            document_version_id="ver_201",
            organization_id="org_alpha",
        )

        self.assertGreater(len(chunks), 1)
        for idx, chunk in enumerate(chunks):
            self.assertEqual(chunk.document_id, "doc_101")
            self.assertEqual(chunk.document_version_id, "ver_201")
            self.assertEqual(chunk.organization_id, "org_alpha")
            self.assertEqual(chunk.page_number, 3)
            self.assertEqual(chunk.section, "Casual Leave")
            self.assertEqual(chunk.chunk_index, idx)
            self.assertEqual(chunk.metadata.get("doc_key"), "doc_val")
            self.assertEqual(chunk.metadata.get("extra_key"), "extra_val")

    # 3. Embedding dimensions & service
    def test_embedding_dimensions(self):
        embedder = EmbeddingService(dimension=384)
        query_vec = embedder.embed_query("How many casual leaves do employees get?")
        self.assertEqual(len(query_vec), 384)

        doc_vecs = embedder.embed_documents(["First document", "Second document"])
        self.assertEqual(len(doc_vecs), 2)
        self.assertEqual(len(doc_vecs[0]), 384)
        self.assertEqual(len(doc_vecs[1]), 384)

    # 4. Retrieval (vector similarity search)
    def test_retrieval_vector_similarity(self):
        store = InMemoryVectorStore()
        embedder = EmbeddingService(dimension=384)

        txt_path = os.path.join(self.temp_dir, "leave.txt")
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write("Employees receive 12 casual leaves and 10 sick leaves annually.")

        ingest_document(
            file_path=txt_path,
            organization_id="org_test",
            title="Leave Policy",
            version="v1",
            vector_store=store,
            embedding_service=embedder,
        )

        retriever = Retriever(vector_store=store, embedding_service=embedder)
        user_ctx = UserContext(user_id="user_1", organization_id="org_test")
        results = retriever.search("casual leaves", user_context=user_ctx, limit=2, min_score=0.0)

        self.assertGreaterEqual(len(results), 1)
        self.assertEqual(results[0].document_title, "Leave Policy")
        self.assertIn("12 casual leaves", results[0].content)
        self.assertGreater(results[0].score, 0.0)

    # 5. Tenant isolation (Company A vs Company B)
    def test_tenant_isolation(self):
        store = InMemoryVectorStore()
        embedder = EmbeddingService(dimension=384)

        # Ingest for Org A
        path_a = os.path.join(self.temp_dir, "org_a_policy.txt")
        with open(path_a, "w", encoding="utf-8") as f:
            f.write("Company Alpha secret internal revenue is 50 million.")
        ingest_document(
            file_path=path_a,
            organization_id="org_alpha",
            title="Alpha Revenue",
            vector_store=store,
            embedding_service=embedder,
        )

        # Ingest for Org B
        path_b = os.path.join(self.temp_dir, "org_b_policy.txt")
        with open(path_b, "w", encoding="utf-8") as f:
            f.write("Company Beta secret internal revenue is 80 million.")
        ingest_document(
            file_path=path_b,
            organization_id="org_beta",
            title="Beta Revenue",
            vector_store=store,
            embedding_service=embedder,
        )

        retriever = Retriever(vector_store=store, embedding_service=embedder)

        # User from Org A queries
        user_a = UserContext(user_id="user_a", organization_id="org_alpha")
        results_a = retriever.search("internal revenue", user_context=user_a, min_score=0.0)

        # User A must ONLY see Alpha documents, never Beta
        for res in results_a:
            self.assertEqual(res.document_title, "Alpha Revenue")
            self.assertNotIn("Beta", res.content)

        # User from Org B queries
        user_b = UserContext(user_id="user_b", organization_id="org_beta")
        results_b = retriever.search("internal revenue", user_context=user_b, min_score=0.0)

        # User B must ONLY see Beta documents, never Alpha
        for res in results_b:
            self.assertEqual(res.document_title, "Beta Revenue")
            self.assertNotIn("Alpha", res.content)

    # 6. Permissions filtering (role & department access)
    def test_permission_filtering(self):
        # Public doc
        pub_perm = DocumentPermission(organization_id="org_1", is_public=True)
        self.assertTrue(can_access_document(UserContext(user_id="u1", organization_id="org_1"), pub_perm))

        # Cross-tenant attempt
        self.assertFalse(can_access_document(UserContext(user_id="u2", organization_id="org_2"), pub_perm))

        # Role-restricted doc (Admin/HR only)
        hr_perm = DocumentPermission(
            organization_id="org_1",
            allowed_roles=["HR_ADMIN", "EXECUTIVE"],
            is_public=False,
        )
        engineer = UserContext(user_id="u3", organization_id="org_1", roles=["ENGINEER"])
        hr_admin = UserContext(user_id="u4", organization_id="org_1", roles=["HR_ADMIN"])

        self.assertFalse(can_access_document(engineer, hr_perm))
        self.assertTrue(can_access_document(hr_admin, hr_perm))

        # Department-restricted doc
        finance_perm = DocumentPermission(
            organization_id="org_1",
            allowed_departments=["Finance"],
            is_public=False,
        )
        fin_user = UserContext(user_id="u5", organization_id="org_1", department="Finance")
        mkt_user = UserContext(user_id="u6", organization_id="org_1", department="Marketing")

        self.assertTrue(can_access_document(fin_user, finance_perm))
        self.assertFalse(can_access_document(mkt_user, finance_perm))

    # 7. Retrieval threshold (RAG_MIN_SCORE filtering)
    def test_retrieval_threshold(self):
        store = InMemoryVectorStore()
        embedder = EmbeddingService(dimension=384)

        path = os.path.join(self.temp_dir, "doc.txt")
        with open(path, "w", encoding="utf-8") as f:
            f.write("Quantum physics principles of photon entanglement.")

        ingest_document(
            file_path=path,
            organization_id="org_1",
            title="Quantum Physics",
            vector_store=store,
            embedding_service=embedder,
        )

        retriever = Retriever(vector_store=store, embedding_service=embedder)
        user_ctx = UserContext(user_id="u1", organization_id="org_1")

        # Extremely high threshold -> should return empty list
        strict_results = retriever.search("Quantum physics", user_context=user_ctx, min_score=0.999)
        self.assertEqual(len(strict_results), 0)

        # Normal threshold -> should return match
        normal_results = retriever.search("Quantum physics", user_context=user_ctx, min_score=0.0)
        self.assertEqual(len(normal_results), 1)

    # 8. Document version selection (active v2 vs inactive v1)
    def test_document_version_selection(self):
        store = InMemoryVectorStore()
        embedder = EmbeddingService(dimension=384)

        # Ingest v1 (old)
        path_v1 = os.path.join(self.temp_dir, "leave_v1.txt")
        with open(path_v1, "w", encoding="utf-8") as f:
            f.write("Casual leaves are 10 days in v1 policy.")
        ingest_document(
            file_path=path_v1,
            organization_id="org_ver",
            title="Leave Policy",
            version="v1",
            is_active=False,  # superseded
            vector_store=store,
            embedding_service=embedder,
        )

        # Ingest v2 (active)
        path_v2 = os.path.join(self.temp_dir, "leave_v2.txt")
        with open(path_v2, "w", encoding="utf-8") as f:
            f.write("Casual leaves are 15 days in v2 policy.")
        ingest_document(
            file_path=path_v2,
            organization_id="org_ver",
            title="Leave Policy",
            version="v2",
            is_active=True,  # active version
            vector_store=store,
            embedding_service=embedder,
        )

        retriever = Retriever(vector_store=store, embedding_service=embedder)
        user_ctx = UserContext(user_id="u1", organization_id="org_ver")
        results = retriever.search("casual leaves", user_context=user_ctx, min_score=0.0)

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].version, "v2")
        self.assertIn("15 days", results[0].content)

    # 9. RAG routing (company policy query)
    def test_rag_routing(self):
        self.assertEqual(QueryRouter.route("What is our leave policy?"), RouteType.COMPANY_RAG)
        self.assertEqual(QueryRouter.route("Explain our employee handbook guidelines"), RouteType.COMPANY_RAG)
        self.assertEqual(QueryRouter.route("What is our wfh policy and expense policy?"), RouteType.COMPANY_RAG)

    # 10. Web routing (freshness vs both vs direct LLM)
    def test_web_and_combo_routing(self):
        self.assertEqual(QueryRouter.route("What is the latest RBI policy today?"), RouteType.WEB_SEARCH)
        self.assertEqual(QueryRouter.route("What are the current stock prices?"), RouteType.WEB_SEARCH)
        self.assertEqual(
            QueryRouter.route("Does our company policy comply with the latest 2026 RBI rule?"),
            RouteType.BOTH,
        )
        self.assertEqual(QueryRouter.route("What is a closure in Python?"), RouteType.DIRECT_LLM)
        self.assertEqual(QueryRouter.route("Explain quicksort algorithm"), RouteType.DIRECT_LLM)

    # 11. SSE thinking event format
    def test_sse_thinking_event(self):
        from app import sse

        event_str = sse("thinking", content="Analyzing leave policy...")
        self.assertTrue(event_str.startswith("data: "))
        self.assertTrue(event_str.endswith("\n\n"))
        data = json.loads(event_str.replace("data: ", "").strip())
        self.assertEqual(data["type"], "thinking")
        self.assertEqual(data["content"], "Analyzing leave policy...")

    # 12. SSE content event format
    def test_sse_content_event(self):
        from app import sse

        event_str = sse("content", content="Employees receive 12 days.", model="qwen3-4b", tool_used=True)
        data = json.loads(event_str.replace("data: ", "").strip())
        self.assertEqual(data["type"], "content")
        self.assertEqual(data["content"], "Employees receive 12 days.")
        self.assertEqual(data["model"], "qwen3-4b")
        self.assertTrue(data["tool_used"])

    # 13. SSE sources event format
    def test_sse_sources_event(self):
        from app import sse

        sources = [
            {
                "documentId": "doc_123",
                "documentTitle": "Leave Policy",
                "pageNumber": 12,
                "section": "Casual Leave",
                "score": 0.91,
            }
        ]
        event_str = sse("sources", sources=sources)
        data = json.loads(event_str.replace("data: ", "").strip())
        self.assertEqual(data["type"], "sources")
        self.assertEqual(len(data["sources"]), 1)
        self.assertEqual(data["sources"][0]["documentTitle"], "Leave Policy")
        self.assertEqual(data["sources"][0]["pageNumber"], 12)
        self.assertEqual(data["sources"][0]["section"], "Casual Leave")
        self.assertEqual(data["sources"][0]["score"], 0.91)

    # 14. SSE done event format
    def test_sse_done_event(self):
        from app import sse

        event_str = sse("done")
        data = json.loads(event_str.replace("data: ", "").strip())
        self.assertEqual(data["type"], "done")

    # 15. SSE error event format
    def test_sse_error_event(self):
        from app import sse

        event_str = sse("error", message="Database connection failed")
        data = json.loads(event_str.replace("data: ", "").strip())
        self.assertEqual(data["type"], "error")
        self.assertEqual(data["message"], "Database connection failed")

    # Context builder & prompt injection verification
    def test_rag_context_and_system_prompt(self):
        results = [
            SearchResult(
                document_id="doc_1",
                document_title="Employee Leave Policy",
                content="Employees receive 12 casual leaves.",
                page_number=12,
                section="Casual Leave",
                score=0.95,
            )
        ]
        context = build_rag_context(results)
        self.assertIn("SOURCE 1", context)
        self.assertIn("Document: Employee Leave Policy", context)
        self.assertIn("Section: Casual Leave", context)
        self.assertIn("Page: 12", context)
        self.assertIn("Employees receive 12 casual leaves.", context)

        prompt = format_rag_system_prompt("You are a helpful AI assistant.", context)
        self.assertIn("COMPANY KNOWLEDGE CONTEXT", prompt)
        self.assertIn("INSTRUCTIONS FOR ANSWERING WITH COMPANY KNOWLEDGE", prompt)
        self.assertIn("Base your answer strictly on the provided company sources", prompt)


if __name__ == "__main__":
    unittest.main()

