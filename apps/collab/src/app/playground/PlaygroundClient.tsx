"use client";

import { useCallback, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

const SAMPLE_CONTEXT = `craftstack is a production-grade monorepo containing two apps:
Boardly, a realtime-collaborative kanban with multi-tenant workspaces,
and Knowlex, a single-tenant RAG demo (workspace tenancy is deferred
per ADR-0039 and is the next arc). Boardly has 41 routes, 166 Vitest
cases, a nonce-based Content-Security-Policy that scored A+ on
securityheaders.com, and a command palette bound to Cmd-K. It uses
PostgreSQL via Prisma, Auth.js v5 with JWT sessions, and Pusher
Channels for realtime fanout with a best-effort side-effect policy.
Knowlex runs in the same monorepo on its own Vercel deploy: ingest
chunks paragraph-aware at ~512 chars, embeds with gemini-embedding-001
at 768 dims, stores in pgvector with an HNSW cosine index, and streams
Gemini 2.0 Flash with numbered citations.`;

const SAMPLE_QUESTION = "How many Vitest cases does Boardly have?";

type Status = "idle" | "streaming" | "done" | "error";
type Mode = "live" | "demo" | null;

export function PlaygroundClient() {
  const [context, setContext] = useState(SAMPLE_CONTEXT);
  const [question, setQuestion] = useState(SAMPLE_QUESTION);
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [mode, setMode] = useState<Mode>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const ask = useCallback(async () => {
    if (!context.trim() || !question.trim()) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setAnswer("");
    setError(null);
    setMode(null);
    setStatus("streaming");

    try {
      const res = await fetch("/api/kb/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ context, question }),
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

      const headerMode = res.headers.get("x-playground-mode");
      setMode(
        headerMode === "live" || headerMode === "demo" ? headerMode : null,
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
  }, [context, question]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setStatus((s) => (s === "streaming" ? "idle" : s));
  }, []);

  const streaming = status === "streaming";

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-2">
        <label className="text-[11px] uppercase tracking-wider text-neutral-400">
          Context
        </label>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          disabled={streaming}
          rows={12}
          maxLength={12_000}
          className="min-h-[280px] rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-indigo-500 focus:outline-none"
          placeholder="Paste the text the model should answer from…"
        />
        <div className="flex items-center justify-between text-[10px] text-neutral-400">
          <span>{context.length.toLocaleString()} / 12,000 chars</span>
          <button
            type="button"
            onClick={() => {
              setContext(SAMPLE_CONTEXT);
              setQuestion(SAMPLE_QUESTION);
            }}
            className="text-indigo-300 hover:text-indigo-200"
          >
            Reset sample
          </button>
        </div>

        <label className="mt-3 text-[11px] uppercase tracking-wider text-neutral-400">
          Question
        </label>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={streaming}
          maxLength={500}
          className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-indigo-500 focus:outline-none"
          placeholder="What do you want to ask about the context?"
        />

        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={ask}
            disabled={!context.trim() || !question.trim() || streaming}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {streaming ? "Asking…" : "Ask"}
          </button>
          {streaming ? (
            <button
              type="button"
              onClick={stop}
              className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
            >
              Stop
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-[11px] uppercase tracking-wider text-neutral-400">
            Answer
          </label>
          {mode ? (
            <span
              className={
                mode === "live"
                  ? "rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300"
                  : "rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300"
              }
              title={
                mode === "live"
                  ? "Streaming from Gemini 2.0 Flash"
                  : "GEMINI_API_KEY not set on this deploy — deterministic demo fallback. Plumbing, streaming, rate limiting, abort are all real."
              }
            >
              {mode === "live" ? "● Live · Gemini 2.0 Flash" : "● Demo mode"}
            </span>
          ) : null}
        </div>
        <div
          aria-live="polite"
          className="min-h-[340px] whitespace-pre-wrap rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 text-sm leading-relaxed text-neutral-100"
        >
          {status === "idle" && answer === "" ? (
            <span className="text-neutral-400">
              The streamed answer will appear here.
            </span>
          ) : null}
          {error ? (
            <span className="text-red-400">Error · {error}</span>
          ) : answer ? (
            <div className="prose-playground">
              <ReactMarkdown
                components={{
                  p: (p) => <p className="mb-3 last:mb-0">{p.children}</p>,
                  strong: (p) => (
                    <strong className="font-semibold text-white">
                      {p.children}
                    </strong>
                  ),
                  em: (p) => <em className="italic">{p.children}</em>,
                  ul: (p) => (
                    <ul className="mb-3 ml-5 list-disc space-y-1">
                      {p.children}
                    </ul>
                  ),
                  ol: (p) => (
                    <ol className="mb-3 ml-5 list-decimal space-y-1">
                      {p.children}
                    </ol>
                  ),
                  li: (p) => <li>{p.children}</li>,
                  code: (p) => (
                    <code className="rounded bg-neutral-800 px-1 py-0.5 font-mono text-[12px] text-amber-200">
                      {p.children}
                    </code>
                  ),
                  pre: (p) => (
                    <pre className="mb-3 overflow-x-auto rounded-md bg-neutral-950/70 p-3 font-mono text-[12px] leading-relaxed text-neutral-200">
                      {p.children}
                    </pre>
                  ),
                  a: (p) => (
                    <a
                      href={p.href}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-300 underline underline-offset-2 hover:text-indigo-200"
                    >
                      {p.children}
                    </a>
                  ),
                  blockquote: (p) => (
                    <blockquote className="mb-3 border-l-2 border-indigo-500/40 pl-3 text-neutral-300">
                      {p.children}
                    </blockquote>
                  ),
                }}
              >
                {answer}
              </ReactMarkdown>
            </div>
          ) : null}
          {streaming ? (
            <span
              aria-hidden
              className="ml-1 inline-block h-3 w-1.5 animate-pulse bg-indigo-400 align-middle"
            />
          ) : null}
        </div>
        <p className="text-[10px] text-neutral-400">
          Answers are grounded only in the context above. If the context
          doesn&apos;t cover the question, the model will say so.
        </p>
      </div>
    </div>
  );
}
