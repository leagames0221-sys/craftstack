"use client";

import { useEffect, useRef, useState } from "react";

type Comment = {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  author: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
};

type Props = {
  cardId: string;
  currentUserId: string;
  canComment: boolean;
  canModerate: boolean;
};

export function CommentsPanel({
  cardId,
  currentUserId,
  canComment,
  canModerate,
}: Props) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const aborted = useRef(false);

  useEffect(() => {
    aborted.current = false;
    (async () => {
      try {
        const res = await fetch(`/api/cards/${cardId}/comments`);
        if (aborted.current) return;
        if (!res.ok) {
          setError("Could not load comments.");
          return;
        }
        setComments(await res.json());
      } catch {
        if (!aborted.current) setError("Network error loading comments.");
      }
    })();
    return () => {
      aborted.current = true;
    };
  }, [cardId]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/cards/${cardId}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          (payload && typeof payload.message === "string" && payload.message) ||
            "Could not post comment.",
        );
        return;
      }
      setComments((prev) => [...(prev ?? []), payload as Comment]);
      setDraft("");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    const snapshot = comments;
    setComments((prev) => (prev ?? []).filter((c) => c.id !== id));
    const res = await fetch(`/api/comments/${id}`, { method: "DELETE" });
    if (!res.ok) {
      // Rollback; the server rejected us.
      setComments(snapshot);
      const payload = await res.json().catch(() => ({}));
      setError(
        (payload && typeof payload.message === "string" && payload.message) ||
          "Could not delete comment.",
      );
    }
  };

  return (
    <div className="border-t border-neutral-800 px-6 py-5 space-y-4">
      <h3 className="text-sm font-semibold text-neutral-200">
        Comments
        {comments ? (
          <span className="ml-2 text-xs text-neutral-500">
            ({comments.length})
          </span>
        ) : null}
      </h3>

      {comments === null ? (
        <p className="text-xs text-neutral-500">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-neutral-500">No comments yet.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li
              key={c.id}
              className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium text-neutral-200">
                  {c.author.name ?? c.author.email}
                  <span className="ml-2 font-normal text-neutral-500">
                    {new Date(c.createdAt)
                      .toISOString()
                      .slice(0, 16)
                      .replace("T", " ")}
                  </span>
                </div>
                {c.authorId === currentUserId || canModerate ? (
                  <button
                    type="button"
                    onClick={() => void remove(c.id)}
                    className="text-[10px] text-red-400 hover:text-red-300"
                  >
                    Delete
                  </button>
                ) : null}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-100">
                {c.body}
              </p>
            </li>
          ))}
        </ul>
      )}

      {canComment ? (
        <form onSubmit={submit} className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="Write a comment…"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-neutral-500">
              {draft.length}/4000
            </span>
            <button
              type="submit"
              disabled={submitting || !draft.trim()}
              className="rounded-md bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-400 transition disabled:opacity-60"
            >
              {submitting ? "Posting…" : "Post comment"}
            </button>
          </div>
        </form>
      ) : (
        <p className="text-xs text-neutral-500">
          You need at least EDITOR role to comment.
        </p>
      )}

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
