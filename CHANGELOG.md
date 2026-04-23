# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project follows semantic-versioning-ish — `major.minor.patch` where a minor bump corresponds to a public deployable milestone.

## [Unreleased]

Next candidate blocks are tracked in the session memory at `~/.claude/other-projects/craftstack/26_session_251_v030_release.md`. Short list:

- Knowlex proper (apps/knowledge deploy + pgvector + real RAG)
- Playwright auth-scoped E2E suite
- Card attachments (base64 data URL, <256 KB)

## [0.3.0] — 2026-04-23

Release: <https://github.com/leagames0221-sys/craftstack/releases/tag/v0.3.0>

### Added

- **Knowlex Playground** at `/playground` (public, no signup). Streamed Gemini 2.0 Flash answer grounded only in the pasted context, via Vercel AI SDK (`ai` + `@ai-sdk/google`), `fetch` + `ReadableStream` + `AbortController` on the client, `react-markdown` rendering. Env-guarded with a deterministic demo-mode fallback so the page works end-to-end with no `GEMINI_API_KEY` set.
- **Command palette** (`⌘K` / `Ctrl-K` / `/`): cross-workspace fuzzy search of workspaces / boards / cards plus `>`-prefix action mode. New `/api/search` route is membership-scoped at the query layer.
- **Public landing page** at `/` with hero, 8-stat grid, app cards, 10-decision drill-down, tech-stack cloud, and footer links. Replaces the previous silent redirect.
- **Dynamic Open Graph image** via Next's `ImageResponse` (edge runtime, system fonts). Slack / Twitter / LinkedIn previews render a branded card.
- **Keyboard shortcuts help** modal (`?`), plus `/` to open the palette, `Ctrl-Z` / `⌘-Z` to undo the last card move, `Ctrl-Shift-Z` / `⌘-Shift-Z` to redo.
- **Undo / redo on card moves** — bounded 25-entry LIFO stack replayed against the existing optimistic-lock `/api/cards/:id/move` endpoint.
- **OpenAPI 3.1 contract** at `apps/collab/src/openapi.ts`, served at `/api/openapi.json`, browsable in-app at `/docs/api` and externally via Swagger Editor.
- **Typed API client** generated via `openapi-typescript` into `src/openapi-types.ts` (committed).
- **axe-core** a11y smoke assertions on every public page (WCAG 2.1 AA, `serious` + `critical` gate).
- **`@next/bundle-analyzer`** wired behind `ANALYZE=true` (`pnpm analyze`).
- **CodeQL** workflow — weekly cron + per-PR, `security-extended` + `security-and-quality` packs.
- **COST_SAFETY.md** — full threat model for runaway-billing attacks (Japan cost-attack class), service-by-service free-tier caps, operator setup rules.
- **Layered invocation budget** (`lib/global-budget.ts`) on `/api/kb/ask`: per-IP + global daily/monthly. Per-user rate limits on `/api/search` (60/60s) and `/api/notifications` (30/60s).
- **15 new ADRs** (ADR-0023 through ADR-0037) covering RBAC hierarchy, optimistic locking, LexoRank, token-hashed invitations, three-layer rate limits, full-replace set semantics, cross-workspace guards, best-effort side effects, URL-as-state, env-guarded integrations, Knowlex deploy decision, a11y gating, hand-written OpenAPI, client-only undo/redo, cost hardening.
- **Issue templates** (bug / feature / security-redirect), `SECURITY.md`, `COST_SAFETY.md` cross-linked from the README.

### Changed

- **Content-Security-Policy** flipped to nonce-based with `'strict-dynamic'` via the Next 16 proxy. No `'unsafe-inline'` in `script-src`. Verified **A+** on [securityheaders.com](https://securityheaders.com/?q=https%3A%2F%2Fcraftstack-collab.vercel.app%2F&followRedirects=on).
- Added `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Resource-Policy: same-origin`. Expanded `Permissions-Policy` to deny every unused sensor / media / power capability.
- Landing stats (Vitest / routes / ADRs) refresh to **160 / 34 / 37**.

### Fixed

- `new URL(...).pathname` no longer breaks the demo pipeline on Windows; switched to `fileURLToPath` for drive-letter-safe `path.resolve`.
- `/signin` and `/invite` now flow through the edge proxy so they receive the nonce CSP (previously the matcher skipped them, leaving them without CSP).

## [0.2.0] — 2026-04-23

Release: <https://github.com/leagames0221-sys/craftstack/releases/tag/v0.2.0>

### Added

- **Card drag-and-drop** with `@dnd-kit`, LexoRank positions, optimistic UI, and `VERSION_MISMATCH` rollback via the `version` column on Card.
- **Realtime fanout** via Pusher Channels (`board-<id>` channel). Env-guarded: missing credentials skip the broadcast with a warn.
- **Workspace invitations** — token-hashed (SHA-256 at rest), email-bound accept, Resend delivery with graceful fallback to console log when `RESEND_API_KEY` is unset.
- **Three-layer rate limit** on invitation creation: global 1000/mo, per-workspace 50/day, per-user 20/day. All env-override-able, each trip returns a distinct error code.
- **Comments** (soft-delete + moderation + 4000-char cap), **@mentions** + **Notifications bell** (30s poll), **labels** + **assignees** (full-replace set semantics with cross-workspace guards), **due dates** with overdue / due-today badges, **URL-driven label filter** (`?labels=id1,id2`), **board card search** (`?q=...`), **card-scoped activity history**, **workspace activity feed** with cursor pagination, **per-list WIP limits** (ADMIN+).
- **Playwright smoke** (11 scenarios) + **130 Vitest** unit cases.
- **Demo video pipeline** (`demo:auth` → `record` → `convert` → `tts` → `compose`). Playwright capture + VOICEVOX TTS + ffmpeg overlay. 45-second Loom walkthrough published.
- Full `How this was built` section in README with 10 architectural decisions called out.

## [0.1.0] — 2026-04-23

Release: <https://github.com/leagames0221-sys/craftstack/releases/tag/v0.1.0>

### Added

- Initial authenticated deploy at <https://craftstack-collab.vercel.app>.
- Turborepo + pnpm monorepo scaffold; two apps (`apps/collab` = Boardly, `apps/knowledge` = Knowlex schema + landing).
- Next.js 16 (App Router, Turbopack) + TypeScript 5 + Tailwind 4.
- Prisma 7 + `@prisma/adapter-pg` against Neon Postgres (Singapore).
- Auth.js v5 with JWT session strategy (OAuth via GitHub + Google); edge-runtime proxy gates page routes, Node-runtime handler mounts PrismaAdapter.
- Core Boardly CRUD: workspaces → boards → lists → cards.
- Baseline security headers (HSTS 2y preload, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy).
- GitHub Actions CI (lint / typecheck / test / build).
- 22 design-phase ADRs (ADR-0001 through ADR-0022) covering the intended shape of the full system (RLS, hybrid search, RAG faithfulness, etc.).
- 50 Vitest unit cases, 3 Playwright smoke scenarios.

[Unreleased]: https://github.com/leagames0221-sys/craftstack/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/leagames0221-sys/craftstack/releases/tag/v0.3.0
[0.2.0]: https://github.com/leagames0221-sys/craftstack/releases/tag/v0.2.0
[0.1.0]: https://github.com/leagames0221-sys/craftstack/releases/tag/v0.1.0
