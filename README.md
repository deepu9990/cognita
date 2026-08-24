<img src="frontend/public/logo-wordmark.svg" alt="Cognita" width="190" />

_Your AI workspace._

A full-stack chat application powered by the Qwen3 4B model running on your own machine or your own GPU host. No cloud LLM API is used.

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
NODE_ENV=development
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/local_gpt
JWT_ACCESS_SECRET=replace-with-a-long-random-string
JWT_REFRESH_SECRET=replace-with-a-different-long-random-string
FRONTEND_URL=http://localhost:5173
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:5000/api/auth/google/callback
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=qwen3:4b
SYSTEM_PROMPT=You are a helpful AI assistant. Give clear, accurate and concise answers. When providing code, provide complete working examples.
```

Both JWT secrets must be at least 32 characters. The backend refuses to start if any required variable is missing or invalid.

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
