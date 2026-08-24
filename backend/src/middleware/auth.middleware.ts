import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../services/token.service.js";
import { ACCESS_COOKIE } from "../utils/cookies.js";
import { HttpError } from "../utils/httpError.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

function readUserId(request: Request): string | null {
  const token = request.cookies?.[ACCESS_COOKIE];
  if (!token) return null;

  try {
    return verifyAccessToken(token).sub;
  } catch {
    return null;
  }
}

export function requireAuth(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  const userId = readUserId(request);
  if (!userId) {
    next(new HttpError(401, "Authentication required."));
    return;
  }

  request.userId = userId;
  next();
}

export function optionalAuth(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  const userId = readUserId(request);
  if (userId) request.userId = userId;
  next();
}
