import { useRef } from "react";
import { SendHorizontal, Square } from "lucide-react";
import { Button } from "./ui/button";

interface ChatInputProps {
  value: string;
  disabled: boolean;
  isStreaming: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
}

export function ChatInput({
  value,
  disabled,
  isStreaming,
  onChange,
  onSubmit,
  onStop,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    <div className="w-full max-w-[65vw] mx-auto px-6 pb-6 sm:px-10">
      <form
        className="group flex items-end gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-sm transition focus-within:border-primary/50 focus-within:shadow-glow"
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
            disabled={disabled || !value.trim()}
            aria-label="Send message"
          >
            <SendHorizontal className="h-4 w-4" />
          </Button>
        )}
      </form>
      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        Local model · Qwen3 4B · Your conversation stays in memory
      </p>
    </div>
  );
}
