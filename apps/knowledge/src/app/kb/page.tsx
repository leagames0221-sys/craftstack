import Link from "next/link";

import { CorpusClient } from "./CorpusClient";

export const metadata = {
  title: "Corpus · Knowlex",
  description:
    "Add, list, and delete the documents the Knowlex retriever can see.",
};

export default function CorpusPage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 bg-neutral-900/60 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-sm text-neutral-400 hover:text-neutral-200"
            >
              ← Knowlex
            </Link>
            <span className="text-neutral-700">/</span>
            <h1 className="text-lg font-semibold tracking-tight">Corpus</h1>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-10">
        <h2 className="text-2xl font-bold tracking-tight">
          What the retriever can see
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-neutral-400">
          Paste a passage and a title; Knowlex chunks it into ~512-char windows
          (with 80-char overlap across paragraph boundaries), embeds each chunk
          via{" "}
          <code className="rounded bg-neutral-800 px-1 text-[11px]">
            gemini-embedding-001
          </code>{" "}
          (truncated to 768-dim) and stores the vector in pgvector for{" "}
          <code className="rounded bg-neutral-800 px-1 text-[11px]">
            &lt;=&gt;
          </code>{" "}
          cosine retrieval.
        </p>

        <CorpusClient />
      </section>
    </main>
  );
}
