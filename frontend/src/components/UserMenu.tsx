import { useState } from "react";
import { LogOut } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export function UserMenu() {
  const { user, logout } = useAuth();
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  const initials = user.name.slice(0, 1).toUpperCase();

  async function handleLogout() {
    setBusy(true);
    try {
      await logout();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2.5 border-t border-border px-4 py-4">
      {user.avatarUrl ? (
        <img
          src={user.avatarUrl}
          alt=""
          className="h-8 w-8 rounded-full object-cover"
        />
      ) : (
        <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/90 text-xs font-semibold text-primary-foreground">
          {initials}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{user.name}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {user.email}
        </p>
      </div>

      <button
        type="button"
        onClick={handleLogout}
        disabled={busy}
        aria-label="Log out"
        className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}
