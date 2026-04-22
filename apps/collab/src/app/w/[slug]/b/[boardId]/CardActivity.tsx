"use client";

import { useEffect, useState } from "react";

type Actor = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
};

type Entry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  actor: Actor | null;
};

export function CardActivity({ cardId }: { cardId: string }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/cards/${cardId}/activity?limit=30`);
        if (cancelled) return;
        if (!res.ok) {
          setError("Could not load history.");
          return;
        }
        setEntries(await res.json());
      } catch {
        if (!cancelled) setError("Network error.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  return (
    <div className="border-t border-neutral-800 px-6 py-4 space-y-3">
      <h3 className="text-sm font-semibold text-neutral-200">
        History
        {entries ? (
          <span className="ml-2 text-xs text-neutral-500">
            ({entries.length})
          </span>
        ) : null}
      </h3>

      {entries === null ? (
        <p className="text-xs text-neutral-500">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-neutral-500">Nothing recorded yet.</p>
      ) : (
        <ol className="space-y-2">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex items-start gap-2 text-xs text-neutral-300"
            >
              <span
                aria-hidden
                className="mt-1 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-neutral-600"
              />
              <div className="min-w-0">
                <div>
                  <span className="font-medium text-neutral-100">
                    {e.actor?.name ?? e.actor?.email ?? "Someone"}
                  </span>{" "}
                  <span className="text-neutral-400">
                    {summarize(e.action, e.payload)}
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] text-neutral-500">
                  {new Date(e.createdAt)
                    .toISOString()
                    .slice(0, 16)
                    .replace("T", " ")}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-300"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function summarize(action: string, payload: Record<string, unknown>): string {
  const title = typeof payload.title === "string" ? payload.title : null;
  const excerpt = typeof payload.excerpt === "string" ? payload.excerpt : null;
  const toListTitle =
    typeof payload.toListTitle === "string" ? payload.toListTitle : null;
  const fields = Array.isArray(payload.fields)
    ? payload.fields.filter((f): f is string => typeof f === "string")
    : null;

  switch (action) {
    case "CARD_CREATED":
      return `created this card${title ? ` "${title}"` : ""}`;
    case "CARD_UPDATED":
      if (fields && fields.length > 0) {
        return `edited ${fields.join(", ")}`;
      }
      return "edited this card";
    case "CARD_MOVED":
      return toListTitle ? `moved to ${toListTitle}` : "moved this card";
    case "CARD_DELETED":
      return "deleted this card";
    case "COMMENT_CREATED":
      return excerpt
        ? `commented: "${excerpt.slice(0, 100)}${excerpt.length > 100 ? "…" : ""}"`
        : "posted a comment";
    case "COMMENT_DELETED":
      return "deleted a comment";
    default:
      return action.toLowerCase().replace(/_/g, " ");
  }
}
