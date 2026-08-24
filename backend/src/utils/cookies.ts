import type { Response } from "express";
import { env, isProduction } from "../config/env.js";

const ACCESS_COOKIE = "access_token";
const REFRESH_COOKIE = "refresh_token";
const REFRESH_COOKIE_PATH = "/api/auth";

const ACCESS_MAX_AGE = 15 * 60 * 1000;
const REFRESH_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

function baseOptions() {
  return {
    httpOnly: true,
    secure: isProduction,
    // Cross-site XHR only carries the cookie when SameSite is None, which requires Secure.
    sameSite: isProduction ? ("none" as const) : ("lax" as const),
    domain: env.COOKIE_DOMAIN,
  };
}

export function setAuthCookies(
  response: Response,
  accessToken: string,
  refreshToken: string,
): void {
  response.cookie(ACCESS_COOKIE, accessToken, {
    ...baseOptions(),
    path: "/",
    maxAge: ACCESS_MAX_AGE,
  });

  response.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseOptions(),
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_MAX_AGE,
  });
}

export function clearAuthCookies(response: Response): void {
  response.clearCookie(ACCESS_COOKIE, { ...baseOptions(), path: "/" });
  response.clearCookie(REFRESH_COOKIE, {
    ...baseOptions(),
    path: REFRESH_COOKIE_PATH,
  });
}

export { ACCESS_COOKIE, REFRESH_COOKIE };
