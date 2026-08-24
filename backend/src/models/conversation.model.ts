import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const conversationSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
      default: "New chat",
    },
    model: {
      type: String,
      required: true,
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

conversationSchema.index({ userId: 1, updatedAt: -1 });

export type ConversationDocument = InferSchemaType<
  typeof conversationSchema
> & {
  _id: Types.ObjectId;
};

export const Conversation = model("Conversation", conversationSchema);
