export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  provider: "local" | "google";
}

export type AuthStatus = "loading" | "authed" | "guest";
