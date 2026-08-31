# Part 3: Enterprise RAG, Vector Search & pgvector Deep Dive

This document covers the theory, mathematics, database schemas, and implementation details of the **Enterprise Retrieval-Augmented Generation (RAG)** pipeline in **Cognita AI**.

---

## Table of Contents
1. [The RAG Paradigm & Why Enterprise RAG Differs](#1-the-rag-paradigm--why-enterprise-rag-differs)
2. [Document Ingestion, Parsing & Chunking Strategies](#2-document-ingestion-parsing--chunking-strategies)
3. [Dense Vector Embeddings & Similarity Mathematics](#3-dense-vector-embeddings--similarity-mathematics)
4. [PostgreSQL + pgvector & HNSW Indexing](#4-postgresql--pgvector--hnsw-indexing)
5. [Multi-Tenancy, Versioning & Access Control (RBAC/ABAC)](#5-multi-tenancy-versioning--access-control-rbacabac)
6. [Intelligent Query Routing](#6-intelligent-query-routing)
7. [EnterpriseRAG-Bench & Evaluation Methodology](#7-enterpriserag-bench--evaluation-methodology)

---

## 1. The RAG Paradigm & Why Enterprise RAG Differs

### What is RAG?
**Retrieval-Augmented Generation (RAG)** is an AI architecture that enhances large language model responses by retrieving authoritative, domain-specific facts from an external knowledge store before generating a response.

```
User Query: "What is our Q3 bereavement leave policy?"
       │
       ▼
1. Retrieval Engine (pgvector) ──► Finds top relevant policy snippets from company docs
       │
       ▼
2. Context Synthesizer ──────────► Injects snippets + anti-hallucination prompt
       │
       ▼
3. Causal LLM (Qwen) ───────────► Generates grounded answer with exact policy numbers & citations
```

### The Enterprise RAG Challenge
Public RAG demos usually index public web pages or static Wikipedia dumps where all users share identical access rights and facts never change. In contrast, **Enterprise RAG** must solve:
1. **Multi-Tenancy**: Organization A must never see Organization B's documents under any circumstances.
2. **Access Control (RBAC/ABAC)**: An intern in Marketing should not be able to retrieve an executive compensation spreadsheet or unreleased engineering security keys.
3. **Temporal Validity & Document Versioning**: If a 2024 policy is superseded by a 2026 revision, the retrieval engine must prioritize active versions and filter expired documents.
4. **Data Fragmentation**: Knowledge lives across diverse tools—Confluence runbooks, Linear tickets, Slack chats, and Google Drive PDFs.

---

## 2. Document Ingestion, Parsing & Chunking Strategies

### 1. Document Parsing (`notebook/rag/loaders.py`)
Cognita implements native multi-format parsers:
- **PDF**: Page-by-page extraction using `pypdf`, preserving page numbers for exact user citations.
- **DOCX**: XML paragraph extraction using `python-docx`.
- **Markdown & Text**: Preserves headers (`#`, `##`) and bullet hierarchies.

### 2. Chunking Mechanics (`notebook/rag/chunking.py`)
Why not embed the whole document at once?
- LLM embedding models have finite token input windows (e.g. 512 tokens for MiniLM).
- Large chunks dilute semantic density, degrading retrieval precision.

**Cognita's Strategy: Sliding Window with Paragraph Boundary Preservation**:
- **Target Size**: 500 characters.
- **Overlap**: 100 characters.
- **Boundary Awareness**: If a chunk boundary lands mid-sentence or mid-paragraph, the chunker respects newline breaks `\n\n` to ensure thoughts are never sliced in half.
- **Metadata Inheritance**: Every chunk inherits its parent document's `title`, `filename`, `page_number`, `section`, and `organization_id`.

```
[--- Paragraph 1 (300 chars) ---] \n\n [--- Paragraph 2 (250 chars) ---]
└──────────────── Chunk 1 (500 chars) ────────────────┘
                         └── Overlap (100) ──┘
                         └──────────────── Chunk 2 (500 chars) ────────────────┘
```

---

## 3. Dense Vector Embeddings & Similarity Mathematics

### What is an Embedding?
An embedding model converts text into a fixed-length dense vector of floating-point numbers in a high-dimensional continuous semantic space:

$$\vec{v} = \text{Embed}(\text{"casual leave policy"}) \in \mathbb{R}^{384}$$

Texts with similar meanings map to nearby coordinates in this 384-dimensional space, regardless of the specific vocabulary used.

### Model Choice: `sentence-transformers/all-MiniLM-L6-v2`
- **Embedding Dimensions**: 384
- **Model Size**: ~90 MB (ultra-lightweight, runs in milliseconds on CPU or GPU)
- **Quality**: Trained on over 1 billion sentence pairs for semantic similarity and search.

### Cosine Similarity Mathematics
To measure how closely a user's question vector $\vec{q}$ matches a stored document chunk vector $\vec{d}$, Cognita computes **Cosine Similarity**:

$$\text{CosineSimilarity}(\vec{q}, \vec{d}) = \cos(\theta) = \frac{\vec{q} \cdot \vec{d}}{\|\vec{q}\|_2 \|\vec{d}\|_2} = \frac{\sum_{i=1}^{n} q_i d_i}{\sqrt{\sum_{i=1}^{n} q_i^2} \sqrt{\sum_{i=1}^{n} d_i^2}}$$

- $+1.0$: Identical semantic direction.
- $0.0$: Orthogonal (completely unrelated).
- $-1.0$: Diametrically opposed.

In PostgreSQL, the `vector_cosine_ops` operator computes **Cosine Distance**:

$$\text{CosineDistance}(\vec{q}, \vec{d}) = 1 - \text{CosineSimilarity}(\vec{q}, \vec{d})$$

---

## 4. PostgreSQL + pgvector & HNSW Indexing

### Why pgvector over dedicated vector databases (Pinecone / Milvus)?
Dedicated vector stores isolate vectors from relational tables. If you need to filter:
*"Find chunks similar to X WHERE organization_id = 'acme' AND department IN ('HR', 'All') AND effective_until > NOW()"*,
pure vector stores struggle with pre-filtering vs post-filtering trade-offs.

With **PostgreSQL + pgvector**:
- Relational metadata, user permissions, version histories, and vector embeddings reside in the **same database engine**.
- Queries execute within single ACID transactions using mature query planners.

### Database Schema (`notebook/rag/migrations/001_initial_schema.sql`):

```sql
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Multi-Tenant Organizations
CREATE TABLE organizations (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL
);

-- 2. Documents & Permissions
CREATE TABLE documents (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    filename VARCHAR(512) NOT NULL,
    title VARCHAR(512) NOT NULL,
    version VARCHAR(32) DEFAULT 'v1',
    is_active BOOLEAN DEFAULT TRUE,
    is_public BOOLEAN DEFAULT FALSE,
    allowed_departments TEXT[] DEFAULT '{}',
    allowed_roles TEXT[] DEFAULT '{}',
    effective_from TIMESTAMP WITH TIME ZONE,
    effective_until TIMESTAMP WITH TIME ZONE
);

-- 3. Document Chunks with Vectors
CREATE TABLE document_chunks (
    id VARCHAR(128) PRIMARY KEY,
    document_id VARCHAR(64) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    document_version_id VARCHAR(64) NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding vector(384),
    section VARCHAR(512) DEFAULT '',
    page_number INTEGER DEFAULT 1,
    chunk_index INTEGER DEFAULT 0
);
```

### HNSW (Hierarchical Navigable Small World) Indexing
Searching 500,000 vectors via exact flat scanning ($O(N)$) is slow. Cognita builds an **HNSW index**:

```sql
CREATE INDEX idx_chunks_embedding_hnsw 
ON document_chunks 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

#### How HNSW works:
- Constructs a multi-layer graph where upper layers have long-distance skip connections (expressways) and bottom layers have dense local connections.
- Enables logarithmic time search: **$O(\log N)$**.
- **`m = 16`**: Maximum number of bidirectional connection links per node.
- **`ef_construction = 64`**: Size of dynamic candidate list evaluated during index construction.

---

## 5. Multi-Tenancy, Versioning & Access Control (RBAC/ABAC)

Cognita enforces permissions at the **SQL database query layer**, guaranteeing that unauthorized data never leaks into the prompt:

In `notebook/rag/database.py`:

```sql
SELECT 
    c.document_id,
    d.title AS document_title,
    c.content,
    c.page_number,
    c.section,
    d.version,
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
      OR (%(dept)s IS NOT NULL AND %(dept)s = ANY(d.allowed_departments))
      OR (%(roles)s && d.allowed_roles)
      OR (cardinality(d.allowed_departments) = 0 AND cardinality(d.allowed_roles) = 0)
  )
  AND (1 - (c.embedding <=> %(query_embedding)s::vector)) >= %(min_score)s
ORDER BY score DESC
LIMIT %(limit)s;
```

### Security Guarantees:
1. **Tenant Isolation**: `c.organization_id = %(org_id)s` prevents cross-company data leakage.
2. **Department Checking**: `%(dept)s = ANY(d.allowed_departments)`.
3. **Role Overlap Check**: `%(roles)s && d.allowed_roles` uses PostgreSQL array overlap operator `&&`.
4. **Temporal Scoping**: Filters out expired or not-yet-effective policies.
5. **Threshold Filter**: Drops chunks below `min_score` (e.g. 0.5) to avoid injecting irrelevant noise.

---

## 6. Intelligent Query Routing

In `notebook/rag/router.py`, user queries are classified before taking action:

```
                      ┌────────────────────────┐
                      │    Incoming Prompt     │
                      └───────────┬────────────┘
                                  │
                                  ▼
                   ┌───────────────────────────────┐
                   │    Query Intent Classifier    │
                   └──────────────┬────────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         ▼                        ▼                        ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  "COMPANY_RAG"   │    │   "WEB_SEARCH"   │    │   "DIRECT_LLM"   │
│ (Internal docs)  │    │  (External web)  │    │ (Creative / Code)│
└──────────────────┘    └──────────────────┘    └──────────────────┘
```

1. **`COMPANY_RAG`**: Queries containing internal entity keywords (*"policy", "leave", "runbook", "cluster", "oncall", "quarterly", "handbook"*). Queries Supabase pgvector.
2. **`WEB_SEARCH`**: Queries referencing external real-time events (*"latest news", "stock price", "weather", "today"*). Queries Tavily Web Search API.
3. **`BOTH`**: When internal policies reference external vendors or market benchmarks. Combines both contexts.
4. **`DIRECT_LLM`**: General reasoning, coding exercises, or casual conversation (*"Write a Python Fibonacci function"*). Directly streams from Qwen without unnecessary vector queries.

---

## 7. EnterpriseRAG-Bench & Evaluation Methodology

### What is EnterpriseRAG-Bench?
[EnterpriseRAG-Bench](https://github.com/onyx-dot-app/EnterpriseRAG-Bench) (Sun et al., 2026) is the first open benchmark for evaluating RAG on company internal data. It simulates a company called *"Redwood Inference"* across 500,000 documents and 500 ground-truth questions.

### 200-Document POC Composition:
`notebook/rag/ingest_bench_poc.py` downloads and ingests a balanced 200-document slice under 2.6 MB:
- **100 Confluence Docs**: Architectural designs, VPC deployment playbooks, triage runbooks.
- **45 Fireflies Docs**: Meeting transcripts and executive decision logs.
- **40 Linear Tickets**: Engineering bug reports and product sprint trackers.
- **15 HubSpot Records**: Customer accounts and sales deal stages.

### Running the Benchmark:
```bash
# 1. Ingest 200 documents
python rag/ingest_bench_poc.py 200

# 2. Evaluate accuracy against benchmark questions
python rag/evaluate_bench.py 10
```
This verifies your retrieval engine's top-K precision, recall, and semantic score distributions against real enterprise data.

