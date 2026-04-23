import Link from "next/link";

import { PlaygroundClient } from "./PlaygroundClient";

export const metadata = {
  title: "Knowlex Playground · craftstack",
  description:
    "Paste your own context and ask a question. Streamed RAG answers from Gemini Flash, grounded only in what you pasted.",
};

/**
 * Public, unauthenticated demo surface for the Knowlex half of the monorepo.
 * The full Knowlex app (tenants, vector retrieval, citations, eval) lives
 * under apps/knowledge; this page is a focused slice that runs on the
 * existing collab deploy so a recruiter can try the AI path in 30 seconds
 * without signing up for anything.
 */
export default function PlaygroundPage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 bg-neutral-900/60 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 via-indigo-500 to-cyan-500" />
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                Knowlex Playground
              </h1>
              <p className="text-xs text-neutral-400">
                Grounded RAG scratchpad · Gemini 2.0 Flash · streaming
              </p>
            </div>
          </div>
          <Link
            href="/"
            className="text-sm text-neutral-400 hover:text-neutral-200"
          >
            ← craftstack
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8 space-y-3">
          <h2 className="text-2xl font-bold tracking-tight">
            Paste a passage. Ask a question. Get a grounded answer.
          </h2>
          <p className="max-w-2xl text-sm text-neutral-400">
            This is the visible slice of{" "}
            <span className="text-neutral-200">Knowlex</span>, the
            AI-knowledge-retrieval half of the craftstack monorepo. The model is
            told to use <em>only</em> the context you paste — if the answer
            isn&apos;t there, it says so. Plumbed via Vercel AI SDK ·
            Gemini-2.0-flash · streaming response via{" "}
            <code className="rounded bg-neutral-800/70 px-1 text-[11px]">
              fetch
            </code>{" "}
            +{" "}
            <code className="rounded bg-neutral-800/70 px-1 text-[11px]">
              ReadableStream
            </code>
            .
          </p>
        </div>

        <PlaygroundClient />

        <div className="mt-10 grid grid-cols-1 gap-4 text-sm text-neutral-400 md:grid-cols-3">
          <Card
            title="Grounded-only answers"
            body="The system prompt forces the model to either quote from the pasted context or admit that the answer isn't there. No silent drift into training data."
          />
          <Card
            title="Free-tier friendly"
            body="Gemini 2.0 Flash is free at Google AI Studio (no credit card). Missing the env var? The route returns a clear 503 instead of breaking the UI."
          />
          <Card
            title="Rate-limited by design"
            body="Per-IP sliding window caps abusive loops so a drive-by visitor can't drain the shared quota for everyone else."
          />
        </div>
      </section>
    </main>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <h3 className="text-sm font-semibold text-neutral-100">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-neutral-400">{body}</p>
    </div>
  );
}
