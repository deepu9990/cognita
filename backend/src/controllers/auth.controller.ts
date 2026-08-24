import type { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { env, googleOAuthEnabled, isProduction } from "../config/env.js";
import { getProfile, login, signup } from "../services/auth.service.js";
import {
  buildAuthUrl,
  createPkcePair,
  createState,
  exchangeCodeForProfile,
  findOrCreateGoogleUser,
} from "../services/google.service.js";
import {
  issueRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
} from "../services/token.service.js";
import { toPublicUser } from "../models/user.model.js";
import {
  REFRESH_COOKIE,
  clearAuthCookies,
  setAuthCookies,
} from "../utils/cookies.js";
import { HttpError } from "../utils/httpError.js";

const OAUTH_STATE_COOKIE = "oauth_state";
const OAUTH_VERIFIER_COOKIE = "oauth_verifier";
const OAUTH_COOKIE_MAX_AGE = 10 * 60 * 1000;

const signupSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(200),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

async function establishSession(
  response: Response,
  userId: Types.ObjectId,
  userAgent?: string,
): Promise<void> {
  const accessToken = signAccessToken(userId.toString());
  const refreshToken = await issueRefreshToken(userId, userAgent);
  setAuthCookies(response, accessToken, refreshToken);
}

export async function signupHandler(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = signupSchema.parse(request.body);
    const user = await signup(input);
    await establishSession(
      response,
      new Types.ObjectId(user.id),
      request.get("user-agent"),
    );
    response.status(201).json({ success: true, user });
  } catch (error) {
    next(error);
  }
}

export async function loginHandler(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = loginSchema.parse(request.body);
    const user = await login(input);
    await establishSession(
      response,
      new Types.ObjectId(user.id),
      request.get("user-agent"),
    );
    response.json({ success: true, user });
  } catch (error) {
    next(error);
  }
}

export async function refreshHandler(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = request.cookies?.[REFRESH_COOKIE];
    if (!token) {
      throw new HttpError(401, "Session expired. Please sign in again.");
    }

    const rotated = await rotateRefreshToken(token, request.get("user-agent"));
    if (!rotated) {
      clearAuthCookies(response);
      throw new HttpError(401, "Session expired. Please sign in again.");
    }

    const accessToken = signAccessToken(rotated.userId.toString());
    setAuthCookies(response, accessToken, rotated.refreshToken);

    const user = await getProfile(rotated.userId.toString());
    response.json({ success: true, user });
  } catch (error) {
    next(error);
  }
}

export async function logoutHandler(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = request.cookies?.[REFRESH_COOKIE];
    if (token) await revokeRefreshToken(token);
    clearAuthCookies(response);
    response.json({ success: true });
  } catch (error) {
    next(error);
  }
}

export async function meHandler(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = await getProfile(request.userId as string);
    response.json({ success: true, user });
  } catch (error) {
    next(error);
  }
}

export function googleRedirectHandler(
  _request: Request,
  response: Response,
  next: NextFunction,
): void {
  try {
    if (!googleOAuthEnabled) {
      throw new HttpError(503, "Google sign-in is not configured.");
    }

    const state = createState();
    const { verifier, challenge } = createPkcePair();

    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax" as const,
      maxAge: OAUTH_COOKIE_MAX_AGE,
      path: "/api/auth",
    };

    response.cookie(OAUTH_STATE_COOKIE, state, cookieOptions);
    response.cookie(OAUTH_VERIFIER_COOKIE, verifier, cookieOptions);
    response.redirect(buildAuthUrl(state, challenge));
  } catch (error) {
    next(error);
  }
}

export async function googleCallbackHandler(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const code = String(request.query.code ?? "");
    const state = String(request.query.state ?? "");
    const expectedState = request.cookies?.[OAUTH_STATE_COOKIE];
    const verifier = request.cookies?.[OAUTH_VERIFIER_COOKIE];

    response.clearCookie(OAUTH_STATE_COOKIE, { path: "/api/auth" });
    response.clearCookie(OAUTH_VERIFIER_COOKIE, { path: "/api/auth" });

    if (!code || !state || !expectedState || state !== expectedState) {
      throw new HttpError(400, "Invalid Google sign-in request.");
    }

    const profile = await exchangeCodeForProfile(code, verifier);
    const user = await findOrCreateGoogleUser(profile);

    await establishSession(response, user._id, request.get("user-agent"));
    response.redirect(env.FRONTEND_URL.split(",")[0].trim());
  } catch (error) {
    next(error);
  }
}

export { toPublicUser };
