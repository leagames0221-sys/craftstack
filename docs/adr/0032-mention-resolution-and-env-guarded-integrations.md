# ADR-0032: `@mention` resolution and env-guarded integrations

- Status: Accepted
- Date: 2026-04-23
- Tags: parsing, integrations, developer-experience

## Context

Two related deployment concerns needed a consistent answer:

1. `@mention` in comments should fire a Notification for the referenced user — but must not false-fire on email addresses in running prose (`contact me at alice@example.com` should not page Alice).
2. Third-party integrations (Pusher for realtime, Resend for email) need to be optional. Contributors should be able to boot the app end-to-end locally without signing up for anything.

## Decision

- **Mentions**: resolve `@token` against workspace members in this order — email local-part match, then display-name slug match. The scanner regex refuses to match inside an email address (negative lookbehind on `[A-Za-z0-9._%+-]`).
- **Integrations**: every external SDK is constructed lazily and guarded on the env var. Missing credentials degrade to a no-op path with a console log: Pusher broadcast becomes a silent skip, Resend emails fall back to logging the accept URL and the UI surfaces it anyway.

## Consequences

Positive:

- Local dev needs no external signups. New contributors clone and run in under 10 minutes.
- The app never crashes because of a missing third-party credential.
- `@mention` is precise: only explicit mentions fire notifications.

Negative:

- The "it works locally" path silently loses realtime / email. Surfaced in the UI with a "missing RESEND_API_KEY" banner on dev; production is wired in `vercel.json`.
- The mention regex has a test corpus to protect; edits here always require updating `mentions.test.ts`.

## Alternatives Considered

- **Require all env vars at boot** — rejected; friction-heavy for contributors and an unnecessary cost of admission.
- **Dummy / stub SDKs for local dev** — rejected; adds code paths that diverge from prod and hide bugs.
- **Markdown-library-based mention parser** — considered; we kept a focused in-house scanner because (a) mentions are the only markdown-ish token we care about and (b) the test surface is smaller.
