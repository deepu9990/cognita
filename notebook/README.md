# Cognita GPU Notebook & RAG Service

This folder contains the FastAPI inference and RAG service used when Cognita runs models on a GPU notebook (Google Colab, Kaggle) or a local machine. It implements:
- `GET /health` (Model, CUDA, Tavily, and RAG database status)
- `GET /models` (Available causal LM models)
- `POST /chat` (SSE streaming with deterministic routing across Company RAG, Web Search, Both, and Direct LLM)
- `POST /rag/search` (Permission-aware vector search)
- `POST /documents`, `GET /documents`, `GET /documents/{id}`, `DELETE /documents/{id}`, `POST /documents/{id}/reindex` (Document ingestion and management)

---

## Architecture Overview

```text
React Frontend
      ↓ (SSE)
Node / Express Backend
      ↓ (SSE)
FastAPI Service
      ↓
 Query Router
 ├── COMPANY_RAG  →  Retriever → PgVector (PostgreSQL + pgvector) → Structured RAG Context
 ├── WEB_SEARCH   →  Tavily API
 ├── BOTH         →  RAG Context + Tavily Tool Result
 └── DIRECT_LLM   →  Direct Inference
      ↓
 Qwen3-4B on GPU
      ↓
 SSE Stream: [status, thinking, sources, content, done]
```

---

## Quick Start on Kaggle (Single Non-Blocking Command)

1. Upload or clone the `notebook/` directory to Kaggle (or open `cognita.ipynb`).
2. Turn on **GPU accelerator** (T4, P100, or A100).
3. Add `NGROK_AUTHTOKEN` in **Kaggle Secrets** (`Add-ons` -> `Secrets`).
4. Run in a single cell:
   ```python
   !pip install -q -r requirements.txt && python start_all.py
   ```
   This automatically loads the models, starts the FastAPI server in a background thread, starts the ngrok tunnel, and prints your public URL!

---

## Setup & Environment

Use Python 3.10 or newer and a CUDA-compatible PyTorch installation for GPU inference.

```powershell
cd notebook
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Set these values in `.env`:

```env
NGROK_AUTHTOKEN=your-ngrok-auth-token
TAVILY_API_KEY=your-tavily-api-key
DATABASE_URL=postgresql://user:password@host:5432/cognita_rag
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
EMBEDDING_DIMENSION=384
CHUNK_SIZE=500
CHUNK_OVERLAP=100
RAG_TOP_K=4
RAG_MIN_SCORE=0.5
```

> **Note**: If `DATABASE_URL` is empty, FastAPI and normal Qwen inference continue to work normally, and `/health` reports `"rag": {"available": false}`.

---

## Database Setup (PostgreSQL + pgvector)

To enable RAG storage and vector retrieval:

1. Create a PostgreSQL database (e.g. locally, Supabase, Neon, or RDS) with `pgvector` enabled.
2. Run the migration script:
   ```bash
   psql $DATABASE_URL -f rag/migrations/001_initial_schema.sql
   ```
3. Set `DATABASE_URL` in `notebook/.env`.

---

## Running Unit Tests

Run the full suite of unit tests covering document loaders (PDF, DOCX, TXT, MD), chunking, embedding, vector retrieval, tenant isolation, permissions, score thresholding, version selection, routing, and SSE events:

```bash
python -m unittest discover -s tests -p "test_*.py"
```
