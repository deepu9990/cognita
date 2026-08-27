import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { googleSignInUrl } from "../services/authApi";
import { Logo } from "./Logo";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";

interface AuthFormProps {
  mode: "login" | "signup";
}

export function AuthForm({ mode }: AuthFormProps) {
  const { status, login, signup } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isSignup = mode === "signup";

  if (status === "authed") return <Navigate to="/" replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    setError(null);
    setSubmitting(true);
    try {
      if (isSignup) {
        await signup(name.trim(), email.trim(), password);
      } else {
        await login(email.trim(), password);
      }
      navigate("/", { replace: true });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-full items-center justify-center px-4 py-10">
      <Card className="animate-fade-in-up relative w-full max-w-md border-border bg-card">
        <CardContent className="p-7 sm:p-9">
          <div className="mb-7 flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-glow">
              <Logo className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold tracking-tight">Cognita</p>
              <p className="text-xs text-muted-foreground">
                {isSignup ? "Create your account" : "Welcome back"}
              </p>
            </div>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight">
            {isSignup ? "Sign up" : "Sign in"}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {isSignup
              ? "Your chats stay private and tied to your account."
              : "Pick up right where you left off."}
          </p>

          <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
            {isSignup && (
              <div className="space-y-1.5">
                <label
                  className="text-xs font-medium text-muted-foreground"
                  htmlFor="name"
                >
                  Name
                </label>
                <input
                  id="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  maxLength={80}
                  autoComplete="name"
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-base outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20 sm:text-sm"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor="email"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
                className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-base outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20 sm:text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor="password"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={isSignup ? 8 : undefined}
                autoComplete={isSignup ? "new-password" : "current-password"}
                className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-base outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20 sm:text-sm"
              />
              {isSignup && (
                <p className="text-[11px] text-muted-foreground">
                  At least 8 characters.
                </p>
              )}
            </div>

            {error && (
              <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting
                ? "Please wait..."
                : isSignup
                  ? "Create account"
                  : "Sign in"}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              or
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <a
            href={googleSignInUrl}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background text-sm font-medium transition hover:border-primary/40 hover:bg-accent"
          >
            Continue with Google
          </a>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            {isSignup ? "Already have an account? " : "New here? "}
            <Link
              to={isSignup ? "/login" : "/signup"}
              className="font-medium text-primary hover:underline"
            >
              {isSignup ? "Sign in" : "Create an account"}
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
