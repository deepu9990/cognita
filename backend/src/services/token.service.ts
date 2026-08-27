import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import type { Types } from "mongoose";
import { env } from "../config/env.js";
import { RefreshToken } from "../models/refreshToken.model.js";

// Stored client-side in localStorage now, so the access token itself carries the 1 day session length.
const ACCESS_TOKEN_TTL_SECONDS = 24 * 60 * 60; // was 15 * 60 when using httpOnly cookies
const REFRESH_TOKEN_TTL_DAYS = 30;

export interface AccessTokenPayload {
  sub: string;
}

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_ACCESS_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
  if (typeof decoded === "string" || !decoded.sub) {
    throw new Error("Malformed access token");
  }
  return { sub: String(decoded.sub) };
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function issueRefreshToken(
  userId: Types.ObjectId,
  userAgent?: string,
): Promise<string> {
  const token = crypto.randomBytes(48).toString("hex");
  const expiresAt = new Date(
    Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  await RefreshToken.create({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    userAgent,
  });

  return token;
}

export async function rotateRefreshToken(
  token: string,
  userAgent?: string,
): Promise<{ userId: Types.ObjectId; refreshToken: string } | null> {
  const stored = await RefreshToken.findOne({ tokenHash: hashToken(token) });

  if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
    return null;
  }

  stored.revokedAt = new Date();
  await stored.save();

  const refreshToken = await issueRefreshToken(stored.userId, userAgent);
  return { userId: stored.userId, refreshToken };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await RefreshToken.updateOne(
    { tokenHash: hashToken(token), revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
}
