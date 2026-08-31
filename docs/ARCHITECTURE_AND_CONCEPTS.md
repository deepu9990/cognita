# Part 1: Full-Stack Architecture, Real-Time Streaming & System Design

This document covers the architectural principles, web concepts, networking models, and security designs implemented in the **Cognita AI** platform.

---

## Table of Contents

1. [Backend-for-Frontend (BFF) Pattern](#1-backend-for-frontend-bff-pattern)
2. [Server-Sent Events (SSE) vs WebSockets vs Polling](#2-server-sent-events-sse-vs-websockets-vs-polling)
3. [Authentication, Token Rotation & Session Management](#3-authentication-token-rotation--session-management)
4. [Fault-Tolerant Proxying, Fallbacks & Circuit Breaking](#4-fault-tolerant-proxying-fallbacks--circuit-breaking)
5. [Event-Driven Asynchronous Tasks (LLM Title Generation)](#5-event-driven-asynchronous-tasks-llm-title-generation)
6. [State Management & UI Hydration](#6-state-management--ui-hydration)

---

## 1. Backend-for-Frontend (BFF) Pattern

```
┌─────────────────┐       HTTP / SSE        ┌───────────────────────┐
│ React + Vite UI │ ◄─────────────────────► │ Express BFF (Node.js) │
└─────────────────┘                         └───────────┬───────────┘
                                                        │
                      ┌─────────────────────────────────┼─────────────────────────────────┐
                      ▼                                 ▼                                 ▼
           ┌──────────────────────┐          ┌──────────────────────┐          ┌──────────────────────┐
           │ MongoDB Atlas        │          │ Remote FastAPI (GPU) │          │ Local Ollama         │
           │ (Users/Sessions/Conv)│          │ (Qwen 4B / RAG DB)   │          │ (Fallback Inference) │
           └──────────────────────┘          └──────────────────────┘          └──────────────────────┘
```

### What is it?

The **Backend-for-Frontend (BFF)** pattern is an architectural design where a dedicated backend server serves as an intermediary layer tailor-made specifically for the user-facing client application (web, mobile, etc.), decoupling the frontend from raw downstream microservices or compute hosts.

### Why do we use it in Cognita?

1. **Security & Credential Shielding**: The browser never directly touches database credentials (`MONGODB_URI`), vector database credentials (`DATABASE_URL`), or private inference host auth tokens (`NGROK_AUTHTOKEN`, `HF_TOKEN`). All secrets remain safely stored on the server.
2. **Protocol Unification**: The AI runtime might be running a remote FastAPI server on a Kaggle/Colab GPU, a local Ollama instance on `localhost:11434`, or vLLM. The frontend should not need to understand whether it is talking to PyTorch, Ollama, or Hugging Face. The Node.js BFF exposes a clean, standardized `/api/chat/stream` contract.
3. **Database Persistence & Session Scoping**: The BFF orchestrates saving messages, enforcing authentication, verifying user ownership, and caching conversation history before relaying the request to the raw LLM inference engine.

### How is it implemented?

- **Frontend Client**: `frontend/src/services/apiClient.ts` and `frontend/src/services/chatApi.ts` communicate exclusively with Express via `/api/*`.
- **Node.js Gateway**: `backend/src/server.ts` mounts routing controllers:
  - `/api/auth`: Identity, session issuance, OAuth.
  - `/api/conversations`: Conversation management, history fetching, deletion.
  - `/api/chat`: AI interaction, SSE streaming relay, health checks.
- **Inference Service Layer**: `backend/src/services/inference.service.ts` resolves the target host (`OLLAMA_HOST` vs `INFERENCE_HOST`), negotiates protocols, and handles streaming transformations.

---

## 2. Server-Sent Events (SSE) vs WebSockets vs Polling

### What is it?

Real-time streaming is the mechanism of sending generated tokens to the browser incrementally as the neural network decodes them, rather than waiting 10-30 seconds for the entire paragraph to finish generating.

### Comparison Table

| Feature                       | Server-Sent Events (SSE) _(Used in Cognita)_         | WebSockets                                   | Long Polling                      |
| :---------------------------- | :--------------------------------------------------- | :------------------------------------------- | :-------------------------------- |
| **Protocol**                  | Standard HTTP/1.1 or HTTP/2                          | WS / WSS (TCP handshake upgrade)             | Repeated HTTP requests            |
| **Direction**                 | Unidirectional (Server -> Client)                    | Bidirectional (Full Duplex)                  | Request -> Response               |
| **Firewall / Proxy Friendly** | **Yes** (Runs over standard 80/443, no proxy issues) | Often blocked by corporate firewalls/proxies | Yes, but high overhead            |
| **Reconnection**              | Built-in native browser auto-reconnect               | Manual implementation needed                 | Manual implementation             |
| **Data Format**               | UTF-8 Text Streams (`text/event-stream`)             | Binary or Text frames                        | JSON payloads                     |
| **Overhead**                  | Very Low (single persistent HTTP connection)         | Low after handshake, complex state           | Very High (repeated HTTP headers) |

### Why SSE for LLM Chat?

LLM generation is naturally **unidirectional**: the user sends a complete message prompt once, and the model streams back dozens or hundreds of generated tokens over several seconds. WebSockets introduce unnecessary bidirectional state complexity, connection keep-alives, and proxy routing headaches (especially through reverse tunnels like Ngrok). SSE is the industry standard (used by OpenAI, Anthropic, and Google) for text streaming.

### How is it implemented?

1. **FastAPI (Notebook Host)**:
   In `notebook/app.py`, the `/chat` endpoint yields tokens using an async generator wrapped in `StreamingResponse(media_type="text/event-stream")`:
   ```python
   def sse(event_type: str, **payload: object) -> str:
       return f"data: {json.dumps({'type': event_type, **payload}, ensure_ascii=False)}\n\n"
   ```
2. **Express BFF (Relay & Transformation)**:
   In `backend/src/controllers/chat.controller.ts`, headers are set explicitly to disable buffering:
   ```typescript
   response.status(200).set({
     "Content-Type": "text/event-stream",
     "Cache-Control": "no-cache, no-transform",
     Connection: "keep-alive",
     "X-Accel-Buffering": "no", // Disables Nginx/reverse proxy output buffering
   });
   ```
3. **Frontend Reader**:
   In `frontend/src/services/chatApi.ts`, the browser reads the raw HTTP response stream using the Fetch `ReadableStreamDefaultReader` and `TextDecoder`, splitting events on `\n\n` boundaries and parsing event envelopes (`event: meta`, `event: title`, `data: [...]`).

---

## 3. Authentication, Token Rotation & Session Management

```
┌──────────┐                     ┌────────────────────┐                     ┌──────────────────┐
│  Client  │ ── 1. POST /login ──► │ Express Auth Route │ ── 2. Query User ──► │  MongoDB Atlas   │
│ (Browser)│ ◄── 3. Set Cookie ─── │  (JWT Generation)  │ ◄── 3. User Doc ──── │ (bcrypt compare) │
└──────────┘  (AccessToken +      └────────────────────┘                     └──────────────────┘
               RefreshToken)
```

### Concepts Explained

- **JSON Web Token (JWT)**: A compact, URL-safe means of representing claims to be transferred between two parties. Composed of Header, Payload, and Signature (`HMAC-SHA256`).
- **Access Token**: Short-lived credential (e.g. 15 minutes) carrying the user ID and role claims, allowing fast stateless authentication on every request without constant database queries.
- **Refresh Token**: Long-lived credential (e.g. 7 days) stored securely in the database. Used exclusively to obtain a new access token when the current access token expires.
- **HTTP-Only Cookies**: Cookies marked with `HttpOnly; Secure; SameSite=Strict`. JavaScript running in the browser cannot read these cookies, providing absolute immunity against Cross-Site Scripting (XSS) token theft.

### Why Token Rotation?

If a refresh token were permanent, a stolen refresh token could be used forever. With **Token Rotation**, every time a refresh token is exchanged for a new access token, the old refresh token is invalidated, and a brand new refresh token is issued. If a compromised refresh token is reused, the server detects the token collision, immediately revokes the entire token family, and forces re-authentication.

### Implementation in Cognita

- Handled in `backend/src/controllers/auth.controller.ts` and `backend/src/services/auth.service.ts`.
- Passwords hashed using `bcryptjs` with high salt work factors.
- Google OAuth 2.0 flow integrated via Google identity endpoints.

---

## 4. Fault-Tolerant Proxying, Fallbacks & Circuit Breaking

### What is it?

When interacting with AI hardware, remote notebook instances (Google Colab / Kaggle) frequently disconnect, hit runtime timeouts, or restart. Fault-tolerant proxying ensures that runtime downtime does not crash the web server.

### How Cognita Achieves Fault Tolerance:

1. **Dual Host Resolution (`INFERENCE_HOST` & `INFERENCE_FALLBACK_HOST`)**:
   In `backend/src/services/inference.service.ts`, the service maintains a list of potential inference hosts. If the primary host (e.g., Kaggle Ngrok tunnel) drops connection or times out, the client automatically catches the network exception and attempts the request against the fallback host (e.g. local Ollama instance).
2. **Protocol Negotiation**:
   The service inspects host URLs. If the host ends with `.ngrok-free.dev` or port `8000`, it speaks the **FastAPI streaming protocol**; if it points to port `11434`, it speaks the native **Ollama REST protocol**.
3. **Tunnel Warning Bypass**:
   Ngrok free tier displays an interstitial HTML warning page for browser requests. Cognita automatically injects `ngrok-skip-browser-warning: 69420` headers on all server-to-server HTTP calls to bypass this blocker.

---

## 5. Event-Driven Asynchronous Tasks (LLM Title Generation)

### What is it?

When a user begins a new chat by typing `"How do I configure pgvector on AWS RDS?"`, naming the conversation `"How do I configure pgvector on AWS RDS?"` is unreadable in a sidebar. Ideally, an LLM summarizes it creatively as `"Configuring RDS pgvector"`.

### The Problem

If the server waits for the LLM to generate the title _before_ streaming the assistant's answer, the user experiences 2-3 seconds of initial latency (Time-to-First-Token degradation).

### The Solution: Asynchronous Multiplexed SSE

1. When the user sends their message, the conversation is immediately created with a fast, deterministic truncated title: `buildTitle(firstMessage)`.
2. The assistant's reply streams instantly to the user without any initial delay.
3. Once the stream ends, the backend fires an asynchronous background LLM call:
   ```text
   Generate a short, creative title (max 8 words) for a conversation that starts with this message.
   User: ...
   Assistant: ...
   ```
4. When the title is ready, the backend sends an `event: title` SSE frame through the open connection:
   ```text
   event: title
   data: {"conversationId": "...", "title": "Configuring RDS pgvector"}
   ```
5. The frontend (`frontend/src/components/ChatWindow.tsx`) intercepts this event and calls `upsert()`, smoothly updating the conversation title in the sidebar in real time without refreshing the page!

---

## 6. State Management & UI Hydration

### What is it?

UI Hydration and reactive state synchronization ensure that messages, model availability, and active conversations remain reactive, responsive, and resilient against reloads.

### Key Concepts:

- **Temporary Chats (`Ghost Mode`)**: For quick experiments, users can toggle temporary chat mode. In this mode, messages exist purely in React component state memory and are never persisted to MongoDB Atlas.
- **Model Selector State & Health Polling**: The frontend runs a background polling heartbeat every 10 seconds to `GET /api/health`. If the remote Kaggle runtime goes to sleep, the UI instantly switches the model chip to `Offline` and renders a warning banner, preventing failed user submissions.
- **Auto-resizing Textareas**: The message input automatically computes scroll heights dynamically up to `180px` before switching to a scrollbar, providing a clean chat interface.
