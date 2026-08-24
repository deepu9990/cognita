import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as authApi from "../services/authApi";
import { setUnauthorizedHandler } from "../services/apiClient";
import type { AuthStatus, AuthUser } from "../types/auth.types";

interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setStatus("guest");
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    void authApi.fetchCurrentUser().then((currentUser) => {
      if (cancelled) return;
      setUser(currentUser);
      setStatus(currentUser ? "authed" : "guest");
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const nextUser = await authApi.login(email, password);
    setUser(nextUser);
    setStatus("authed");
  }, []);

  const signup = useCallback(
    async (name: string, email: string, password: string) => {
      const nextUser = await authApi.signup(name, email, password);
      setUser(nextUser);
      setStatus("authed");
    },
    [],
  );

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
    setStatus("guest");
  }, []);

  const value = useMemo(
    () => ({ user, status, login, signup, logout }),
    [user, status, login, signup, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
