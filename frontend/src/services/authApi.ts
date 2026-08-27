import { API_URL, apiFetch, apiJson } from "./apiClient";
import { clearTokens, saveTokens } from "../lib/tokenStorage";
import type { AuthUser } from "../types/auth.types";

interface AuthResponse {
  success: true;
  user: AuthUser;
  accessToken?: string;
  refreshToken?: string;
}

export async function signup(
  name: string,
  email: string,
  password: string,
): Promise<AuthUser> {
  const data = await apiJson<AuthResponse>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
  saveTokens(data);
  return data.user;
}

export async function login(
  email: string,
  password: string,
): Promise<AuthUser> {
  const data = await apiJson<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  saveTokens(data);
  return data.user;
}

export async function logout(): Promise<void> {
  // --- Cookie-based logout (kept for reference) ---
  // await apiFetch("/api/auth/logout", { method: "POST" }, { retryOnUnauthorized: false });

  await apiFetch(
    "/api/auth/logout",
    { method: "POST" },
    { retryOnUnauthorized: false },
  );
  clearTokens();
}

export async function fetchCurrentUser(
  signal?: AbortSignal,
): Promise<AuthUser | null> {
  const response = await apiFetch("/api/auth/me", { signal }, {});
  if (!response.ok) return null;
  const data = (await response.json()) as AuthResponse;
  return data.user;
}

/** Stores tokens delivered via the Google OAuth redirect (see AuthCallbackPage). */
export function saveOAuthTokens(
  accessToken: string,
  refreshToken: string,
): void {
  saveTokens({ accessToken, refreshToken });
}

export const googleSignInUrl = `${API_URL}/api/auth/google`;
