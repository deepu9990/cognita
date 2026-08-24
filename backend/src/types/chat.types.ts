export type MessageRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: MessageRole;
  content: string;
}

export interface ChatRequestBody {
  messages: ChatMessage[];
}

export interface ApiError {
  success: false;
  error: string;
}
