import type { Request, Response } from "express";
import { ollamaService } from "../services/ollama.service.js";
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

function sendError(response: Response, status: number, error: string): void {
  const payload: ApiError = { success: false, error };
  response.status(status).json(payload);
}

export async function chat(
  request: Request,
  response: Response,
): Promise<void> {
  let messages: ChatMessage[];
  try {
    messages = getValidatedMessages(request.body);
  } catch (error) {
    sendError(
      response,
      400,
      error instanceof Error ? error.message : "Invalid chat request",
    );
    return;
  }

  try {
    const result = await ollamaService.chat(messages);
    response.json({ success: true, message: result.message });
  } catch (error) {
    console.error("Chat request failed:", error);
    sendError(
      response,
      502,
      "Unable to get a response from Ollama. Check that Ollama is running and the configured model is installed.",
    );
  }
}

export async function streamChat(
  request: Request,
  response: Response,
): Promise<void> {
  let messages: ChatMessage[];
  try {
    messages = getValidatedMessages(request.body);
  } catch (error) {
    sendError(
      response,
      400,
      error instanceof Error ? error.message : "Invalid chat request",
    );
    return;
  }

  let streamStarted = false;
  try {
    response.status(200).set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    response.flushHeaders();

    for await (const chunk of ollamaService.stream(messages)) {
      streamStarted = true;
      const content = chunk.message?.content ?? "";
      if (content) {
        response.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }
    response.write("data: [DONE]\n\n");
    response.end();
  } catch (error) {
    console.error("Chat stream failed:", error);
    if (response.headersSent && !response.writableEnded) {
      response.write(
        `event: error\ndata: ${JSON.stringify({ error: streamStarted ? "The Ollama stream was interrupted." : "Unable to connect to Ollama." })}\n\n`,
      );
      response.end();
    } else {
      sendError(
        response,
        502,
        "Unable to connect to Ollama. Check that Ollama is running and the configured model is installed.",
      );
    }
  }
}

export async function health(
  _request: Request,
  response: Response,
): Promise<void> {
  const status = await ollamaService.getAvailabilityDetails();
  response.status(status.available ? 200 : 503).json({
    success: true,
    service: "local-gpt-backend",
    ollama: status.available,
    model: ollamaService.getModel(),
    connection: status.connection,
    host: status.host,
  });
}
