export const metadata = {
  title: "Knowlex",
  description:
    "Multi-tenant AI knowledge retrieval SaaS with hybrid search, RAG, and multi-language support.",
};

export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <section className="mx-auto max-w-3xl px-6 py-24">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
          craftstack · knowlex
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">
          Knowlex
        </h1>
        <p className="mt-4 text-lg text-neutral-400">
          Multi-tenant AI knowledge retrieval. Hybrid search (pgvector + BM25 +
          RRF) with Cohere rerank, grounded by Faithfulness-checked RAG.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card
            title="Hybrid retrieval"
            body="Vector + keyword fused via Reciprocal Rank Fusion; Cohere rerank shortlists the final context."
          />
          <Card
            title="Faithfulness gate"
            body="Every answer sentence is checked against its citations. Unsupported claims are flagged, not silently returned."
          />
          <Card
            title="Row-Level Security"
            body="Tenant isolation enforced at both the query layer and the database. Cross-tenant reads are impossible."
          />
          <Card
            title="Eval in CI"
            body="A 50-sample golden set gates every PR on Context Precision, Recall, Faithfulness, and latency."
          />
        </div>

        <p className="mt-12 text-sm text-neutral-500">
          Public launch lands in Week 16 per{" "}
          <a
            href="https://github.com/leagames0221-sys/craftstack/blob/main/docs/adr/0017-release-order.md"
            className="underline hover:text-neutral-300"
          >
            ADR-0017
          </a>
          .
        </p>
      </section>
    </main>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
      <h2 className="text-sm font-semibold text-neutral-100">{title}</h2>
      <p className="mt-1 text-sm text-neutral-400">{body}</p>
    </div>
  );
}
