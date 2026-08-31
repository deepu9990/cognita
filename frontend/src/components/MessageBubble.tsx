import { useState } from "react";
import {
  BookOpen,
  BrainCircuit,
  ChevronDown,
  Copy,
  CopyCheck,
  RotateCcw,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "../types/chat.types";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";

interface ParsedAssistantContent {
  answer: string;
  thoughts: string[];
}

function parseAssistantContent(raw: string): ParsedAssistantContent {
  const thoughts: string[] = [];
  let answer = "";
  let cursor = 0;
  const thinkBlockPattern = /<think>([\s\S]*?)<\/think>/gi;

  for (const match of raw.matchAll(thinkBlockPattern)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    answer += raw.slice(cursor, start);
    thoughts.push(match[1].trim());
    cursor = end;
  }

  const remainder = raw.slice(cursor);
  const openThinkIndex = remainder.toLowerCase().lastIndexOf("<think>");

  if (openThinkIndex >= 0) {
    answer += remainder.slice(0, openThinkIndex);
    thoughts.push(remainder.slice(openThinkIndex + 7).trim());
  } else {
    answer += remainder;
  }

  return {
    answer: answer.trimStart(),
    thoughts: thoughts.filter(Boolean),
  };
}

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
  onRetry?: () => void;
}

export function MessageBubble({
  message,
  isStreaming = false,
  onRetry,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const isUser = message.role === "user";
  const parsedAssistant = isUser
    ? null
    : parseAssistantContent(message.content);
  const displayContent = isUser
    ? message.content
    : (parsedAssistant?.answer ?? message.content);
  const thinkingBlocks = [
    ...(parsedAssistant?.thoughts ?? []),
    ...(message.thinking ? [message.thinking] : []),
  ];

  async function copyMessage() {
    await navigator.clipboard.writeText(displayContent || message.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <article className="animate-fade-in-up">
      <div
        className={`mb-2.5 flex items-center gap-2 ${isUser ? "justify-end" : ""}`}
      >
        <span
          className={`text-[12px] font-semibold uppercase tracking-[0.12em] ${isUser ? "text-muted-foreground" : "text-primary"}`}
        >
          {isUser ? "You" : "Cognita"}
        </span>
      </div>

      <div
        className={
          isUser
            ? "ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm border border-border bg-muted px-5 py-3.5 text-[15px] leading-7 text-foreground"
            : "max-w-[54rem] text-[15px] leading-7 text-foreground"
        }
      >
        {isUser ? (
          <p>{displayContent}</p>
        ) : displayContent ? (
          <>
            {thinkingBlocks.length > 0 && (
              <Collapsible className="my-4 rounded-xl border border-muted">
                <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-xl px-4 py-2.5 text-left text-xs text-muted-foreground transition hover:text-foreground">
                  <span className="inline-flex items-center gap-2 uppercase tracking-[0.1em]">
                    <BrainCircuit className="h-3.5 w-3.5 text-primary" />
                    Thinking
                  </span>
                  <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent className="border-t border-border px-4 pb-4 pt-3">
                  {thinkingBlocks.map((thought, index) => (
                    <p
                      key={`${message.id}-thinking-${index}`}
                      className="max-h-24 overflow-auto whitespace-pre-wrap rounded-lg bg-background p-3.5 text-xs leading-6 text-muted-foreground"
                    >
                      {thought}
                    </p>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              className="message-prose"
            >
              {displayContent}
            </ReactMarkdown>
            {message.sources && message.sources.length > 0 && (
              <div className="mt-4 border-t border-border pt-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
                  <BookOpen className="h-3.5 w-3.5 text-primary" />
                  Sources
                </p>
                <div className="flex flex-wrap gap-2">
                  {message.sources.map((src, idx) => (
                    <div
                      key={`${message.id}-source-${idx}`}
                      className="rounded-lg border border-border bg-muted/60 px-3 py-1.5 text-xs text-subtle-foreground"
                    >
                      <span className="font-medium text-foreground">
                        {src.documentTitle}
                      </span>
                      {(src.section || src.pageNumber) && (
                        <span className="ml-1.5 text-muted-foreground">
                          {src.section ? `${src.section} ` : ""}
                          {src.pageNumber ? `· Page ${src.pageNumber}` : ""}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : isStreaming ? (
          <span className="text-xs uppercase tracking-[0.11em] text-muted-foreground">
            Thinking...
          </span>
        ) : null}
      </div>
      {!isUser && displayContent && !isStreaming && (
        <div className="mt-3 flex items-center gap-1">
          <button
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-muted hover:text-foreground"
            type="button"
            onClick={copyMessage}
            aria-label="Copy response"
          >
            {copied ? (
              <CopyCheck className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            onClick={onRetry}
            disabled={!onRetry}
            aria-label="Retry response"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Retry
          </button>
          <button
            className={`rounded-md p-1.5 transition hover:bg-muted hover:text-foreground ${feedback === "up" ? "bg-muted text-foreground" : "text-muted-foreground"}`}
            type="button"
            onClick={() => setFeedback("up")}
            aria-label="Good response"
            aria-pressed={feedback === "up"}
          >
            <ThumbsUp className="h-3.5 w-3.5" />
          </button>
          <button
            className={`rounded-md p-1.5 transition hover:bg-muted hover:text-foreground ${feedback === "down" ? "bg-muted text-foreground" : "text-muted-foreground"}`}
            type="button"
            onClick={() => setFeedback("down")}
            aria-label="Poor response"
            aria-pressed={feedback === "down"}
          >
            <ThumbsDown className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </article>
  );
}
