# ADR-0033: Host the Knowlex "playground" surface on the collab deploy

- Status: Accepted
- Date: 2026-04-23
- Tags: deploy, ai, portfolio

## Context

Knowlex is the AI / knowledge-retrieval half of the craftstack monorepo (see [ADR-0017](0017-release-order.md) for the release-order decision). The full Knowlex experience needs a second Vercel project, its own database, vector tables with pgvector, and auth plumbed through separately — a multi-hour piece of work.

But the primary audience for the repo right now is a hiring reviewer who wants to see the AI path in 30 seconds. Forcing them to read about Knowlex "coming soon" while the only live surface is Boardly underdelivers on the portfolio story.

## Decision

Ship a narrow, visible slice of Knowlex — a "playground" page — on the existing `craftstack-collab.vercel.app` deploy. The playground is a public, auth-free page at `/playground` that lets a visitor paste context and a question and streams back a Gemini Flash answer grounded only in what they pasted. The route lives under `apps/collab/src/app/playground/` and the API under `apps/collab/src/app/api/kb/ask/route.ts`.

The full Knowlex app in `apps/knowledge/` stays untouched and will migrate into this code once it ships — the `src/lib/kb-rate-limit.ts` and the API shape are designed to be portable.

## Consequences

Positive:

- Recruiter-facing "live AI feature" in one click; no extra signup, no second URL to share.
- Zero extra infrastructure — reuses the existing Vercel project, domain, and CSP.
- Env-guarded at both layers: missing `GEMINI_API_KEY` returns a 503 with a clean message instead of a crash; per-IP rate limit prevents drive-by quota drain.

Negative:

- The playground sits in the collab tree, which slightly muddies the "two separate apps" narrative. We accept that for the demo value and document the migration path.
- Shared CPU / bandwidth budget on Vercel Hobby with the main Boardly app. Acceptable because Gemini Flash is fast and the rate limit is strict.

## Alternatives Considered

- **Second Vercel project for apps/knowledge** — the architecturally correct long-term path, but out of scope for the current sprint. Still the target of [ADR-0018](0018-db-instance-per-app.md).
- **No playground, "Knowlex coming soon" banner** — underdelivers the AI story for recruiters scanning the README.
- **Inline LLM call from the browser with a user-supplied key** — rejected; encourages visitors to paste their own keys into a page they don't control and surfaces no useful engineering signal.
