import type { NextFunction, Request, Response } from "express";
import { ollamaService } from "../services/ollama.service.js";
import {
  appendMessage,
  assertConversationOwner,
  createConversation,
} from "../services/conversation.service.js";
import type {
  ApiError,
  ChatMessage,
  ChatRequestBody,
} from "../types/chat.types.js";

const MAX_MESSAGES = 100;
const MAX_MESSAGE_LENGTH = 12_000;
const MAX_TOTAL_LENGTH = 50_000;

function getValidatedMessages(body: unknown): ChatMessage[] {
  if (!body || typeof body !== "object" || !("messages" in body)) {
    throw new Error("Request body must include a messages array");
  }

  const messages = (body as ChatRequestBody).messages;
  if (
    !Array.isArray(messages) ||
    messages.length === 0 ||
    messages.length > MAX_MESSAGES
  ) {
    throw new Error(
      `messages must contain between 1 and ${MAX_MESSAGES} items`,
    );
  }

  let totalLength = 0;
  for (const message of messages) {
    if (
      !message ||
      !["system", "user", "assistant"].includes(message.role) ||
      typeof message.content !== "string"
    ) {
      throw new Error("Each message must have a valid role and string content");
    }
    if (
      message.content.trim().length === 0 ||
      message.content.length > MAX_MESSAGE_LENGTH
    ) {
      throw new Error(
        `Each message must contain 1-${MAX_MESSAGE_LENGTH} characters`,
      );
    }
    totalLength += message.content.length;
  }
  if (totalLength > MAX_TOTAL_LENGTH) {
    throw new Error(
      `Conversation cannot exceed ${MAX_TOTAL_LENGTH} characters`,
    );
  }
  return messages;
}

function getRequestedModel(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const { model } = body as ChatRequestBody;
  if (model === undefined) return undefined;
  if (typeof model !== "string" || !model.trim()) {
    throw new Error("model must be a non-empty string");
  }
  return model;
}

function sendError(response: Response, status: number, error: string): void {
  const payload: ApiError = { success: false, error };
  response.status(status).json(payload);
}

function lastUserMessage(messages: ChatMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "user") return messages[index].content;
  }
  return "";
}

/** Returns null for temporary chats so nothing is written to the database. */
async function resolveConversation(
  userId: string,
  body: ChatRequestBody,
  messages: ChatMessage[],
): Promise<{ id: string; title?: string } | null> {
  if (body.temporary) return null;

  if (body.conversationId) {
    await assertConversationOwner(userId, body.conversationId);
    return { id: body.conversationId };
  }

  const created = await createConversation(
    userId,
    lastUserMessage(messages),
    body.model ?? ollamaService.getModel(),
  );
  return { id: created.id, title: created.title };
}

export async function chat(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  let messages: ChatMessage[];
  let model: string | undefined;
  try {
    messages = getValidatedMessages(request.body);
    model = getRequestedModel(request.body);
  } catch (error) {
    sendError(
      response,
      400,
      error instanceof Error ? error.message : "Invalid chat request",
    );
    return;
  }

  const userId = request.userId as string;
  const body = request.body as ChatRequestBody;
  if (model) body.model = model;

  let conversation: { id: string; title?: string } | null;
  try {
    conversation = await resolveConversation(userId, body, messages);
    if (conversation) {
      await appendMessage(
        userId,
        conversation.id,
        "user",
        lastUserMessage(messages),
      );
    }
  } catch (error) {
    next(error);
    return;
  }

  try {
    const result = await ollamaService.chat(messages, model);
    const content = result.message?.content ?? "";

    if (conversation && content) {
      await appendMessage(userId, conversation.id, "assistant", content);
    }

    response.json({
      success: true,
      message: result.message,
      conversationId: conversation?.id ?? null,
      title: conversation?.title,
    });
  } catch (error) {
    console.error("Chat request failed:", error);
    sendError(
      response,
      502,
      "Unable to get a response from the model host. Check that it is running and the configured model is installed.",
    );
  }
}

export async function streamChat(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  let messages: ChatMessage[];
  let model: string | undefined;
  try {
    messages = getValidatedMessages(request.body);
    model = getRequestedModel(request.body);
  } catch (error) {
    sendError(
      response,
      400,
      error instanceof Error ? error.message : "Invalid chat request",
    );
    return;
  }

  const userId = request.userId as string;
  const body = request.body as ChatRequestBody;
  if (model) body.model = model;

  let conversation: { id: string; title?: string } | null;
  try {
    conversation = await resolveConversation(userId, body, messages);
    if (conversation) {
      await appendMessage(
        userId,
        conversation.id,
        "user",
        lastUserMessage(messages),
      );
    }
  } catch (error) {
    next(error);
    return;
  }

  let streamStarted = false;
  let assistantText = "";
  let persisted = false;
  let clientDisconnected = false;

  const persistAssistant = async (): Promise<void> => {
    if (persisted || !conversation || !assistantText.trim()) return;
    persisted = true;
    try {
      await appendMessage(userId, conversation.id, "assistant", assistantText);
    } catch (error) {
      console.error("Failed to persist assistant message:", error);
    }
  };

  // Fetch aborts close the response stream; preserve content already sent.
  response.once("close", () => {
    if (!response.writableEnded) {
      clientDisconnected = true;
      void persistAssistant();
    }
  });

  try {
    response.status(200).set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    response.flushHeaders();

    if (conversation) {
      response.write(
        `event: meta\ndata: ${JSON.stringify({
          conversationId: conversation.id,
          title: conversation.title,
        })}\n\n`,
      );
    }

    for await (const chunk of ollamaService.stream(messages, model)) {
      if (clientDisconnected) break;
      streamStarted = true;
      const content = chunk.message?.content ?? "";
      if (content) {
        assistantText += content;
        response.write(`data: ${JSON.stringify({ model: chunk.model, content })}\n\n`);
      }
    }

    await persistAssistant();
    if (!clientDisconnected) {
      response.write("data: [DONE]\n\n");
      response.end();
    }
  } catch (error) {
    console.error("Chat stream failed:", error);
    await persistAssistant();

    if (clientDisconnected) return;

    if (response.headersSent && !response.writableEnded) {
      response.write(
        `event: error\ndata: ${JSON.stringify({ error: streamStarted ? "The model stream was interrupted." : "Unable to connect to the model host." })}\n\n`,
      );
      response.end();
    } else if (!response.headersSent) {
      sendError(
        response,
        502,
        "Unable to connect to the model host. Check that it is running and the configured model is installed.",
      );
    }
  }
}

export async function models(
  _request: Request,
  response: Response,
): Promise<void> {
  response.json({ models: await ollamaService.getModels() });
}

export async function health(
  _request: Request,
  response: Response,
): Promise<void> {
  const status = await ollamaService.getAvailabilityDetails();
  response.status(status.available ? 200 : 503).json({
    success: true,
    service: "cognita-backend",
    ollama: status.available,
    model: ollamaService.getModel(),
    connection: status.connection,
    host: status.host,
  });
}
