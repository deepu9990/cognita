import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const NO_SPACE_BEFORE = /^[\s.,!?;:)\]}'"%-]/;
const NO_SPACE_AFTER = /[\s([{'"-]$/;

/**
 * Appends a streamed chunk to existing text, inserting a space when the
 * upstream model stream drops the whitespace between word boundaries.
 */
export function appendStreamChunk(existing: string, chunk: string): string {
  if (!existing || !chunk) return existing + chunk;
  const needsSpace =
    !NO_SPACE_AFTER.test(existing) && !NO_SPACE_BEFORE.test(chunk);
  return needsSpace ? `${existing} ${chunk}` : existing + chunk;
}
