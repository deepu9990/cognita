import { useEffect, useRef, useState } from "react";
import { AlertCircle, ChevronDown, SendHorizontal, Sparkles, Square } from "lucide-react";
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
  const modelPickerRef = useRef<HTMLFormElement>(null);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const selectedModel = models.find((model) => model.id === selectedModelId);
  const modelUnavailable = !selectedModelId || !selectedModel?.loaded;

  useEffect(() => {
    if (!modelPickerOpen) return;

    function closeModelPicker(event: PointerEvent) {
      if (!modelPickerRef.current?.contains(event.target as Node)) {
        setModelPickerOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setModelPickerOpen(false);
    }

    document.addEventListener("pointerdown", closeModelPicker);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", closeModelPicker);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [modelPickerOpen]);

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
    <div className="mx-auto w-full max-w-full px-6 pb-6 sm:max-w-[60vw] sm:px-10">
      {modelUnavailable && !modelsLoading && (
        <div className="mb-2 flex items-center gap-2 rounded-xl border border-destructive/10 bg-destructive/5 px-3.5 py-2 text-xs text-destructive/70 animate-fade-in-up">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>
            {modelsError || models.length === 0
              ? "Inference server is offline. Run 'start_all.py' on Kaggle or Colab and verify INFERENCE_HOST."
              : "Selected model is currently unavailable on the inference server."}
          </span>
        </div>
      )}

      <form
        ref={modelPickerRef}
        className="group relative rounded-2xl bg-muted/60 p-3 transition focus-within:bg-muted sm:p-3.5"
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
          className="max-h-44 min-h-[68px] w-full resize-none bg-transparent px-2 py-2 text-base leading-6 text-foreground outline-none placeholder:text-muted-foreground sm:min-h-[44px] sm:text-sm"
        />
        <div className="mt-2 flex items-center justify-between gap-3 pt-2">
          <Button
            type="button"
            variant="ghost"
            className="h-8 px-2.5 rounded-lg border border-border/60 bg-background/60 hover:bg-background text-xs font-medium gap-1.5 text-foreground transition"
            onClick={() => setModelPickerOpen((open) => !open)}
            disabled={modelsLoading || isStreaming || (models.length === 0 && modelsError)}
            aria-label="Choose model"
            aria-expanded={modelPickerOpen}
            title={selectedModel ? `Model: ${selectedModel.name}` : "Choose model"}
          >
            <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="max-w-[140px] truncate sm:max-w-[200px]">
              {selectedModel?.name ?? (modelsLoading ? "Loading..." : "Choose model")}
            </span>
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                selectedModel?.loaded ? "bg-success" : "bg-destructive"
              }`}
            />
            <ChevronDown className="h-3 w-3 opacity-60 shrink-0" />
          </Button>

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

        {modelPickerOpen && (
          <div className="absolute bottom-14 left-3 right-3 z-20 max-h-64 overflow-y-auto rounded-xl border border-border bg-card p-2 shadow-xl sm:left-3 sm:right-auto sm:w-80">
            <div className="flex items-center justify-between px-2 py-1.5">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Choose model
              </p>
              <span className="text-[10px] text-muted-foreground">
                {models.filter((m) => m.loaded).length} available
              </span>
            </div>
            {models.map((model) => (
              <button
                key={model.id}
                type="button"
                onClick={() => {
                  onModelChange(model.id);
                  setModelPickerOpen(false);
                }}
                className={`w-full rounded-lg px-3 py-2.5 text-left transition hover:bg-muted ${
                  model.id === selectedModelId ? "bg-muted font-semibold" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="block text-sm font-medium text-foreground">
                    {model.name}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      model.loaded
                        ? "bg-success/15 text-success"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        model.loaded ? "bg-success" : "bg-muted-foreground"
                      }`}
                    />
                    {model.loaded ? "Ready" : "Offline"}
                  </span>
                </div>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {model.description}
                </span>
              </button>
            ))}
          </div>
        )}
      </form>
      <p className="mt-3 hidden text-center text-[11px] text-muted-foreground sm:block">
        {selectedModel ? `${selectedModel.name} · ` : ""}Your conversation stays
        in memory
      </p>
    </div>
  );
}
