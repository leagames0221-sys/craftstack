# Knowlex

Grounded retrieval-augmented Q&A on a corpus you paste in.

## What it does

1. Paste text + title in **`/kb`** → Knowlex chunks it into ~512-char windows (with 80-char overlap across paragraph boundaries).
2. Each chunk is embedded via Google's free **`gemini-embedding-001`** (truncated to 768-dim via `outputDimensionality`) and stored in **pgvector** on Postgres.
3. Ask a question in **`/`** → query is embedded, top-K chunks retrieved by cosine kNN (`<=>` operator) — optionally fused with Postgres FTS BM25 via Reciprocal Rank Fusion behind `HYBRID_RETRIEVAL_ENABLED` per [ADR-0063](../../docs/adr/0063-hybrid-retrieval-bm25-rrf.md) — and streamed to **Gemini 2.5 Flash** with a system prompt that forbids answering from outside knowledge.
4. The UI renders a citation panel listing the documents the answer drew from; the model cites passages inline with `[n]` references.

## Scope

Started narrower than the design-phase schema (preserved at `prisma/schema.design.prisma.bak`) per [ADR-0039](../../docs/adr/0039-knowlex-mvp-scope.md), then ratcheted forward through v0.5.x:

- **Multi-tenant** via Auth.js + `Membership` + demo allow-list per [ADR-0061](../../docs/adr/0061-knowlex-auth-and-tenancy.md) (v0.5.12, closes I-01). RLS deferred in favor of application-side enforcement; ADR-0010 remains a viable future option.
- **Raw-text only.** PDF / DOCX / URL ingestion is deferred.
- **Hybrid retrieval shipped** (Postgres FTS BM25 + pgvector cosine via RRF) per [ADR-0063](../../docs/adr/0063-hybrid-retrieval-bm25-rrf.md) (v0.5.14, closes ADR-0011 deferred), default-off behind `HYBRID_RETRIEVAL_ENABLED` pending calibration per [ADR-0064](../../docs/adr/0064-hybrid-retrieval-calibration-architectural-gap.md) / [ADR-0065](../../docs/adr/0065-knowlex-ci-credentials-provider.md). Cohere Rerank stays deferred (billable; conflicts with [ADR-0046](../../docs/adr/0046-zero-cost-by-construction.md)).
- **LLM-as-judge `--judge` flag** opt-in per [ADR-0062](../../docs/adr/0062-llm-as-judge-eval-flag.md) (v0.5.13, closes ADR-0049 § 8th arc); NLI faithfulness gate per ADR-0013 stays deferred behind the simpler `--judge` path.
- **Live demo currently EMERGENCY_STOPPED** post the 2026-04-29 Gemini Free tier account-level revocation incident — see [ADR-0067](../../docs/adr/0067-gemini-free-tier-account-revocation-incident.md). Run locally with your own AI Studio key per the BYOK runbook in the root README.

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
