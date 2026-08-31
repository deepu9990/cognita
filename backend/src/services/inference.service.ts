import { Ollama, type ChatResponse, type Message } from "ollama";
import dotenv from "dotenv";
import type {
  ChatMessage,
  ModelInfo,
  SourceItem,
} from "../types/chat.types.js";

dotenv.config();

const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful AI assistant. Give clear, accurate and concise answers. When providing code, provide complete working examples.";

type HostProtocol = "ollama" | "fastapi";

interface HostClient {
  host: string;
  protocol: HostProtocol;
  client: Ollama;
  headers: HeadersInit;
}

interface FastApiChatResponse {
  model?: string;
  response?: string;
}

interface FastApiStreamEvent {
  type?: "content" | "thinking" | "sources" | "status" | "done" | "error";
  content?: string;
  model?: string;
  error?: string;
  message?: string;
  sources?: SourceItem[];
}

export type StreamChatResponse = ChatResponse & {
  eventType?: "content" | "thinking" | "sources" | "status" | "done" | "error";
  sources?: SourceItem[];
  statusMessage?: string;
};

interface FastApiModelsResponse {
  models?: ModelInfo[];
}

export class InferenceService {
  private readonly clients: HostClient[];
  private readonly hosts: string[];
  private readonly model: string;
  private readonly systemPrompt: string;
  private readonly maxNewTokens: number;

  constructor() {
    const primaryHost =
      process.env.INFERENCE_HOST ?? process.env.OLLAMA_HOST ?? "";
    const fallbackHost =
      process.env.INFERENCE_FALLBACK_HOST ??
      process.env.OLLAMA_FALLBACK_HOST ??
      "";
    this.hosts = [primaryHost, fallbackHost]
      .map((host) => host.trim())
      .filter(Boolean)
      .filter((host, index, array) => array.indexOf(host) === index);
    this.clients = this.hosts.map((host) => {
      const headers = this.getHeadersForHost(host);
      return {
        host,
        protocol: this.getProtocolForHost(host),
        headers,
        client: new Ollama({ host, headers }),
      };
    });
    this.model =
      process.env.INFERENCE_MODEL ?? process.env.OLLAMA_MODEL ?? "qwen3-4b";
    this.maxNewTokens = Number(
      process.env.INFERENCE_MAX_NEW_TOKENS ??
        process.env.OLLAMA_MAX_NEW_TOKENS ??
        2000,
    );
    this.systemPrompt = process.env.SYSTEM_PROMPT ?? DEFAULT_SYSTEM_PROMPT;
  }

  getModel(): string {
    return this.model;
  }

  getHosts(): string[] {
    return [...this.hosts];
  }

  async getAvailabilityDetails(): Promise<{
    available: boolean;
    host: string | null;
    connection: "local" | "remote" | "unavailable";
  }> {
    for (const entry of this.clients) {
      const available =
        entry.protocol === "fastapi"
          ? await this.isFastApiAvailable(entry)
          : await this.isLocalInferenceAvailable(entry);
      if (available) {
        return {
          available: true,
          host: entry.host,
          connection: this.isLocalHost(entry.host) ? "local" : "remote",
        };
      }
    }

    return { available: false, host: null, connection: "unavailable" };
  }

  async isAvailable(): Promise<boolean> {
    const details = await this.getAvailabilityDetails();
    return details.available;
  }

  async getModels(): Promise<ModelInfo[]> {
    for (const entry of this.clients) {
      try {
        if (entry.protocol === "fastapi") {
          const response = await fetch(`${entry.host}/models`, {
            headers: entry.headers,
          });
          if (!response.ok) continue;
          const data = (await response.json()) as FastApiModelsResponse;
          if (Array.isArray(data.models)) return data.models;
          continue;
        }

        const response = await entry.client.list();
        return response.models.map((model) => ({
          id: model.name,
          name: model.name,
          description: "Available through the configured inference provider",
          loaded: true,
        }));
      } catch {
        // Try the configured fallback host.
      }
    }
    return [];
  }

  async chat(
    messages: ChatMessage[],
    model = this.model,
  ): Promise<ChatResponse> {
    let lastError: unknown;
    for (const entry of this.clients) {
      try {
        if (entry.protocol === "fastapi") {
          return await this.fastApiChat(entry, messages, model);
        }
        return await entry.client.chat({
          model,
          messages: this.toFormattedMessages(messages),
          stream: false,
        });
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError ?? new Error("No inference host configured.");
  }

  async *stream(
    messages: ChatMessage[],
    model = this.model,
  ): AsyncGenerator<StreamChatResponse> {
    let lastError: unknown;
    for (const entry of this.clients) {
      try {
        if (entry.protocol === "fastapi") {
          for await (const event of this.fastApiStream(
            entry,
            messages,
            model,
          )) {
            yield {
              model: event.model ?? model,
              created_at: new Date(),
              message: { role: "assistant", content: event.content ?? "" },
              done: false,
              done_reason: "stop",
              total_duration: 0,
              load_duration: 0,
              prompt_eval_count: 0,
              prompt_eval_duration: 0,
              eval_count: 0,
              eval_duration: 0,
              eventType: event.type ?? "content",
              sources: event.sources,
              statusMessage: event.message,
            };
          }
          return;
        }
        const response = await entry.client.chat({
          model,
          messages: this.toFormattedMessages(messages),
          stream: true,
        });
        for await (const chunk of response) {
          yield chunk;
        }
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError ?? new Error("No inference host configured.");
  }

  private toFormattedMessages(messages: ChatMessage[]): Message[] {
    return [
      { role: "system", content: this.systemPrompt },
      ...messages.map(({ role, content }) => ({ role, content })),
    ];
  }

  private isLocalHost(host: string): boolean {
    try {
      const url = new URL(host);
      return url.hostname === "localhost" || url.hostname === "127.0.0.1";
    } catch {
      const normalized = host.toLowerCase();
      return (
        normalized.includes("localhost") || normalized.includes("127.0.0.1")
      );
    }
  }

  private getProtocolForHost(host: string): HostProtocol {
    if (
      host.includes("ngrok-free.dev") ||
      host.includes("ngrok-free.app") ||
      host.includes(":8000")
    ) {
      return "fastapi";
    }
    return "ollama";
  }

  private getHeadersForHost(host: string): HeadersInit {
    if (host.includes("ngrok-free.dev") || host.includes("ngrok-free.app")) {
      return { "ngrok-skip-browser-warning": "true" };
    }
    return {};
  }

  private async isLocalInferenceAvailable(entry: HostClient): Promise<boolean> {
    try {
      const response = await entry.client.list();
      return response.models.some(
        (model) =>
          model.name === this.model || model.name.startsWith(`${this.model}:`),
      );
    } catch {
      return false;
    }
  }

  private async isFastApiAvailable(entry: HostClient): Promise<boolean> {
    try {
      const response = await fetch(`${entry.host}/health`, {
        headers: entry.headers,
      });
      if (!response.ok) return false;
      const data = (await response.json()) as { status?: string };
      return data.status === "ok";
    } catch {
      return false;
    }
  }

  private async fastApiChat(
    entry: HostClient,
    messages: ChatMessage[],
    model: string,
  ): Promise<ChatResponse> {
    let content = "";
    for await (const event of this.fastApiStream(entry, messages, model)) {
      if (event.type === "content") content += event.content ?? "";
    }

    return {
      model,
      created_at: new Date(),
      message: { role: "assistant", content },
      done: true,
      done_reason: "stop",
      total_duration: 0,
      load_duration: 0,
      prompt_eval_count: 0,
      prompt_eval_duration: 0,
      eval_count: 0,
      eval_duration: 0,
    };
  }

  private async *fastApiStream(
    entry: HostClient,
    messages: ChatMessage[],
    model: string,
  ): AsyncGenerator<FastApiStreamEvent> {
    const response = await fetch(`${entry.host}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream, application/json",
        ...entry.headers,
      },
      body: JSON.stringify({
        model,
        messages: this.toFormattedMessages(messages),
        max_new_tokens: this.maxNewTokens,
      }),
    });

    if (!response.ok) {
      throw new Error(`Remote chat failed with status ${response.status}`);
    }

    const contentType =
      response.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType.includes("application/json")) {
      const data = (await response.json()) as FastApiChatResponse;
      if (data.response) yield { type: "content", content: data.response };
      return;
    }

    if (!response.body) {
      throw new Error("Remote stream did not include a response body.");
    }

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

          const parsed = JSON.parse(data) as FastApiStreamEvent;
          if (parsed.error || parsed.type === "error") {
            throw new Error(
              parsed.error ?? parsed.message ?? "Generation failed",
            );
          }
          if (parsed.type === "done") {
            return;
          }
          yield parsed;
        }

        if (done) break;
      }
    } finally {
      reader.releaseLock();
    }

    if (buffer.trim()) {
      const dataLine = buffer
        .split("\n")
        .find((line) => line.startsWith("data: "));
      if (dataLine) {
        const data = dataLine.slice(6);
        if (data !== "[DONE]") {
          const parsed = JSON.parse(data) as FastApiStreamEvent;
          if (parsed.error || parsed.type === "error") {
            throw new Error(
              parsed.error ?? parsed.message ?? "Generation failed",
            );
          }
          if (parsed.type !== "done") {
            yield parsed;
          }
        }
      }
    }
  }
}

export const inferenceService = new InferenceService();
export const ollamaService = inferenceService;
