import { useRef } from "react";
import { ChevronDown, SendHorizontal, Square } from "lucide-react";
import { Button } from "./ui/button";
import type { ModelInfo } from "../types/chat.types";

interface ChatInputProps {
  value: string;
  disabled: boolean;
  isStreaming: boolean;
  models: ModelInfo[];
  selectedModelId: string | null;
  modelsLoading: boolean;
  modelsError: boolean;
  onChange: (value: string) => void;
  onModelChange: (modelId: string) => void;
  onSubmit: () => void;
  onStop: () => void;
}

export function ChatInput({
  value,
  disabled,
  isStreaming,
  models,
  selectedModelId,
  modelsLoading,
  modelsError,
  onChange,
  onModelChange,
  onSubmit,
  onStop,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectedModel = models.find((model) => model.id === selectedModelId);
  const modelUnavailable = !selectedModelId || !selectedModel?.loaded;

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  }

  function handleChange(nextValue: string) {
    onChange(nextValue);
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
    }
  }

  return (
    <div className="mx-auto w-full max-w-[60vw] px-6 pb-6 sm:px-10">
      <form
        className="group rounded-2xl border border-border bg-card p-3.5 shadow-sm transition focus-within:border-primary/50 focus-within:shadow-glow"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything. Shift+Enter for a new line"
          rows={1}
          disabled={disabled}
          aria-label="Message"
          className="max-h-44 min-h-[44px] w-full resize-none bg-transparent px-2 py-2 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground"
        />
        <div className="mt-2 flex items-center justify-between gap-3 border-t border-border/70 pt-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="relative min-w-0">
              <select
                value={selectedModelId ?? ""}
                onChange={(event) => onModelChange(event.target.value)}
                disabled={
                  modelsLoading ||
                  modelsError ||
                  models.length === 0 ||
                  isStreaming
                }
                aria-label="Select model"
                className="h-8 max-w-full appearance-none rounded-lg bg-muted py-1 pl-2.5 pr-7 text-left text-xs font-medium text-foreground outline-none transition hover:bg-accent focus:ring-2 focus:ring-primary/35 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {modelsLoading && <option value="">Loading models…</option>}
                {!modelsLoading && modelsError && (
                  <option value="">Models unavailable</option>
                )}
                {!modelsLoading && !modelsError && models.length === 0 && (
                  <option value="">No models available</option>
                )}
                {models.map((model) => (
                  <option
                    key={model.id}
                    value={model.id}
                    disabled={!model.loaded}
                  >
                    {model.name}{model.loaded ? "" : " (unavailable)"}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
            {selectedModel && (
              <p className="truncate text-xs text-muted-foreground">
                {selectedModel.description}
              </p>
            )}
          </div>
          {isStreaming ? (
            <Button
              variant="destructive"
              size="icon"
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                onStop();
                event.currentTarget.blur();
              }}
              aria-label="Stop generating"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </Button>
          ) : (
            <Button
              size="icon"
              type="submit"
              disabled={disabled || modelUnavailable || !value.trim()}
              aria-label="Send message"
            >
              <SendHorizontal className="h-4 w-4" />
            </Button>
          )}
        </div>
      </form>
      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        {selectedModel ? `${selectedModel.name} · ` : ""}Your conversation stays in memory
      </p>
    </div>
  );
}
