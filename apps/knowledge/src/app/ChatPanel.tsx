"use client";

import { useCallback, useRef, useState } from "react";

type Status = "idle" | "streaming" | "done" | "error";

export function ChatPanel() {
  const [question, setQuestion] = useState(
    "How does Knowlex chunk and embed documents?",
  );
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [hits, setHits] = useState<number | null>(null);
  const [docs, setDocs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const ask = useCallback(async () => {
    if (!question.trim()) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setAnswer("");
    setError(null);
    setHits(null);
    setDocs([]);
    setStatus("streaming");

    try {
      const res = await fetch("/api/kb/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(body?.message ?? `Request failed with status ${res.status}.`);
        setStatus("error");
        return;
      }
      const hitsHeader = res.headers.get("x-knowlex-hits");
      const docsHeader = res.headers.get("x-knowlex-docs");
      setHits(hitsHeader ? Number(hitsHeader) : null);
      setDocs(
        docsHeader ? docsHeader.split("|").filter((s) => s.length > 0) : [],
      );

      const reader = res.body?.getReader();
      if (!reader) {
        setError("No response body.");
        setStatus("error");
        return;
      }
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setAnswer((prev) => prev + decoder.decode(value, { stream: true }));
      }
      setStatus("done");
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") return;
      setError((e as Error).message || "Unknown error");
      setStatus("error");
    }
  }, [question]);

  const streaming = status === "streaming";

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex items-center gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={streaming}
          maxLength={500}
          placeholder="Ask something about the corpus…"
          className="flex-1 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-indigo-500 focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask();
            }
          }}
        />
        <button
          type="button"
          onClick={ask}
          disabled={!question.trim() || streaming}
          className="rounded-lg bg-indigo-500 px-5 py-3 text-sm font-medium text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {streaming ? "Asking…" : "Ask"}
        </button>
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-5">
        <div className="mb-3 flex items-center justify-between text-[10px] uppercase tracking-widest text-neutral-500">
          <span>Answer</span>
          {hits !== null ? (
            <span>
              retrieved{" "}
              <span className="text-neutral-300">
                {hits} chunk{hits === 1 ? "" : "s"}
              </span>
              {docs.length > 0 ? (
                <>
                  {" "}
                  from{" "}
                  <span className="text-neutral-300">
                    {docs.length} document{docs.length === 1 ? "" : "s"}
                  </span>
                </>
              ) : null}
            </span>
          ) : null}
        </div>
        <div
          aria-live="polite"
          className="min-h-[180px] whitespace-pre-wrap text-sm leading-relaxed text-neutral-100"
        >
          {status === "idle" && answer === "" ? (
            <span className="text-neutral-500">
              Grounded answers with [n] citations land here.
            </span>
          ) : null}
          {error ? (
            <span className="text-red-400">Error · {error}</span>
          ) : (
            answer
          )}
          {streaming ? (
            <span
              aria-hidden
              className="ml-1 inline-block h-3 w-1.5 animate-pulse bg-indigo-400 align-middle"
            />
          ) : null}
        </div>
        {docs.length > 0 && !error ? (
          <div className="mt-4 border-t border-neutral-800 pt-3">
            <div className="mb-2 text-[10px] uppercase tracking-widest text-neutral-500">
              Citations
            </div>
            <ul className="space-y-1 text-xs text-neutral-400">
              {docs.map((d, i) => (
                <li key={`${d}-${i}`} className="flex items-center gap-2">
                  <span className="rounded border border-neutral-800 bg-neutral-950 px-1.5 py-0.5 font-mono text-[10px]">
                    {i + 1}
                  </span>
                  <span className="truncate">{d}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
