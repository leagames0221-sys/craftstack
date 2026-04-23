"use client";

import { useCallback, useEffect, useState } from "react";

type Document = {
  id: string;
  title: string;
  charCount: number;
  chunks: number;
  createdAt: string;
};

export function CorpusClient() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [docs, setDocs] = useState<Document[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/kb/documents");
      if (!res.ok) return;
      setDocs((await res.json()) as Document[]);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    // Initial fetch on mount. Syncing external (server) state into
    // React at mount is the textbook-approved use of an effect —
    // react-hooks/set-state-in-effect is overzealous for this pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const ingest = useCallback(async () => {
    if (!title.trim() || !content.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/kb/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim(), content: content.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(body?.message ?? `Failed (${res.status})`);
        return;
      }
      setTitle("");
      setContent("");
      await load();
    } finally {
      setBusy(false);
    }
  }, [title, content, load]);

  const drop = useCallback(
    async (id: string) => {
      const res = await fetch(
        `/api/kb/documents?id=${encodeURIComponent(id)}`,
        {
          method: "DELETE",
        },
      );
      if (res.ok) await load();
    },
    [load],
  );

  return (
    <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        <label className="text-[10px] uppercase tracking-widest text-neutral-400">
          Title
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
          maxLength={200}
          placeholder="e.g. Boardly overview"
          className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-indigo-500 focus:outline-none"
        />

        <label className="mt-3 text-[10px] uppercase tracking-widest text-neutral-400">
          Content
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={busy}
          rows={14}
          maxLength={50_000}
          placeholder="Paste a passage — docs, notes, a memo. Will be chunked + embedded."
          className="min-h-[320px] rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-indigo-500 focus:outline-none"
        />
        <div className="flex items-center justify-between text-[10px] text-neutral-400">
          <span>{content.length.toLocaleString()} / 50,000 chars</span>
          <button
            type="button"
            onClick={ingest}
            disabled={!title.trim() || !content.trim() || busy}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Ingesting…" : "Ingest"}
          </button>
        </div>
        {error ? <p className="text-xs text-red-400">Error · {error}</p> : null}
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-[10px] uppercase tracking-widest text-neutral-400">
          Corpus ({docs.length})
        </div>
        <ul className="divide-y divide-neutral-800 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900/40">
          {docs.length === 0 ? (
            <li className="px-4 py-6 text-center text-xs text-neutral-400">
              No documents yet. Paste a passage on the left to get started.
            </li>
          ) : null}
          {docs.map((d) => (
            <li
              key={d.id}
              className="flex items-center gap-3 px-4 py-3 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-neutral-100">
                  {d.title}
                </div>
                <div className="mt-0.5 text-[10px] text-neutral-400">
                  {d.chunks} chunk{d.chunks === 1 ? "" : "s"} ·{" "}
                  {d.charCount.toLocaleString()} chars ·{" "}
                  {new Date(d.createdAt)
                    .toISOString()
                    .slice(0, 16)
                    .replace("T", " ")}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void drop(d.id)}
                className="rounded-md border border-neutral-800 px-2 py-1 text-[10px] text-neutral-400 hover:border-rose-500/40 hover:text-rose-300"
                aria-label={`Delete ${d.title}`}
              >
                delete
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
