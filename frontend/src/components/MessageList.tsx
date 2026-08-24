import { useEffect, useRef } from "react";
import type { ChatMessage } from "../types/chat.types";
import { MessageBubble } from "./MessageBubble";

interface MessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
}

export function MessageList({ messages, isStreaming }: MessageListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const distanceFromBottom =
      list.scrollHeight - list.scrollTop - list.clientHeight;
    if (distanceFromBottom <= 120) {
      list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  return (
    <div
      ref={listRef}
      className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto py-4 pr-1"
      aria-live="polite"
    >
      {messages
        .filter((message) => message.role !== "system")
        .map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            isStreaming={
              isStreaming && message === messages[messages.length - 1]
            }
          />
        ))}
    </div>
  );
}
