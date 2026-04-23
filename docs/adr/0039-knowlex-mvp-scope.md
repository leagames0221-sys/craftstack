# ADR-0039: Knowlex MVP — ship vertical slice, defer tenancy

- Status: Accepted (scopes down the design-phase schema recorded in earlier ADRs 0011–0015)
- Date: 2026-04-23
- Tags: knowlex, rag, scope, pgvector

## Context

The Knowlex half of the monorepo had been sitting at "schema + landing page" for the whole Session 249–251 arc. The original `apps/knowledge/prisma/schema.prisma` was 441 lines and modeled the full design-phase ambition: Tenant, TenantMember, Folder, DocumentVersion, Chunk, Embedding, Conversation, Message, Citation, Feedback, ApiKey, Webhook, AuditLog, Usage, Plan, Subscription, Invoice. All of that is the right shape _eventually_, but none of it runs, which reads as an empty shell when a reviewer opens the folder.

The pragmatic question: can we ship a **functionally complete, honestly-scoped MVP** in one session, or does Knowlex remain "coming soon" on the portfolio?

## Decision

Ship a vertical slice that covers the happy path end-to-end:

1. **Minimal schema**: three tables — `Document` (raw pasted text), `Chunk` (the retrieval unit), `Embedding` (pgvector 768-dim). The 441-line design schema is preserved at `apps/knowledge/prisma/schema.design.prisma.bak` as a reference for future-ADR expansion.
2. **No tenancy in the MVP**. The design schema's `Tenant`/`TenantMember`/`RLS` story is deferred. Single-user, single-corpus. Adding tenancy back is a schema addition + RLS migration; it does not invalidate any of the MVP code.
3. **Real chunking**: paragraph-aware with configurable max-chars + overlap; pure module with 6 Vitest cases.
4. **Real embeddings**: `text-embedding-004` via Vercel AI SDK (`@ai-sdk/google`). 768-dim fits under pgvector's 2000-dim cap and leaves headroom.
5. **Real retrieval**: pgvector `<=>` cosine-distance kNN via `$queryRawUnsafe` (Prisma doesn't expose the `vector` type natively). ivfflat index with `lists=100` as a forward-compat placeholder.
6. **Real RAG**: system prompt forbids outside knowledge; numbered-citation format; streamed Gemini 2.0 Flash response; `x-knowlex-hits` + `x-knowlex-docs` headers so the client can render citations without a second round-trip.
7. **Real UI**: `/` for the chat panel, `/kb` for the corpus library (add / list / delete).
8. **Env-guarded end-to-end**: missing `GEMINI_API_KEY` returns 503 on both `/api/kb/ingest` and `/api/kb/ask` with a clear operator message — no crash.
9. **Zero-CC stack**: Gemini AI Studio key (free), Neon (free), pgvector extension (free on Neon). See [COST_SAFETY.md](../../COST_SAFETY.md) for the threat model.

## Consequences

Positive:

- The "two apps" narrative is now backed by code. `apps/knowledge` has a real runtime, not just a schema.
- The MVP is genuinely portable to a separate Vercel project (see [ADR-0018](0018-db-instance-per-app.md)): point `DATABASE_URL` + `GEMINI_API_KEY` at it and `pnpm --filter knowledge build && start`. No collab coupling.
- ivfflat index is lazy-won — at sub-1000-chunk scale the seq-scan path is sub-10 ms on Neon, but the index is there for free.
- All infrastructure decisions are env-guarded; nothing breaks locally without a Gemini key (you just can't ingest or ask — an explicit 503, documented).

Negative:

- **No tenancy, no RLS, no per-user separation.** A single deployment is a single shared corpus. Re-introducing the tenant model is a follow-up sprint.
- **No file upload / parsing.** PDF / DOCX ingestion (design ADRs 0012–0015) is deferred; the MVP accepts raw pasted text only.
- **No hybrid retrieval / HyDE / rerank.** Pure cosine kNN — the design-phase ADR-0011 (pgvector + BM25 + RRF + Cohere rerank) is the eventual target, but MVP doesn't need any of that to be demonstrable.
- **No faithfulness gate** (ADR-0013 deferred). The system prompt is the only guard against hallucination; a production deployment would want the output validated against the citations before returning.
- **Embedding model is free-tier only.** Rotating to a larger model needs a schema bump on `Embedding.dim` + a re-embed sweep.

## Alternatives Considered

- **Deploy the full design-phase schema + tenancy now.** Rejected — it's multi-day work and the MVP was blocking a recruiter-facing "2 apps are real" story for weeks. Ship vertical slice first, add tenancy second.
- **Drop Knowlex entirely; keep the playground inside apps/collab.** Rejected — the monorepo narrative was already baked into README / ADR-0017 / landing-page dual-card UI, and Knowlex is a real differentiator for AI-focused roles. Better to ship a thin but real Knowlex than to remove it.
- **Use SQLite + an in-memory vector store.** Rejected — inconsistent with the Neon-based Boardly story; reusing the same Postgres engine is both cheaper and more realistic.
- **Pick a different embedder (OpenAI / Cohere).** Rejected — would require a paid key and undermine the "no CC, no env required" demo stance. text-embedding-004 is free and good enough.

## Related

- [ADR-0017](0017-release-order.md) — Boardly-first release order; Knowlex was always the later half.
- [ADR-0018](0018-db-instance-per-app.md) — separate DB instances per app; MVP schema is deliberately compatible with a future split.
- [ADR-0032](0032-mention-resolution-and-env-guarded-integrations.md) — the env-guarded-integrations pattern Knowlex inherits for `GEMINI_API_KEY` failure.
- [ADR-0033](0033-knowlex-playground-on-collab-deploy.md) — the playground slice that was demo-mode-only; superseded in spirit now that a real Knowlex runs standalone.
- [ADR-0037](0037-cost-attack-hardening-layered-budgets.md) — the budget layer Knowlex inherits when deployed (the same COST_SAFETY setup rules apply).
