<p align="center">
  <img src="frontend/public/logo-wordmark.svg" alt="Cognita AI" width="240" />
</p>

<p align="center">
  <strong>Private, Enterprise-Grade AI Workspace with Real-Time Streaming, Multi-Tenant pgvector RAG, and GPU Inference.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/FastAPI-0.115+-009688?style=flat-square&logo=fastapi" alt="FastAPI" />
  <img src="https://img.shields.io/badge/PyTorch-2.0+-EE4C2C?style=flat-square&logo=pytorch" alt="PyTorch" />
  <img src="https://img.shields.io/badge/PostgreSQL-pgvector-336791?style=flat-square&logo=postgresql" alt="pgvector" />
  <img src="https://img.shields.io/badge/Express-Node.js-black?style=flat-square&logo=node.js" alt="Node.js" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/Tailwind-CSS-38B2AC?style=flat-square&logo=tailwind-css" alt="Tailwind" />
  <img src="https://img.shields.io/badge/MongoDB-Atlas-47A248?style=flat-square&logo=mongodb" alt="MongoDB" />
</p>

---

## 📖 Deep-Dive Concept Guides & Documentation

To understand the theory, math, and engineering behind every concept used in Cognita AI, explore our comprehensive multi-part learning modules:

- 📚 **[Part 1: Full-Stack Architecture, Real-Time Streaming & System Design](docs/ARCHITECTURE_AND_CONCEPTS.md)**
  - _BFF (Backend-for-Frontend) pattern, Server-Sent Events (SSE) vs WebSockets, JWT token rotation, HTTP-only cookie security, fault-tolerant proxying, and multiplexed asynchronous LLM title generation._
- 🧠 **[Part 2: Large Language Models, Quantization, GPU Computing & Serving](docs/LLM_AND_INFERENCE_DEEP_DIVE.md)**
  - _Autoregressive next-token prediction, 4-bit NF4 quantization (BitsAndBytes), VRAM calculation math, Hugging Face Transformers, Uvicorn ASGI lifecycle, PyNgrok reverse tunnels, and non-blocking Jupyter kernel daemon threads._
- 🔍 **[Part 3: Enterprise RAG, Vector Search & pgvector Deep Dive](docs/ENTERPRISE_RAG_AND_VECTOR_SEARCH.md)**
  - _Dense vector embeddings (`all-MiniLM-L6-v2`), cosine similarity math, PostgreSQL pgvector with HNSW indexing, multi-tenant RBAC/ABAC permission masking at SQL level, versioning/temporal validity, query routing, and EnterpriseRAG-Bench POC testing._

---

## 🏛️ System Architecture

```
                                    ┌───────────────────────────────────┐
                                    │    React 18 + Vite Web Client     │
                                    │ (Tailwind, Lucide, Radix, SSE)    │
                                    └─────────────────┬─────────────────┘
                                                      │
                                                      │ HTTP / Text-Event-Stream
                                                      ▼
                                    ┌───────────────────────────────────┐
                                    │      Express.js BFF Gateway       │
                                    │  (JWT Auth, Sessions, Proxying)   │
                                    └─────────┬───────────────┬─────────┘
                                              │               │
                        ┌─────────────────────┘               └─────────────────────┐
                        ▼                                                           ▼
     ┌──────────────────────────────────────┐                    ┌──────────────────────────────────────┐
     │            MongoDB Atlas             │                    │     Local Inference Engine (Ollama)  │
     │ (Users, Conversations, Auth Tokens)  │                    │    (Fallback: localhost:11434)       │
     └──────────────────────────────────────┘                    └──────────────────────────────────────┘
                                                                                    ▲
                                                                                    │ (Failover)
                                                                                    │
                                                                 ┌──────────────────┴───────────────────┐
                                                                 │   Remote GPU Host (Kaggle / Colab)   │
                                                                 │      Exposed via PyNgrok TLS         │
                                                                 │                                      │
                                                                 │  • FastAPI + Uvicorn ASGI Server     │
                                                                 │  • Qwen Models (4-bit NF4)           │
                                                                 │  • SentenceTransformers Embeddings   │
                                                                 │  • Query Intent Router & Web Search  │
                                                                 └──────────────────┬───────────────────┘
                                                                                    │
                                                                                    │ SQL + pgvector (HNSW)
                                                                                    ▼
                                                                 ┌──────────────────────────────────────┐
                                                                 │   Supabase PostgreSQL + pgvector     │
                                                                 │ (Multi-tenant Enterprise Knowledge)  │
                                                                 └──────────────────────────────────────┘
```

---

## ✨ Key Features

1. **Uncompromised Privacy**: Run models on your own machine or your own dedicated private GPU cloud notebooks. Zero proprietary user data is sent to closed third-party model providers.
2. **Real-Time Token Streaming**: True Server-Sent Events (SSE) with minimal time-to-first-token, live status messages, and source citations.
3. **4-Bit NF4 Quantization**: Run high-parameter models (Qwen 4B, Qwen 2.5 7B, Qwen 3.5 9B) within the free 16 GB VRAM limits of Kaggle/Colab NVIDIA T4 GPUs.
4. **Enterprise Multi-Tenant RAG**:
   - Organization-level tenancy isolation.
   - Department and Role-Based Access Control (RBAC/ABAC) filtering applied directly in PostgreSQL queries.
   - Temporal document validity dates (`effective_from`, `effective_until`).
   - Logarithmic-time vector similarity search with HNSW graphs (`vector_cosine_ops`).
5. **Intelligent Query Intent Router**: Automatically classifies incoming prompts into `COMPANY_RAG`, `WEB_SEARCH` (via Tavily), `BOTH`, or `DIRECT_LLM`.
6. **Automatic LLM Title Generation**: Conversations are titled asynchronously in the background by the LLM and update the sidebar in real time via SSE multiplexing.
7. **Non-Blocking Background Runner**: The notebook runtime runs FastAPI and PyNgrok in daemon threads, allowing concurrent execution of document ingestion and benchmark cells without freezing the notebook kernel.

---

## 🚀 Quickstart Guide

### 1. Database & Secrets Setup

1. **MongoDB Atlas**: Create a free M0 cluster and obtain your `MONGODB_URI`.
2. **Supabase PostgreSQL**: Create a free Supabase project and enable `pgvector`. Obtain your `DATABASE_URL`:
   ```env
   DATABASE_URL=postgresql://postgres.xxx:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
   ```
3. **Ngrok**: Create a free account at [ngrok.com](https://ngrok.com) to get your `NGROK_AUTHTOKEN`.

---

### 2. Start the AI Server & GPU Inference (Kaggle or Colab)

Upload [`notebook/cognita.ipynb`](notebook/cognita.ipynb) to Kaggle or Google Colab (with **GPU enabled**):

1. Add your secrets in **Kaggle Secrets** (`Add-ons -> Secrets`):
   - `NGROK_AUTHTOKEN`
   - `DATABASE_URL`
   - `TAVILY_API_KEY` (Optional)
2. Run **Cell 1**:
   ```python
   !pip install -q accelerate bitsandbytes fastapi uvicorn pyngrok python-dotenv tavily-python transformers sentence-transformers pypdf python-docx psycopg2-binary pgvector python-multipart
   ```
3. Run **Cell 2** _(Non-blocking!)_:
   ```python
   from start_all import start_background
   public_url = start_background()
   ```
   _The cell will load the models, connect Ngrok, print your public URL (e.g. `https://xyz.ngrok-free.dev`), and finish execution._
4. Run **Cell 3** _(Ingest 200 Enterprise Benchmark Documents into Supabase)_:
   ```python
   !python rag/ingest_bench_poc.py 200
   ```

---

### 3. Start the Backend (Node.js BFF)

In your local terminal:

```bash
cd backend
npm install
copy .env.example .env
```

Configure `backend/.env`:

```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
INFERENCE_HOST=https://xyz.ngrok-free.dev   # Paste your Ngrok public URL from Kaggle
INFERENCE_MODEL=qwen3-4b
JWT_ACCESS_SECRET=your_secret
JWT_REFRESH_SECRET=your_secret
FRONTEND_URL=http://localhost:5173
```

Start the backend:

```bash
npm run dev
```

---

### 4. Start the Frontend (React + Vite)

In a second local terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## 🧪 Testing & Verification

### Unit Tests

Cognita includes unit tests covering document parsing, chunking, embedding, vector retrieval, RBAC permissions, versioning, temporal validity, and query routing:

```bash
cd notebook
python -m unittest discover -s tests -p "test_*.py"
```

### Retrieval Benchmark Evaluation

Test precision and recall against the official [EnterpriseRAG-Bench](https://github.com/onyx-dot-app/EnterpriseRAG-Bench) question dataset:

```bash
cd notebook
python rag/evaluate_bench.py 10
```

---

## 📁 Repository Structure

```
cognita/
├── backend/                      # Node.js Express Backend-for-Frontend (BFF)
│   ├── src/
│   │   ├── config/              # Environment schema & validation
│   │   ├── controllers/         # Auth, chat, and conversation controllers
│   │   ├── middleware/          # JWT auth & error handling middleware
│   │   ├── models/              # Mongoose database models (Users, Chats)
│   │   ├── routes/              # Express API route declarations
│   │   ├── services/            # InferenceService, AuthService, ConversationService
│   │   └── utils/               # SSE formatting & helper utilities
│   └── package.json
│
├── frontend/                     # React 18 + Vite + Tailwind Client
│   ├── src/
│   │   ├── components/          # ChatWindow, ChatInput, MessageList, ModelPicker
│   │   ├── hooks/               # useConversations, useAuth, useTheme
│   │   ├── services/            # Fetch API client and SSE stream reader
│   │   └── types/               # TypeScript interface contracts
│   └── package.json
│
├── notebook/                     # Python GPU Inference & RAG Engine
│   ├── app.py                   # FastAPI ASGI server with async lifespan
│   ├── load_models.py           # BitsAndBytes 4-bit NF4 quantized model loader
│   ├── start_all.py             # Non-blocking Uvicorn thread & Ngrok tunnel runner
│   ├── cognita.ipynb            # 1-Click Kaggle/Colab execution notebook
│   ├── requirements.txt         # Python GPU dependencies
│   ├── data/                    # Downloaded benchmark documents (gitignored)
│   ├── tests/                   # Unit test suite for RAG & routing
│   └── rag/                     # Enterprise RAG Core Engine
│       ├── chunking.py          # Boundary-aware sliding window chunker
│       ├── context.py           # Anti-hallucination context formatter
│       ├── database.py          # PostgreSQL + pgvector client with HNSW indexing
│       ├── embeddings.py        # SentenceTransformers dense embedder
│       ├── evaluate_bench.py    # EnterpriseRAG-Bench question evaluator
│       ├── ingest_bench_poc.py  # 200-document slice downloader & batch ingester
│       ├── ingestion.py         # Multi-format ingestion pipeline
│       ├── loaders.py           # PDF, DOCX, TXT, MD parsers
│       ├── permissions.py       # RBAC / ABAC permission models
│       ├── retriever.py         # Top-K vector similarity retriever
│       ├── router.py            # Query intent router (RAG vs Web vs LLM)
│       ├── schemas.py           # Pydantic data schemas
│       ├── setup_supabase.py    # Supabase schema migration runner
│       └── migrations/          # SQL DDL migrations (001_initial_schema.sql)
│
└── docs/                         # In-Depth Learning & Concept Documentation
    ├── ARCHITECTURE_AND_CONCEPTS.md       # Part 1: System Design & Web Concepts
    ├── LLM_AND_INFERENCE_DEEP_DIVE.md      # Part 2: Quantization, GPU & Models
    └── ENTERPRISE_RAG_AND_VECTOR_SEARCH.md # Part 3: pgvector, HNSW & RAG Math
```

---

## 📄 License

Apache-2.0 License. Designed for privacy, sovereignty, and enterprise AI experimentation.
