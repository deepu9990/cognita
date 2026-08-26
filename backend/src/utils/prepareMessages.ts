import type { ChatMessage, MessageRole } from "../types/chat.types.js";

const MAX_HISTORY_MESSAGES = 10;
const MAX_ASSISTANT_LENGTH = 600;
const validRoles = new Set<MessageRole>(["system", "user", "assistant"]);

type RawMessage = Partial<ChatMessage>;

function log(action: string): void {
  console.log(`[prepareMessages] ${action}`);
}

function cleanAssistantContent(content: string): string {
  const withoutThinkBlocks = content.replace(/<think>[\s\S]*?<\/think>/gi, "");
  const withoutDanglingThink = withoutThinkBlocks.replace(
    /^[\s\S]*?<\/think>/i,
    "",
  );
  return withoutDanglingThink.replace(/<\|[^|>]+\|>/g, "").trim();
}

function deduplicateLines(content: string): string {
  const seen = new Set<string>();
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      if (!line || seen.has(line)) return false;
      seen.add(line);
      return true;
    })
    .join("\n");
}

/** Cleans conversation history before it is forwarded to an inference provider. */
export function prepareMessages(rawMessages: unknown): ChatMessage[] {
  if (!Array.isArray(rawMessages)) {
    throw new Error("Request body must include a messages array");
  }

  const cleaned: ChatMessage[] = [];
  for (const [index, rawMessage] of rawMessages.entries()) {
    const message = rawMessage as RawMessage | null;
    const role = message?.role;
    if (
      !message ||
      typeof role !== "string" ||
      !validRoles.has(role as MessageRole) ||
      typeof message.content !== "string"
    ) {
      log(`dropped invalid message at index ${index}`);
      continue;
    }

    const content =
      role === "assistant"
        ? cleanAssistantContent(message.content)
        : message.content.trim();
    if (!content) {
      log(`dropped empty ${role} message at index ${index}`);
      continue;
    }

    const previous = cleaned.at(-1);
    if (previous && previous.role === role) {
      const merged = `${previous.content}\n${content}`;
      const deduplicated = deduplicateLines(merged);
      if (deduplicated !== merged) {
        log(`deduplicated repeated ${role} message lines`);
      }
      previous.content = deduplicated;
      log(`merged consecutive ${role} messages`);
      continue;
    }

    cleaned.push({ role: role as MessageRole, content });
  }

  const systemMessage = cleaned.find((message) => message.role === "system");
  const nonSystemMessages = cleaned.filter((message) => message.role !== "system");
  const retainedHistory = nonSystemMessages.slice(-MAX_HISTORY_MESSAGES);
  if (retainedHistory.length !== nonSystemMessages.length) {
    log(`trimmed history to ${MAX_HISTORY_MESSAGES} non-system messages`);
  }

  const prepared = systemMessage
    ? [systemMessage, ...retainedHistory]
    : retainedHistory;

  while (prepared.length > (systemMessage ? 1 : 0)) {
    const firstHistoryIndex = systemMessage ? 1 : 0;
    if (prepared[firstHistoryIndex]?.role === "user") break;
    const [dropped] = prepared.splice(firstHistoryIndex, 1);
    log(`dropped leading ${dropped.role} message without a preceding user message`);
  }

  for (const message of prepared) {
    if (
      message.role === "assistant" &&
      message.content.length > MAX_ASSISTANT_LENGTH
    ) {
      message.content = `${message.content.slice(0, MAX_ASSISTANT_LENGTH - 1)}…`;
      log(`truncated assistant message to ${MAX_ASSISTANT_LENGTH} characters`);
    }
  }

  if (prepared.length === 0) {
    throw new Error("No valid messages after preparation");
  }
  if (prepared.at(-1)?.role !== "user") {
    throw new Error("Last message must be from user");
  }

  return prepared;
}
