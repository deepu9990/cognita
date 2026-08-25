export type MessageRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: MessageRole;
  content: string;
}

export interface ChatRequestBody {
  model?: string;
  messages: ChatMessage[];
  conversationId?: string;
  temporary?: boolean;
}

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
  messages: ChatMessage[];
  max_new_tokens: number;
}

export interface ChatStreamChunk {
  model: string;
  content: string;
}

export interface ChatStreamError {
  error: string;
}

export interface ApiError {
  success: false;
  error: string;
}
