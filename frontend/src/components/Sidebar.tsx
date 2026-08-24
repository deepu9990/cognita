import { useState } from "react";
import { Check, Ghost, Pencil, Plus, Trash2, X } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "../lib/utils";
import { UserMenu } from "./UserMenu";
import type { ConversationSummary } from "../types/conversation.types";

interface SidebarProps {
  conversations: ConversationSummary[];
  loading: boolean;
  temporary: boolean;
  onToggleTemporary: () => void;
  onNewChat: () => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function groupLabel(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const days = Math.floor((now.getTime() - date.getTime()) / 86_400_000);

  if (days < 1) return "Today";
  if (days < 7) return "Previous 7 days";
  if (days < 30) return "Previous 30 days";
  return "Older";
}

export function Sidebar({
  conversations,
  loading,
  temporary,
  onToggleTemporary,
  onNewChat,
  onRename,
  onDelete,
}: SidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  const groups = conversations.reduce<Record<string, ConversationSummary[]>>(
    (accumulator, conversation) => {
      const label = groupLabel(conversation.lastMessageAt);
      accumulator[label] = [...(accumulator[label] ?? []), conversation];
      return accumulator;
    },
    {},
  );

  async function commitRename(id: string) {
    const title = draftTitle.trim();
    setEditingId(null);
    if (title) await onRename(id, title);
  }

  return (
    <aside className="flex h-full w-full flex-col border-r border-border bg-muted">
      <div className="space-y-2.5 p-4">
        <button
          type="button"
          onClick={onNewChat}
          className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-3 text-sm font-medium transition hover:bg-accent"
        >
          <Plus className="h-4 w-4 text-primary" />
          New chat
        </button>

        <button
          type="button"
          onClick={onToggleTemporary}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-3 text-sm font-medium transition",
            temporary
              ? "border-border bg-accent text-foreground"
              : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <Ghost className="h-4 w-4 text-primary" />
          Temporary chat
          <span
            className={cn(
              "ml-auto h-2 w-2 rounded-full",
              temporary ? "bg-primary" : "bg-border",
            )}
          />
        </button>
      </div>

      <nav className="scrollbar-thin min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {loading && (
          <p className="px-2 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            Loading history...
          </p>
        )}

        {!loading && conversations.length === 0 && (
          <p className="px-2 text-[11px] text-muted-foreground">
            No conversations yet.
          </p>
        )}

        {Object.entries(groups).map(([label, items]) => (
          <div key={label} className="space-y-1">
            <p className="px-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {label}
            </p>

            {items.map((conversation) => (
              <div key={conversation.id} className="group relative">
                {editingId === conversation.id ? (
                  <div className="flex items-center gap-1 px-1">
                    <input
                      autoFocus
                      value={draftTitle}
                      onChange={(event) => setDraftTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter")
                          void commitRename(conversation.id);
                        if (event.key === "Escape") setEditingId(null);
                      }}
                      className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-foreground/30"
                    />
                    <button
                      type="button"
                      aria-label="Save title"
                      onClick={() => void commitRename(conversation.id)}
                      className="rounded p-1 text-muted-foreground hover:text-foreground"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Cancel rename"
                      onClick={() => setEditingId(null)}
                      className="rounded p-1 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <NavLink
                    to={`/c/${conversation.id}`}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2 rounded-xl px-3.5 py-2.5 pr-14 text-xs transition",
                        isActive
                          ? "bg-accent font-medium text-accent-foreground"
                          : "text-muted-foreground hover:bg-card hover:text-foreground",
                      )
                    }
                  >
                    <span className="truncate">{conversation.title}</span>
                  </NavLink>
                )}

                {editingId !== conversation.id && (
                  <div className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 group-hover:flex">
                    <button
                      type="button"
                      aria-label="Rename conversation"
                      onClick={() => {
                        setEditingId(conversation.id);
                        setDraftTitle(conversation.title);
                      }}
                      className="rounded p-1.5 text-muted-foreground transition hover:bg-background hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Delete conversation"
                      onClick={() => void onDelete(conversation.id)}
                      className="rounded p-1.5 text-muted-foreground transition hover:bg-background hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </nav>

      <UserMenu />
    </aside>
  );
}
