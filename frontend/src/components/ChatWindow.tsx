import { useEffect, useState } from "react";
import { Bot, Sparkles, WandSparkles } from "lucide-react";
import { fetchHealthStatus, streamChat } from "../services/chatApi";
import type { ChatMessage } from "../types/chat.types";
import { ChatInput } from "./ChatInput";
import { MessageList } from "./MessageList";
import { TypingIndicator } from "./TypingIndicator";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";

const suggestions = [
  "Explain JavaScript closures",
  "Write a warm-up routine",
  "Help me plan a side project",
];

function makeId(): string {
  return crypto.randomUUID();
}

export function ChatWindow() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [controller, setController] = useState<AbortController | null>(null);
  const [connectionLabel, setConnectionLabel] = useState(
    "Checking Ollama connection",
  );
  const [connectionOnline, setConnectionOnline] = useState(false);

  useEffect(() => {
    const signalController = new AbortController();

    async function refreshHealth() {
      try {
        const health = await fetchHealthStatus(signalController.signal);
        if (!health.ollama) {
          setConnectionOnline(false);
          setConnectionLabel("Ollama unavailable");
          return;
        }
        if (health.connection === "remote") {
          setConnectionOnline(true);
          setConnectionLabel("Ollama connected via Colab");
          return;
        }
        setConnectionOnline(true);
        setConnectionLabel("Ollama connected locally");
      } catch {
        setConnectionOnline(false);
        setConnectionLabel("Ollama disconnected");
      }
    }

    void refreshHealth();
    const intervalId = window.setInterval(() => {
      void refreshHealth();
    }, 10000);

    return () => {
      signalController.abort();
      window.clearInterval(intervalId);
    };
  }, []);

  async function submitMessage(text = input) {
    const content = text.trim();
    if (!content || isStreaming) return;
    setError(null);
    setInput("");
    const userMessage: ChatMessage = { id: makeId(), role: "user", content };
    const assistantMessage: ChatMessage = {
      id: makeId(),
      role: "assistant",
      content: "",
    };
    const history = [...messages, userMessage];
    setMessages([...history, assistantMessage]);
    setIsStreaming(true);
    const nextController = new AbortController();
    setController(nextController);

    try {
      await streamChat(
        history,
        (chunk) => {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantMessage.id
                ? { ...message, content: message.content + chunk }
                : message,
            ),
          );
        },
        nextController.signal,
      );
    } catch (streamError) {
      if ((streamError as Error).name !== "AbortError") {
        setError(
          (streamError as Error).message ||
            "Unable to connect to the local AI model.",
        );
        setMessages((current) =>
          current.filter((message) => message.id !== assistantMessage.id),
        );
      }
    } finally {
      setController(null);
      setIsStreaming(false);
    }
  }

  function stopGeneration() {
    controller?.abort();
  }

  const showEmptyState = messages.length === 0;

  return (
    <main className="relative flex h-full min-h-full flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-[-7rem] h-56 bg-gradient-to-r from-orange-300/25 via-rose-300/30 to-emerald-300/30 blur-3xl" />

      <header className="relative mx-auto flex h-20 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/95 text-primary-foreground shadow-glow">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold tracking-tight">Local GPT</p>
            <p className="text-xs text-muted-foreground">
              Private local assistant
            </p>
          </div>
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-border/80 bg-card/65 px-3 py-1.5 text-xs text-muted-foreground sm:flex">
          <span
            className={`h-2 w-2 rounded-full ${
              connectionOnline
                ? "bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.18)]"
                : "bg-rose-500 shadow-[0_0_0_4px_rgba(244,63,94,0.18)]"
            }`}
          />
          {connectionLabel}
        </div>
      </header>

      <section className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-hidden px-4 pb-4 sm:px-6">
        {showEmptyState ? (
          <Card className="animate-fade-in-up mt-6 flex flex-1 items-center border-border/70 bg-card/85">
            <CardContent className="w-full p-8 sm:p-12">
              <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-border/80 bg-muted/70 px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                <WandSparkles className="h-3.5 w-3.5 text-primary" />
                Private by design
              </p>
              <h1 className="max-w-xl text-4xl font-semibold leading-tight tracking-tight text-foreground sm:text-6xl">
                What are you thinking about today?
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">
                Run ideas, debug code, or draft content with your local model.
                No cloud account and no server-side chat history.
              </p>
              <div className="mt-8 flex flex-wrap gap-2.5">
                {suggestions.map((suggestion) => (
                  <Button
                    key={suggestion}
                    variant="secondary"
                    className="group h-auto rounded-full border border-border/70 bg-background/85 px-4 py-2 text-left text-xs font-medium text-foreground hover:border-primary/50 hover:bg-primary/5 sm:text-sm"
                    onClick={() => submitMessage(suggestion)}
                  >
                    {suggestion}
                    <span className="ml-1 text-primary transition-transform group-hover:translate-x-0.5">
                      ↗
                    </span>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <MessageList messages={messages} isStreaming={isStreaming} />
        )}
      </section>

      {error && (
        <div className="mx-auto w-full max-w-4xl px-4 pb-3 sm:px-6">
          <Card className="border-destructive/35 bg-red-50/80 text-sm text-red-800">
            <CardContent className="space-y-1.5 p-3.5">
              <p className="font-semibold">Connection issue</p>
              <p>{error}</p>
              <p className="text-xs text-red-700/80">
                Make sure Ollama is running with the qwen3:4b model installed.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {isStreaming && (
        <div className="mx-auto mb-2 flex w-full max-w-4xl items-center gap-2 px-4 text-xs uppercase tracking-[0.14em] text-muted-foreground sm:px-6">
          <TypingIndicator />
          <span className="inline-flex items-center gap-1">
            <Bot className="h-3.5 w-3.5" /> Generating response
          </span>
        </div>
      )}

      <ChatInput
        value={input}
        disabled={isStreaming}
        isStreaming={isStreaming}
        onChange={setInput}
        onSubmit={() => submitMessage()}
        onStop={stopGeneration}
      />
    </main>
  );
}
