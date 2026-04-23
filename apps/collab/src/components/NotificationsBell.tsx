"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Row = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

type Payload = {
  rows: Row[];
  unread: number;
};

const POLL_MS = 30_000;

/**
 * Bell icon + dropdown for the top nav. Polls /api/notifications every 30s
 * and shows an unread badge. On open, we offer a "Mark all as read" action
 * and per-row links (if the payload contains a navigable target).
 */
export function NotificationsBell() {
  const [data, setData] = useState<Payload | null>(null);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/notifications?limit=20");
        if (cancelled) return;
        if (!res.ok) return;
        const body = (await res.json()) as Payload;
        setData(body);
      } catch {
        /* ignore */
      }
    };
    void load();
    const t = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const markAll = async () => {
    const res = await fetch("/api/notifications/read", { method: "POST" });
    if (res.ok) {
      setData((prev) =>
        prev
          ? {
              unread: 0,
              rows: prev.rows.map((r) => ({
                ...r,
                readAt: r.readAt ?? new Date().toISOString(),
              })),
            }
          : prev,
      );
    }
  };

  const markOne = async (id: string) => {
    const res = await fetch(`/api/notifications/${id}/read`, {
      method: "POST",
    });
    if (res.ok) {
      setData((prev) =>
        prev
          ? {
              unread: Math.max(0, prev.unread - 1),
              rows: prev.rows.map((r) =>
                r.id === id
                  ? { ...r, readAt: r.readAt ?? new Date().toISOString() }
                  : r,
              ),
            }
          : prev,
      );
    }
  };

  const unread = data?.unread ?? 0;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md p-2 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/80 transition"
      >
        <BellGlyph />
        {unread > 0 ? (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 min-w-[1rem] rounded-full bg-red-500 px-1 text-center text-[10px] font-medium text-white"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-[360px] rounded-xl border border-neutral-800 bg-neutral-900 shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-2">
            <div className="text-sm font-semibold text-neutral-100">
              Notifications
            </div>
            <button
              type="button"
              disabled={!unread}
              onClick={() => void markAll()}
              className="text-[11px] text-indigo-300 hover:text-indigo-200 disabled:text-neutral-600"
            >
              Mark all read
            </button>
          </div>

          <div className="max-h-[360px] overflow-y-auto">
            {data === null ? (
              <p className="px-4 py-6 text-center text-xs text-neutral-500">
                Loading…
              </p>
            ) : data.rows.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-neutral-500">
                You&apos;re all caught up.
              </p>
            ) : (
              <ul className="divide-y divide-neutral-800">
                {data.rows.map((r) => (
                  <Item
                    key={r.id}
                    row={r}
                    onMarkRead={() => void markOne(r.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Item({ row, onMarkRead }: { row: Row; onMarkRead: () => void }) {
  const actor =
    typeof row.payload.actorName === "string"
      ? row.payload.actorName
      : "Someone";
  const excerpt =
    typeof row.payload.excerpt === "string"
      ? row.payload.excerpt.slice(0, 140)
      : "";
  const href = buildHref(row);
  const unread = !row.readAt;
  const when = new Date(row.createdAt)
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");

  const Body = (
    <div className="flex-1 min-w-0">
      <div className="text-sm text-neutral-100">
        <span className="font-medium">{actor}</span>{" "}
        <span className="text-neutral-400">{summarize(row.type)}</span>
      </div>
      {excerpt ? (
        <div className="mt-0.5 text-xs text-neutral-400 line-clamp-2">
          &ldquo;{excerpt}&rdquo;
        </div>
      ) : null}
      <div className="mt-0.5 text-[10px] text-neutral-500">{when}</div>
    </div>
  );

  return (
    <li
      className={`flex items-start gap-3 px-4 py-3 ${
        unread ? "bg-indigo-500/5" : ""
      }`}
    >
      {unread ? (
        <span
          aria-hidden
          className="mt-1.5 inline-block h-2 w-2 flex-shrink-0 rounded-full bg-indigo-400"
        />
      ) : (
        <span className="mt-1.5 inline-block h-2 w-2 flex-shrink-0 rounded-full bg-transparent" />
      )}
      {href ? (
        <Link
          href={href}
          onClick={() => unread && onMarkRead()}
          className="flex-1 min-w-0 hover:text-neutral-50"
        >
          {Body}
        </Link>
      ) : (
        Body
      )}
    </li>
  );
}

function summarize(type: string): string {
  switch (type) {
    case "MENTION":
      return "mentioned you in a comment";
    case "ASSIGNED":
      return "assigned you to a card";
    case "DUE_SOON":
      return "a card you watch is due soon";
    case "INVITED":
      return "invited you to a workspace";
    case "COMMENT_ON_CARD":
      return "commented on a card";
    default:
      return type.toLowerCase().replace(/_/g, " ");
  }
}

/**
 * Build the deep link for a notification row when enough context lives in the
 * payload. Returns null if we can't navigate anywhere useful — the row still
 * renders, just without a link.
 */
function buildHref(row: Row): string | null {
  if (row.type === "MENTION" || row.type === "COMMENT_ON_CARD") {
    const ws = row.payload.workspaceSlug;
    const boardId = row.payload.boardId;
    const cardId = row.payload.cardId;
    if (
      typeof ws === "string" &&
      typeof boardId === "string" &&
      typeof cardId === "string"
    ) {
      return `/w/${ws}/b/${boardId}?card=${cardId}`;
    }
  }
  return null;
}

function BellGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
