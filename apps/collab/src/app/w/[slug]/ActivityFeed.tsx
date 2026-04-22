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

type Props = {
  workspaceId: string;
};

const PAGE_SIZE = 30;

export function ActivityFeed({ workspaceId }: Props) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/activity?limit=${PAGE_SIZE}`,
        );
        if (cancelled) return;
        if (!res.ok) {
          setError("Could not load activity.");
          return;
        }
        const rows: Entry[] = await res.json();
        setEntries(rows);
        if (rows.length < PAGE_SIZE) setExhausted(true);
      } catch {
        if (!cancelled) setError("Network error loading activity.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const loadMore = async () => {
    if (!entries || loadingMore || exhausted) return;
    const last = entries[entries.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/activity?limit=${PAGE_SIZE}&cursor=${encodeURIComponent(last.id)}`,
      );
      if (!res.ok) {
        setError("Could not load more.");
        return;
      }
      const rows: Entry[] = await res.json();
      setEntries((prev) => [...(prev ?? []), ...rows]);
      if (rows.length < PAGE_SIZE) setExhausted(true);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <section className="mt-12">
      <h2 className="text-2xl font-bold tracking-tight">Activity</h2>
      <p className="mt-1 text-sm text-neutral-400">
        Recent changes across this workspace.
      </p>

      {entries === null ? (
        <p className="mt-4 text-xs text-neutral-500">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="mt-4 text-xs text-neutral-500">
          No activity yet. Create a board or a card to see it appear here.
        </p>
      ) : (
        <ol className="mt-4 divide-y divide-neutral-800 rounded-2xl border border-neutral-800 bg-neutral-900">
          {entries.map((e) => (
            <li key={e.id} className="px-5 py-3 text-sm">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 h-6 w-6 rounded-full bg-neutral-800 flex items-center justify-center text-[10px] text-neutral-400 flex-shrink-0">
                  {(e.actor?.name ?? e.actor?.email ?? "?")
                    .charAt(0)
                    .toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-neutral-100">
                    <span className="font-medium">
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
                      .replace("T", " ")}{" "}
                    · {e.action}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      {entries && !exhausted ? (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="mt-3 rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 transition disabled:opacity-60"
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}

/**
 * Render a one-line human summary of an activity entry. Falls back to the
 * raw action when we don't have a dedicated template.
 */
function summarize(action: string, payload: Record<string, unknown>): string {
  const title = typeof payload.title === "string" ? payload.title : null;
  const excerpt = typeof payload.excerpt === "string" ? payload.excerpt : null;
  const toListTitle =
    typeof payload.toListTitle === "string" ? payload.toListTitle : null;
  const listTitle =
    typeof payload.listTitle === "string" ? payload.listTitle : null;

  switch (action) {
    case "CARD_CREATED":
      return listTitle
        ? `added "${title ?? "a card"}" to ${listTitle}`
        : `added a card${title ? ` "${title}"` : ""}`;
    case "CARD_UPDATED":
      return `edited card${title ? ` "${title}"` : ""}`;
    case "CARD_MOVED":
      return toListTitle
        ? `moved "${title ?? "a card"}" to ${toListTitle}`
        : "moved a card";
    case "CARD_DELETED":
      return `deleted card${title ? ` "${title}"` : ""}`;
    case "LIST_CREATED":
      return `created list${title ? ` "${title}"` : ""}`;
    case "LIST_UPDATED":
      return `renamed a list${title ? ` to "${title}"` : ""}`;
    case "LIST_DELETED":
      return `deleted list${title ? ` "${title}"` : ""}`;
    case "COMMENT_CREATED":
      return excerpt
        ? `commented: "${excerpt.slice(0, 80)}${excerpt.length > 80 ? "…" : ""}"`
        : "posted a comment";
    case "COMMENT_DELETED":
      return "deleted a comment";
    default:
      return action.toLowerCase().replace(/_/g, " ");
  }
}
