import { API_URL, apiFetch } from "./apiClient";
import type { ChatMessage } from "../types/chat.types";

interface StreamEvent {
  content: string;
}

export interface HealthStatus {
  ollama: boolean;
  model: string;
  connection: "local" | "remote" | "unavailable";
  host: string | null;
}

export interface StreamMeta {
  conversationId: string;
  title?: string;
}

export interface StreamOptions {
  conversationId?: string;
  temporary?: boolean;
  onChunk: (content: string) => void;
  onMeta?: (meta: StreamMeta) => void;
  signal?: AbortSignal;
}

export async function fetchHealthStatus(
  signal?: AbortSignal,
): Promise<HealthStatus> {
  const response = await fetch(`${API_URL}/api/health`, {
    signal,
    credentials: "include",
  });
  if (!response.ok) throw new Error(await getError(response));
  return (await response.json()) as HealthStatus;
}

export async function sendMessage(
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const response = await apiFetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: messages.map(({ role, content }) => ({ role, content })),
    }),
    signal,
  });
  if (!response.ok) throw new Error(await getError(response));
  const data = (await response.json()) as { message?: { content?: string } };
  return data.message?.content ?? "";
}

export async function streamChat(
  messages: ChatMessage[],
  options: StreamOptions,
): Promise<void> {
  const { conversationId, temporary, onChunk, onMeta, signal } = options;

  const response = await apiFetch("/api/chat/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      messages: messages.map(({ role, content }) => ({ role, content })),
      conversationId,
      temporary,
    }),
    signal,
  });
  if (!response.ok) throw new Error(await getError(response));
  if (!response.body)
    throw new Error("The response did not include a readable stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const event of events) {
        const dataLine = event
          .split("\n")
          .find((line) => line.startsWith("data: "));
        if (!dataLine) continue;
        const data = dataLine.slice(6);
        if (data === "[DONE]") return;
        if (event.includes("event: error")) {
          const parsed = JSON.parse(data) as { error?: string };
          throw new Error(parsed.error ?? "The stream was interrupted.");
        }
        if (event.includes("event: meta")) {
          onMeta?.(JSON.parse(data) as StreamMeta);
          continue;
        }
        const parsed = JSON.parse(data) as StreamEvent;
        onChunk(parsed.content);
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}

async function getError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}
