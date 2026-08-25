import { useCallback, useEffect, useState } from "react";
import { Bot, Ghost, Menu, WandSparkles } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchHealthStatus, fetchModels, streamChat } from "../services/chatApi";
import { getConversation } from "../services/conversationApi";
import { useConversations } from "../hooks/useConversations";
import type { ChatMessage, ModelInfo } from "../types/chat.types";
import { ChatInput } from "./ChatInput";
import { MessageList } from "./MessageList";
import { Logo } from "./Logo";
import { Sidebar } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";
import { TypingIndicator } from "./TypingIndicator";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";

const suggestions = [
  "Explain JavaScript closures",
  "Write a warm-up routine",
  "Help me plan a side project",
];

const PREFERRED_MODEL_ID = "qwen3-4b";

function makeId(): string {
  return crypto.randomUUID();
}

export function ChatWindow() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const { conversations, loading, refresh, remove, rename } =
    useConversations();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [controller, setController] = useState<AbortController | null>(null);
  const [temporary, setTemporary] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [connectionLabel, setConnectionLabel] = useState(
    "Checking inference connection",
  );
  const [connectionOnline, setConnectionOnline] = useState(false);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState(false);
  const [failedPrompt, setFailedPrompt] = useState<string | null>(null);

  useEffect(() => {
    const signalController = new AbortController();

    void fetchModels(signalController.signal)
      .then((availableModels) => {
        if (signalController.signal.aborted) return;
        setModels(availableModels);
        const preferred = availableModels.find(
          (model) => model.id === PREFERRED_MODEL_ID && model.loaded,
        );
        setSelectedModelId(
          preferred?.id ??
            availableModels.find((model) => model.loaded)?.id ??
            null,
        );
      })
      .catch(() => {
        if (!signalController.signal.aborted) setModelsError(true);
      })
      .finally(() => {
        if (!signalController.signal.aborted) setModelsLoading(false);
      });

    return () => signalController.abort();
  }, []);

  useEffect(() => {
    if (temporary) return;

    if (!conversationId) {
      setMessages([]);
      return;
    }

    let cancelled = false;
    void getConversation(conversationId)
      .then((result) => {
        if (!cancelled) setMessages(result.messages);
      })
      .catch(() => {
        if (!cancelled) navigate("/", { replace: true });
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, navigate, temporary]);

  useEffect(() => {
    const signalController = new AbortController();

    async function refreshHealth() {
      try {
        const health = await fetchHealthStatus(signalController.signal);
        if (!health.ollama) {
          setConnectionOnline(false);
          setConnectionLabel("Inference unavailable");
          return;
        }
        if (health.connection === "remote") {
          setConnectionOnline(true);
          setConnectionLabel("Inference server connected");
          return;
        }
        setConnectionOnline(true);
        setConnectionLabel("Inference server connected locally");
      } catch {
        setConnectionOnline(false);
        setConnectionLabel("Inference server disconnected");
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
    if (!content || isStreaming || !selectedModelId) return;
    setError(null);
    setFailedPrompt(null);
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

    let createdConversationId: string | null = null;
    let receivedAssistantContent = false;

    try {
      await streamChat(history, {
        model: selectedModelId,
        conversationId,
        temporary,
        signal: nextController.signal,
        onMeta: (meta) => {
          if (!conversationId) createdConversationId = meta.conversationId;
        },
        onChunk: (chunk) => {
          receivedAssistantContent = true;
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantMessage.id
                ? { ...message, content: message.content + chunk }
                : message,
            ),
          );
        },
      });
    } catch (streamError) {
      if ((streamError as Error).name !== "AbortError") {
        setError(
          (streamError as Error).message ||
            "Unable to connect to the local AI model.",
        );
        setFailedPrompt(content);
        if (!receivedAssistantContent) {
          setMessages((current) =>
            current.filter((message) => message.id !== assistantMessage.id),
          );
        }
      }
    } finally {
      setController(null);
      setIsStreaming(false);

      if (!temporary) {
        void refresh();
        if (createdConversationId) {
          navigate(`/c/${createdConversationId}`, { replace: true });
        }
      }
    }
  }

  function stopGeneration() {
    controller?.abort();
  }

  function retryResponse(assistantMessageId: string) {
    const assistantIndex = messages.findIndex(
      (message) => message.id === assistantMessageId,
    );
    if (assistantIndex < 1) return;

    const prompt = [...messages.slice(0, assistantIndex)]
      .reverse()
      .find((message) => message.role === "user")?.content;
    if (prompt) void submitMessage(prompt);
  }

  const startNewChat = useCallback(() => {
    setMessages([]);
    setError(null);
    setSidebarOpen(false);
    navigate("/");
  }, [navigate]);

  const toggleTemporary = useCallback(() => {
    setTemporary((current) => !current);
    setMessages([]);
    setError(null);
    setSidebarOpen(false);
    navigate("/");
  }, [navigate]);

  const handleDelete = useCallback(
    async (id: string) => {
      await remove(id);
      if (id === conversationId) navigate("/", { replace: true });
    },
    [conversationId, navigate, remove],
  );

  const showEmptyState = messages.length === 0;

  return (
    <div className="relative flex h-full min-h-full overflow-hidden">
      <div className="hidden h-full w-72 shrink-0 md:block">
        <Sidebar
          conversations={conversations}
          loading={loading}
          temporary={temporary}
          onToggleTemporary={toggleTemporary}
          onNewChat={startNewChat}
          onRename={rename}
          onDelete={handleDelete}
        />
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="h-full w-72 bg-background shadow-xl">
            <Sidebar
              conversations={conversations}
              loading={loading}
              temporary={temporary}
              onToggleTemporary={toggleTemporary}
              onNewChat={startNewChat}
              onRename={rename}
              onDelete={handleDelete}
            />
          </div>
          <button
            type="button"
            aria-label="Close menu"
            className="h-full flex-1 bg-foreground/20"
            onClick={() => setSidebarOpen(false)}
          />
        </div>
      )}

      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-card">
        <header className="relative flex h-[4.5rem] w-full shrink-0 items-center justify-between gap-4 border-b border-border px-6 sm:px-10">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground md:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-glow">
              <Logo className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold tracking-tight">Cognita</p>
              <p className="text-xs text-muted-foreground">Your AI workspace</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground sm:flex">
              <span
                className={`h-2 w-2 rounded-full ${
                  connectionOnline
                    ? "bg-success shadow-[0_0_0_4px_hsl(var(--success)/0.16)]"
                    : "bg-destructive shadow-[0_0_0_4px_hsl(var(--destructive)/0.16)]"
                }`}
              />
              {connectionLabel}
            </div>
            <ThemeToggle />
          </div>
        </header>

        {temporary && (
          <div className="mx-auto w-full max-w-full px-6 pt-4 sm:max-w-[60vw] sm:px-10">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-muted px-4 py-2.5 text-xs text-subtle-foreground">
              <Ghost className="h-3.5 w-3.5" />
              Temporary chat. Nothing is saved and this disappears on refresh.
            </div>
          </div>
        )}

        <section className="relative mx-auto flex min-h-0 w-full max-w-full flex-1 flex-col overflow-hidden px-4 pb-2 sm:max-w-[60vw] sm:px-10">
          {showEmptyState ? (
            <Card className="animate-fade-in-up mt-8 flex flex-1 items-center border-border bg-card">
              <CardContent className="w-full p-6 sm:p-16">
                <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  <WandSparkles className="h-3.5 w-3.5 text-primary" />
                  Private by design
                </p>
                <h1 className="max-w-xl text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-6xl">
                  What are you thinking about today?
                </h1>
                <p className="mt-5 max-w-xl text-sm leading-7 text-subtle-foreground sm:text-base">
                  Run ideas, debug code, or draft content with your local model.
                  Your conversations stay on your own infrastructure.
                </p>
                <div className="mt-7 flex flex-wrap gap-3 sm:mt-10">
                  {suggestions.map((suggestion) => (
                    <Button
                      key={suggestion}
                      variant="secondary"
                      className="group h-auto rounded-full border border-border bg-card px-4 py-2.5 text-left text-xs font-medium text-subtle-foreground hover:bg-accent hover:text-foreground sm:text-sm"
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
            <MessageList
              messages={messages}
              isStreaming={isStreaming}
              onRetry={retryResponse}
            />
          )}
        </section>

        {error && (
          <div className="mx-auto w-full max-w-full px-6 pb-3 sm:max-w-[60vw] sm:px-10">
            <Card className="border-destructive/40 bg-destructive/10 text-sm text-destructive">
              <CardContent className="space-y-1.5 p-4">
                <p className="font-semibold">Connection issue</p>
                <p>{error}</p>
                <p className="text-xs opacity-80">
                  Make sure the configured model host is running and reachable.
                </p>
                {failedPrompt && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-2"
                    onClick={() => void submitMessage(failedPrompt)}
                  >
                    Retry message
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {isStreaming && (
          <div className="mx-auto mb-2 flex w-full max-w-full items-center gap-2 px-6 text-xs uppercase tracking-[0.14em] text-muted-foreground sm:max-w-[60vw] sm:px-10">
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
          models={models}
          selectedModelId={selectedModelId}
          modelsLoading={modelsLoading}
          modelsError={modelsError}
          onModelChange={setSelectedModelId}
        />
      </main>
    </div>
  );
}
