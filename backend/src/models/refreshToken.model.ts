import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const refreshTokenSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    revokedAt: {
      type: Date,
    },
    userAgent: {
      type: String,
    },
  },
  { timestamps: true },
);

// Mongo removes the document once expiresAt passes.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type RefreshTokenDocument = InferSchemaType<
  typeof refreshTokenSchema
> & {
  _id: Types.ObjectId;
};

export const RefreshToken = model("RefreshToken", refreshTokenSchema);
