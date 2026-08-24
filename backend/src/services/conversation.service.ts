import { Types } from "mongoose";
import { Conversation } from "../models/conversation.model.js";
import { Message } from "../models/message.model.js";
import { HttpError } from "../utils/httpError.js";
import type { MessageRole } from "../types/chat.types.js";

const MAX_TITLE_LENGTH = 60;

export interface ConversationSummary {
  id: string;
  title: string;
  model: string;
  lastMessageAt: string;
  updatedAt: string;
}

export interface StoredMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
}

function toObjectId(value: string, label: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) {
    throw new HttpError(404, `${label} was not found.`);
  }
  return new Types.ObjectId(value);
}

export function buildTitle(firstMessage: string): string {
  const normalized = firstMessage.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_TITLE_LENGTH) return normalized || "New chat";
  return `${normalized.slice(0, MAX_TITLE_LENGTH).trimEnd()}...`;
}

export async function listConversations(
  userId: string,
  limit = 50,
): Promise<ConversationSummary[]> {
  const conversations = await Conversation.find({
    userId: toObjectId(userId, "User"),
  })
    .sort({ updatedAt: -1 })
    .limit(Math.min(limit, 100))
    .lean();

  return conversations.map((conversation) => ({
    id: conversation._id.toString(),
    title: conversation.title,
    model: conversation.model,
    lastMessageAt: (
      conversation.lastMessageAt ?? conversation.updatedAt
    ).toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  }));
}

export async function getConversationWithMessages(
  userId: string,
  conversationId: string,
): Promise<{ conversation: ConversationSummary; messages: StoredMessage[] }> {
  const conversation = await Conversation.findOne({
    _id: toObjectId(conversationId, "Conversation"),
    userId: toObjectId(userId, "User"),
  }).lean();

  if (!conversation) {
    throw new HttpError(404, "Conversation was not found.");
  }

  const messages = await Message.find({ conversationId: conversation._id })
    .sort({ createdAt: 1 })
    .lean();

  return {
    conversation: {
      id: conversation._id.toString(),
      title: conversation.title,
      model: conversation.model,
      lastMessageAt: (
        conversation.lastMessageAt ?? conversation.updatedAt
      ).toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
    },
    messages: messages.map((message) => ({
      id: message._id.toString(),
      role: message.role as MessageRole,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    })),
  };
}

export async function createConversation(
  userId: string,
  firstUserMessage: string,
  model: string,
): Promise<ConversationSummary> {
  const conversation = await Conversation.create({
    userId: toObjectId(userId, "User"),
    title: buildTitle(firstUserMessage),
    model,
    lastMessageAt: new Date(),
  });

  return {
    id: conversation._id.toString(),
    title: conversation.title,
    model: conversation.model,
    lastMessageAt: conversation.lastMessageAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  };
}

export async function assertConversationOwner(
  userId: string,
  conversationId: string,
): Promise<void> {
  const exists = await Conversation.exists({
    _id: toObjectId(conversationId, "Conversation"),
    userId: toObjectId(userId, "User"),
  });

  if (!exists) {
    throw new HttpError(404, "Conversation was not found.");
  }
}

export async function appendMessage(
  userId: string,
  conversationId: string,
  role: MessageRole,
  content: string,
): Promise<void> {
  const now = new Date();

  await Message.create({
    conversationId: toObjectId(conversationId, "Conversation"),
    userId: toObjectId(userId, "User"),
    role,
    content,
  });

  await Conversation.updateOne(
    {
      _id: toObjectId(conversationId, "Conversation"),
      userId: toObjectId(userId, "User"),
    },
    { $set: { lastMessageAt: now } },
  );
}

export async function renameConversation(
  userId: string,
  conversationId: string,
  title: string,
): Promise<ConversationSummary> {
  const conversation = await Conversation.findOneAndUpdate(
    {
      _id: toObjectId(conversationId, "Conversation"),
      userId: toObjectId(userId, "User"),
    },
    { $set: { title: buildTitle(title) } },
    { new: true },
  ).lean();

  if (!conversation) {
    throw new HttpError(404, "Conversation was not found.");
  }

  return {
    id: conversation._id.toString(),
    title: conversation.title,
    model: conversation.model,
    lastMessageAt: (
      conversation.lastMessageAt ?? conversation.updatedAt
    ).toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  };
}

export async function deleteConversation(
  userId: string,
  conversationId: string,
): Promise<void> {
  const conversation = await Conversation.findOneAndDelete({
    _id: toObjectId(conversationId, "Conversation"),
    userId: toObjectId(userId, "User"),
  });

  if (!conversation) {
    throw new HttpError(404, "Conversation was not found.");
  }

  await Message.deleteMany({ conversationId: conversation._id });
}

export async function deleteAllConversations(userId: string): Promise<void> {
  const owner = toObjectId(userId, "User");
  await Conversation.deleteMany({ userId: owner });
  await Message.deleteMany({ userId: owner });
}
