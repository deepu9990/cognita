# Local GPT Chat

A full-stack GPT-style chat application powered by the local Ollama model `qwen3:4b`. No cloud LLM API is used.

## Prerequisites

- Node.js 18+
- npm
- Ollama installed locally
- The Qwen3 4B model

Install Ollama from [ollama.com](https://ollama.com), then download the model:

```bash
ollama pull qwen3:4b
```

You can verify the model independently with:

```bash
ollama run qwen3:4b
```

## Run The Backend

```bash
cd backend
npm install
copy .env.example .env
npm run dev
```

The API runs at `http://localhost:5000`. The health endpoint is `http://localhost:5000/api/health`.

## Run The Frontend

In a second terminal:

```bash
cd frontend
npm install
copy .env.example .env
npm run dev
```

Open `http://localhost:5173` in your browser.

## Architecture

```text
React + TypeScript + Vite
          |
          | HTTP / Server-Sent Events
          v
Express + TypeScript
          |
          v
Ollama at localhost:11434
          |
          v
Qwen3 4B running locally
```

The frontend sends the current conversation to `POST /api/chat/stream`. The backend adds the configured system prompt, forwards the history to Ollama, and writes each actual Ollama token chunk as an SSE event. React appends each chunk to the in-progress assistant message. The Stop button cancels the browser request and closes the server-side stream.

## Configuration

Backend settings are in `backend/.env`:

```env
PORT=5000
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=qwen3:4b
SYSTEM_PROMPT=You are a helpful AI assistant. Give clear, accurate and concise answers. When providing code, provide complete working examples.
```

Frontend settings are in `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000
```

Actual `.env` files are ignored by git. Use the example files as templates.
