<img src="frontend/public/logo-wordmark.svg" alt="Cognita" width="190" />

_Your AI workspace._

A full-stack chat application that runs against any model you control. Nothing is sent to a hosted LLM provider. Point it at a model on your own machine, or at a GPU notebook on Google Colab or Kaggle when you need more headroom.

The current default is **Qwen3 4B**, but the model is configuration, not a dependency. Swap `OLLAMA_MODEL` for any model your host serves.

## Prerequisites

- Node.js 18+
- npm
- MongoDB (Atlas or a local `mongod`)
- A model host, either local or remote (see below)

### Option A: Local model with Ollama

Install Ollama from [ollama.com](https://ollama.com), then pull whichever model you want:

```bash
ollama pull qwen3-4b
```

Any Ollama model works, for example:

```bash
ollama pull llama3.1:8b
ollama pull mistral
ollama pull deepseek-r1:7b
```

Set `OLLAMA_MODEL` to match the name you pulled. You can verify a model independently with `ollama run <model>`.

### Option B: Remote GPU on Colab or Kaggle

When your machine cannot run the model comfortably, serve it from a free GPU notebook and expose it with a tunnel such as ngrok. Set `OLLAMA_HOST` to the public tunnel URL.

The backend speaks two protocols and picks one automatically from the host name:

- **Ollama protocol** for normal hosts, using `/api/chat` and `/api/tags`
- **Notebook protocol** for `ngrok-free.dev` and `ngrok-free.app` hosts, using `POST /chat` and `GET /health`

The notebook endpoint should accept `{ messages, max_new_tokens }` and stream back Server-Sent Events shaped as `data: {"content": "..."}`, ending with `data: [DONE]`. A FastAPI app wrapping a `transformers` pipeline satisfies this. The required `ngrok-skip-browser-warning` header is sent for you.

Set `OLLAMA_FALLBACK_HOST` to a second host and the backend will try it whenever the primary is unreachable, which is useful when a notebook session expires.

## Run The Backend

```bash
cd backend
npm install
copy .env.example .env
npm run dev
```

The API runs at `http://localhost:5000`. The health endpoint is `http://localhost:5000/api/health`, which reports the resolved model host and whether it is `local` or `remote`.

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
          |  Ollama protocol        Notebook protocol
          |  /api/chat              POST /chat (SSE)
          v                         v
Local model host            Colab / Kaggle GPU via tunnel
(Ollama, default            (FastAPI + transformers,
 localhost:11434)            any model)
```

The frontend sends the current conversation to `POST /api/chat/stream`. The backend adds the configured system prompt, forwards the history to whichever host is configured, and relays each token chunk as an SSE event. React appends each chunk to the in-progress assistant message. The Stop button cancels the browser request and closes the server-side stream, and any text generated up to that point is still saved.

## Configuration

Backend settings are in `backend/.env`:

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/cognita
JWT_ACCESS_SECRET=replace-with-a-long-random-string
JWT_REFRESH_SECRET=replace-with-a-different-long-random-string
FRONTEND_URL=http://localhost:5173
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:5000/api/auth/google/callback

# Local model host, or a tunnel URL for a Colab/Kaggle notebook.
OLLAMA_HOST=http://localhost:11434
# Optional second host, tried when the primary is unreachable.
OLLAMA_FALLBACK_HOST=
# Any model your host serves. Qwen3 4B is only the current default.
OLLAMA_MODEL=qwen3-4b
# Generation cap, used by the notebook protocol.
OLLAMA_MAX_NEW_TOKENS=2000
SYSTEM_PROMPT=You are a helpful AI assistant. Give clear, accurate and concise answers. When providing code, provide complete working examples.
```

Both JWT secrets must be at least 32 characters. The backend refuses to start if any required variable is missing or invalid.

### Switching models

Change `OLLAMA_MODEL` and restart the backend. Nothing else needs to change, since the model name is passed straight through to the host. For a remote notebook, the model is whatever the notebook loaded, and `OLLAMA_MODEL` is only used as a label.

### MongoDB

Create a free cluster on MongoDB Atlas, add a database user, allow your IP in Network Access, then copy the connection string into `MONGODB_URI`. A local `mongod` instance works too.

### Google sign-in

In the Google Cloud console, create an OAuth client of type Web application and add `http://localhost:5000/api/auth/google/callback` as an authorized redirect URI. Copy the client id and secret into `.env`. Leaving these blank disables the Google button and returns a clear error if it is used.

## Accounts And History

- Email/password signup and login, plus Google sign-in
- Sessions use httpOnly cookies with a short-lived access token and a rotating refresh token
- Conversations and messages are stored per user in MongoDB and appear in the sidebar
- Conversations can be renamed and deleted
- Temporary chat mode streams normally but writes nothing to the database and disappears on refresh

## API

| Method | Endpoint                 | Notes                                                     |
| ------ | ------------------------ | --------------------------------------------------------- |
| POST   | `/api/auth/signup`       | Creates an account and starts a session                   |
| POST   | `/api/auth/login`        | Starts a session                                          |
| POST   | `/api/auth/refresh`      | Rotates the refresh token                                 |
| POST   | `/api/auth/logout`       | Revokes the refresh token                                 |
| GET    | `/api/auth/me`           | Current user                                              |
| GET    | `/api/auth/google`       | Starts the Google redirect flow                           |
| GET    | `/api/conversations`     | Lists the signed-in user's conversations                  |
| GET    | `/api/conversations/:id` | Conversation with its messages                            |
| PATCH  | `/api/conversations/:id` | Renames a conversation                                    |
| DELETE | `/api/conversations/:id` | Deletes a conversation                                    |
| POST   | `/api/chat/stream`       | Streams a reply, accepts `conversationId` and `temporary` |

Frontend settings are in `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000
```

Actual `.env` files are ignored by git. Use the example files as templates.
