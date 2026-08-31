export type MessageRole = "system" | "user" | "assistant";

export interface SourceItem {
  documentId: string;
  documentTitle: string;
  pageNumber?: number;
  section?: string;
  score?: number;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  thinking?: string;
  sources?: SourceItem[];
}

/** Provider-neutral model metadata returned by the Cognita API. */
export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  loaded: boolean;
}

export interface ModelsResponse {
  models: ModelInfo[];
}

export interface HealthResponse {
  status: string;
  cuda: boolean;
  gpu_count: number;
  gpus: string[];
  models_loaded: string[];
}

export interface ChatRequest {
  model: string;
  messages: Pick<ChatMessage, "role" | "content">[];
  max_new_tokens: number;
}

export interface ChatStreamChunk {
  model?: string;
  content?: string;
  type?: "content" | "thinking" | "sources" | "status";
  sources?: SourceItem[];
  message?: string;
}

export interface ChatStreamError {
  error: string;
}
