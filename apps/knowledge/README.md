# Knowlex

Grounded retrieval-augmented Q&A on a corpus you paste in.

## What it does

1. Paste text + title in **`/kb`** → Knowlex chunks it into ~512-char windows (with 80-char overlap across paragraph boundaries).
2. Each chunk is embedded via Google's free **`text-embedding-004`** (768-dim) and stored in **pgvector** on Postgres.
3. Ask a question in **`/`** → query is embedded, top-K chunks retrieved by cosine kNN (`<=>` operator), and streamed to **Gemini 2.0 Flash** with a system prompt that forbids answering from outside knowledge.
4. The UI renders a citation panel listing the documents the answer drew from; the model cites passages inline with `[n]` references.

## Scope

MVP per [ADR-0039](../../docs/adr/0039-knowlex-mvp-scope.md). **Deliberately narrower** than the full design-phase schema (preserved at `prisma/schema.design.prisma.bak`):

- **Single-corpus, tenantless.** Adding tenancy + RLS is a follow-up sprint (ADR-0010 is the target shape).
- **Raw-text only.** PDF / DOCX / URL ingestion is deferred.
- **Pure cosine kNN.** Hybrid retrieval (pgvector + BM25 + RRF + rerank) from ADR-0011 is the eventual target.
- **No faithfulness gate.** System-prompt enforcement only; ADR-0013's output-verification step is deferred.

What _is_ there is real: real migrations, real pgvector index, real Gemini calls, real RAG prompt, real streaming.

## Stack

- **Next.js 16** App Router, React 19, TypeScript 5
- **Prisma 7** + `@prisma/adapter-pg` against PostgreSQL 16 with the **pgvector** extension
- **Vercel AI SDK** (`ai` + `@ai-sdk/google`) for embedding and streaming generation
- **Vitest** for pure-logic tests (chunker + RAG prompt assembly)
- **Tailwind 4** for the UI

## Local development

```bash
# from repo root
pnpm install

# ensure Postgres is up (docker compose in repo root handles the dev DB)
cd apps/knowledge

# env
cat > .env.local <<'EOF'
DATABASE_URL="postgresql://app:app@localhost:5432/knowlex"
DIRECT_DATABASE_URL="postgresql://app:app@localhost:5432/knowlex"
GEMINI_API_KEY="<get one free at https://aistudio.google.com/app/apikey>"
EOF

# migrate
pnpm exec prisma migrate deploy

# run
pnpm dev     # port 3001
```

Visit <http://localhost:3001/kb> to add documents, then <http://localhost:3001/> to ask.

## Deployment

Knowlex is designed to deploy as its own Vercel project alongside the Boardly one (see [ADR-0018](../../docs/adr/0018-db-instance-per-app.md)). Required env:

- `DATABASE_URL` — Postgres with `pgvector` available (Neon's free tier works out of the box)
- `GEMINI_API_KEY` — **AI Studio key only** (see [COST_SAFETY.md](../../COST_SAFETY.md) for why)

Both can be provisioned on free tiers with no credit card on file. Missing `GEMINI_API_KEY` isn't a crash — ingest / ask return a clean 503 with an actionable message.

## Security & cost

Same stance as Boardly: every external dependency caps out to zero cost on free-tier exhaustion rather than auto-scaling to a bill. See [COST_SAFETY.md](../../COST_SAFETY.md) for the full threat model.
