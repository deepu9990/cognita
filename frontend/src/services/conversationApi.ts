import { apiJson } from "./apiClient";
import type { ConversationSummary } from "../types/conversation.types";
import type { ChatMessage } from "../types/chat.types";

interface StoredMessage {
  id: string;
  role: ChatMessage["role"];
  content: string;
  createdAt: string;
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const data = await apiJson<{ conversations: ConversationSummary[] }>(
    "/api/conversations",
  );
  return data.conversations;
}

export async function getConversation(id: string): Promise<{
  conversation: ConversationSummary;
  messages: ChatMessage[];
}> {
  const data = await apiJson<{
    conversation: ConversationSummary;
    messages: StoredMessage[];
  }>(`/api/conversations/${id}`);

  return {
    conversation: data.conversation,
    messages: data.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
    })),
  };
}

export async function renameConversation(
  id: string,
  title: string,
): Promise<ConversationSummary> {
  const data = await apiJson<{ conversation: ConversationSummary }>(
    `/api/conversations/${id}`,
    { method: "PATCH", body: JSON.stringify({ title }) },
  );
  return data.conversation;
}

export async function deleteConversation(id: string): Promise<void> {
  await apiJson(`/api/conversations/${id}`, { method: "DELETE" });
}

export async function deleteAllConversations(): Promise<void> {
  await apiJson("/api/conversations", { method: "DELETE" });
}
