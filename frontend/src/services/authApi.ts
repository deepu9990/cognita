import { API_URL, apiFetch, apiJson } from "./apiClient";
import type { AuthUser } from "../types/auth.types";

interface AuthResponse {
  success: true;
  user: AuthUser;
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
  return data.user;
}

export async function logout(): Promise<void> {
  await apiFetch(
    "/api/auth/logout",
    { method: "POST" },
    { retryOnUnauthorized: false },
  );
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const response = await apiFetch("/api/auth/me", {}, {});
  if (!response.ok) return null;
  const data = (await response.json()) as AuthResponse;
  return data.user;
}

export const googleSignInUrl = `${API_URL}/api/auth/google`;
