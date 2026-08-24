export function TypingIndicator() {
  return (
    <span className="flex gap-1" aria-label="Generating response">
      <i className="h-1.5 w-1.5 rounded-full bg-primary/90 [animation-delay:0ms] animate-pulseDot" />
      <i className="h-1.5 w-1.5 rounded-full bg-primary/90 [animation-delay:150ms] animate-pulseDot" />
      <i className="h-1.5 w-1.5 rounded-full bg-primary/90 [animation-delay:300ms] animate-pulseDot" />
    </span>
  );
}
