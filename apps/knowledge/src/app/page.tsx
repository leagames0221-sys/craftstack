import Link from "next/link";

import { ChatPanel } from "./ChatPanel";

export const metadata = {
  title: "Knowlex — grounded RAG on your own pasted corpus",
  description:
    "Paste text, ask questions. Chunked, embedded with text-embedding-004, stored in pgvector, answered by Gemini 2.0 Flash with numbered citations.",
};

/**
 * Knowlex home. Shows the chat UI against the shared corpus; links to
 * /kb for the corpus library (add / list / delete documents).
 */
export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 bg-neutral-900/60 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 via-indigo-500 to-cyan-500" />
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Knowlex</h1>
              <p className="text-xs text-neutral-500">
                grounded RAG · text-embedding-004 · Gemini 2.0 Flash
              </p>
            </div>
          </div>
          <nav className="flex items-center gap-3 text-sm">
            <Link
              href="/kb"
              className="text-neutral-300 hover:text-neutral-100"
            >
              Corpus
            </Link>
            <a
              href="https://github.com/leagames0221-sys/craftstack/tree/main/apps/knowledge"
              target="_blank"
              rel="noreferrer"
              className="text-neutral-300 hover:text-neutral-100"
            >
              Source
            </a>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight">
            Ask the shared corpus.
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-neutral-400">
            Knowlex chunks whatever you paste in{" "}
            <Link href="/kb" className="text-indigo-300 hover:text-indigo-200">
              Corpus
            </Link>
            , embeds each chunk with text-embedding-004, stores the 768-dim
            vector in pgvector, and answers your question by retrieving the
            top-K chunks via cosine kNN and streaming a grounded Gemini 2.0
            Flash reply with numbered citations.
          </p>
        </div>

        <ChatPanel />

        <div className="mt-10 grid grid-cols-1 gap-4 text-sm text-neutral-400 md:grid-cols-3">
          <Card
            title="Grounded by construction"
            body="The system prompt forbids outside knowledge. If retrieval misses, the model says so."
          />
          <Card
            title="Cite-by-number"
            body="Each chunk gets a [n] reference. The model quotes them inline; the panel shows titles."
          />
          <Card
            title="Zero-credit-card stack"
            body="Gemini AI Studio key (free), Neon (free), pgvector extension (free) — end-to-end $0."
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
