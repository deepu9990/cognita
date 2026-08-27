import { useEffect, useRef, useState } from "react";
import { Plus, SendHorizontal, Square } from "lucide-react";
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
            variant="secondary"
            size="icon"
            className="h-8 w-8 rounded-lg"
            onClick={() => setModelPickerOpen((open) => !open)}
            disabled={
              modelsLoading || modelsError || models.length === 0 || isStreaming
            }
            aria-label="Choose model"
            aria-expanded={modelPickerOpen}
            title={
              selectedModel ? `Model: ${selectedModel.name}` : "Choose model"
            }
          >
            <Plus className="h-4 w-4" />
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
            <p className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Choose model
            </p>
            {models.map((model) => (
              <button
                key={model.id}
                type="button"
                disabled={!model.loaded}
                onClick={() => {
                  onModelChange(model.id);
                  setModelPickerOpen(false);
                }}
                className={`w-full rounded-lg px-3 py-2.5 text-left transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 ${model.id === selectedModelId ? "bg-muted" : ""}`}
              >
                <span className="block text-sm font-medium text-foreground">
                  {model.name}
                  {!model.loaded && " · Unavailable"}
                </span>
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
