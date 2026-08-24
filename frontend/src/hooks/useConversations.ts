import { useCallback, useEffect, useState } from "react";
import * as conversationApi from "../services/conversationApi";
import type { ConversationSummary } from "../types/conversation.types";

export function useConversations() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setConversations(await conversationApi.listConversations());
    } catch {
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const upsert = useCallback((conversation: ConversationSummary) => {
    setConversations((current) => {
      const rest = current.filter((item) => item.id !== conversation.id);
      return [conversation, ...rest];
    });
  }, []);

  const rename = useCallback(async (id: string, title: string) => {
    const previous = await conversationApi.renameConversation(id, title);
    setConversations((current) =>
      current.map((item) => (item.id === id ? previous : item)),
    );
  }, []);

  const remove = useCallback(async (id: string) => {
    setConversations((current) => current.filter((item) => item.id !== id));
    await conversationApi.deleteConversation(id);
  }, []);

  const removeAll = useCallback(async () => {
    setConversations([]);
    await conversationApi.deleteAllConversations();
  }, []);

  return { conversations, loading, refresh, upsert, rename, remove, removeAll };
}
