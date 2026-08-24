import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import {
  deleteAllConversations,
  deleteConversation,
  getConversationWithMessages,
  listConversations,
  renameConversation,
} from "../services/conversation.service.js";

const renameSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(120),
});

export async function listHandler(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const conversations = await listConversations(request.userId as string);
    response.json({ success: true, conversations });
  } catch (error) {
    next(error);
  }
}

export async function detailHandler(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await getConversationWithMessages(
      request.userId as string,
      String(request.params.id),
    );
    response.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function renameHandler(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { title } = renameSchema.parse(request.body);
    const conversation = await renameConversation(
      request.userId as string,
      String(request.params.id),
      title,
    );
    response.json({ success: true, conversation });
  } catch (error) {
    next(error);
  }
}

export async function deleteHandler(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await deleteConversation(
      request.userId as string,
      String(request.params.id),
    );
    response.json({ success: true });
  } catch (error) {
    next(error);
  }
}

export async function deleteAllHandler(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await deleteAllConversations(request.userId as string);
    response.json({ success: true });
  } catch (error) {
    next(error);
  }
}
