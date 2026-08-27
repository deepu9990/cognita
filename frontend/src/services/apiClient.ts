import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  saveTokens,
} from "../lib/tokenStorage";

// Empty means same-origin, which lets the dev proxy keep cookies first-party.
export const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let refreshPromise: Promise<boolean> | null = null;
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

async function readError(response: Response): Promise<string> {
  try {
    const data = (await response.clone().json()) as { error?: string };
    return data.error ?? `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

/** Runs at most one refresh at a time so parallel 401s do not stampede. */
async function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      // --- Cookie-based refresh (kept for reference) ---
      // const response = await fetch(`${API_URL}/api/auth/refresh`, {
      //   method: "POST",
      //   credentials: "include",
      // });
      // return response.ok;

      const refreshToken = getRefreshToken();
      if (!refreshToken) return false;
      try {
        const response = await fetch(`${API_URL}/api/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        if (!response.ok) return false;
        const data = (await response.json()) as {
          accessToken: string;
          refreshToken: string;
        };
        saveTokens(data);
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function apiFetch(
  path: string,
  init: RequestInit = {},
  options: { retryOnUnauthorized?: boolean } = {},
): Promise<Response> {
  const { retryOnUnauthorized = true } = options;

  const request = (): Promise<Response> => {
    const accessToken = getAccessToken();
    return fetch(`${API_URL}${path}`, {
      ...init,
      // --- Cookie-based auth (kept for reference) ---
      // credentials: "include",
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...init.headers,
      },
    });
  };

  let response = await request();

  if (response.status === 401 && retryOnUnauthorized) {
    const refreshed = await refreshSession();
    if (refreshed) {
      response = await request();
    } else {
      clearTokens();
      onUnauthorized?.();
    }
  }

  return response;
}

export async function apiJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await apiFetch(path, init);
  if (!response.ok) {
    throw new ApiError(response.status, await readError(response));
  }
  return (await response.json()) as T;
}
