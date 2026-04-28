# ADR-0065: CI Credentials provider for Knowlex (closes ADR-0064 architectural-gap, mirrors apps/collab ADR-0038)

- Status: Accepted (CI Credentials provider end-to-end verified; calibration data deferred to BYOK runbook per ADR-0067)
- Date: 2026-04-29
- Tags: testing, auth, ci, security, knowlex, calibration, byok
- Companions: [ADR-0064](0064-hybrid-retrieval-calibration-architectural-gap.md) (the architectural-gap discovery this ADR closes — half of the closure path; the lift-figure half is reframed as BYOK-reproducible per ADR-0067), [ADR-0038](0038-e2e-credentials-provider-implementation.md) (the apps/collab triple-gate pattern this ADR mirrors), [ADR-0061](0061-knowlex-auth-and-tenancy.md) line 52 (the deferred follow-up named as "intentionally not replicated yet" — this ADR ships it), [ADR-0046](0046-zero-cost-by-construction.md) (the cost-attack closure the triple-gate preserves; the build-time assertion is an additional defense layer), [ADR-0067](0067-gemini-free-tier-account-revocation-incident.md) (the production incident that pivoted the calibration scope; this ADR's structural work shipped regardless)

## Context

ADR-0064 (calibration architectural-gap discovery) named the closure path as "a future ADR at the next-available-NNNN slot ships the CI Credentials provider for Knowlex, copying the apps/collab triple-gate pattern, and that ADR's calibration-run section produces the actual lift figure that this ADR was meant to produce."

ADR-0061 line 52 had pre-named this as future work:

> The CI-only Credentials provider from apps/collab (ADR-0038) is intentionally **not** replicated yet — the Knowlex E2E surface is still public-demo + smoke. **If and when** an authed Playwright suite lands on Knowlex, the same triple-gate pattern (`VERCEL!=1 + E2E_ENABLED=1 + E2E_SHARED_SECRET`) can be copied across.

The calibration ratchet authored ADR-0064 → discovered the architectural gap → user authorized the closure path → this ADR is the closure. End-to-end verification: the eval client signed in via the new provider on the first attempt during this ratchet (`[eval] CI auth dance complete — signed in as e2e+owner@e2e.example`), confirming the implementation is correct.

The lift-figure half of ADR-0064's closure was not produced in the same ratchet because of an unrelated production incident (Gemini Free tier account-level revocation, recorded in ADR-0067). The CI Credentials provider work here is independent of the Gemini incident — a future operator with any Gemini-compatible API key (BYOK) can run the calibration without infrastructure changes. ADR-0067 § Decision item 2 reframes the lift-figure path as BYOK-reproducible.

## Decision

Implement the CI Credentials provider in apps/knowledge by mirroring apps/collab's ADR-0038 triple-gate, with one Knowlex-specific delta (auto-upsert E2E user in the authorize() callback) and one additional defense layer (build-time assertion in next.config.ts).

### Triple-gate (mirrors ADR-0038)

The provider registers ONLY when ALL three conditions hold:

1. `process.env.VERCEL !== "1"` — mechanically excludes every Vercel-hosted deploy. The Vercel platform always sets `VERCEL=1` in build + runtime; this gate is the structural defense that no env-var typo on the Vercel project Environment Variables page can re-enable the CI Credentials path on production.
2. `process.env.E2E_ENABLED === "1"` — string identity, not truthiness. `true` / `"yes"` / `1` (number) all fail to register. Default-off discipline.
3. `process.env.E2E_SHARED_SECRET` is set and ≥ 16 bytes. Constant-time compared against the credentials submission via `timingSafeEqual` (prevents timing oracle on the secret length / prefix).

Even with all three gates green, a valid signin requires:

- The submitted email to be in the hard-coded allowlist (`e2e+owner@e2e.example`, `e2e+editor@e2e.example`, `e2e+viewer@e2e.example`).
- The submitted secret to constant-time-match `E2E_SHARED_SECRET`.

The pure gate predicate is exported as `e2eGateOpen(env)` for unit testing — see § Tests below.

### Knowlex-specific delta — auto-upsert E2E user

apps/collab uses `prisma/seed.ts` to seed E2E user rows + a dedicated workspace at startup time. apps/knowledge has no `prisma/seed.ts` (single-tenant + demo-allowlist pattern from ADR-0061), and adding one purely for the E2E user would be over-scope.

Instead, the provider's `authorize()` callback performs an idempotent `prisma.user.upsert({ where: { email }, update: {}, create: {...} })` on each successful gate-passing signin. The upsert is structurally unreachable on production (the triple-gate short-circuits before reaching this code path) and idempotent on every CI/calibration invocation.

The user's `name` is derived from the email's local-part:

- `e2e+owner@e2e.example` → "E2E Owner"
- `e2e+editor@e2e.example` → "E2E Editor"
- `e2e+viewer@e2e.example` → "E2E Viewer"

### Build-time assertion (additional defense)

ADR-0061 line 32 explicitly disallows anonymous writes ("anonymous writes are explicitly disallowed — this closes the cost-attack vector"). The runtime gate above is the primary defense; a build-time assertion in `apps/knowledge/next.config.ts` is the redundant structural check that fails the `next build` step itself if a misconfigured env somehow makes it through:

```typescript
if (process.env.VERCEL === "1" && process.env.E2E_ENABLED === "1") {
  throw new Error(
    "[next.config] FATAL: E2E_ENABLED=1 is set on a Vercel-hosted build " +
      "(VERCEL=1). The Knowlex CI-only Credentials provider must never " +
      "register on production. ...",
  );
}
```

Belt-and-braces: a single env-var typo cannot silently re-enable anonymous-write paths in production. Fails the build, not the request.

### Eval client integration (CSRF + signin dance)

`apps/knowledge/scripts/eval.ts` gains a pre-flight `acquireE2ESession()` step that mirrors apps/collab's Playwright `setup-auth.ts`:

1. `GET /api/auth/csrf` → CSRF token + initial cookie jar.
2. `POST /api/auth/callback/e2e` (form-encoded: csrfToken + email + secret + callbackUrl) → 302/303 with Set-Cookie session token.
3. `GET /api/auth/session` to verify the cookie authenticates correctly (email matches expected).

Resulting cookie merged from CSRF jar + signin jar is forwarded in `cookie:` header for every subsequent `/api/kb/ingest` and `/api/kb/ask` call.

If `E2E_SHARED_SECRET` is unset (= operator running eval without the provider), the function logs a warning and returns null; downstream calls then fall back to anonymous, which fails on `/api/kb/ingest` (post-v0.5.12 behavior, see ADR-0061). The verify-of-verify failure mode is named explicitly so an operator who runs the calibration recipe with an incomplete env gets a clear log line, not a silent 401.

## Tests

Vitest cases pinning the gate predicate semantics (`apps/knowledge/src/auth/config.test.ts`, 9 cases):

- VERCEL=1 → false (mechanical exclusion of Vercel-hosted builds).
- E2E_ENABLED unset → false (default-off discipline).
- E2E_ENABLED="true" rather than "1" → false (string identity, not truthiness — pinning this ensures a refactor that uses `Boolean()` instead of `=== "1"` fails this test).
- E2E_SHARED_SECRET unset → false.
- E2E_SHARED_SECRET shorter than 16 bytes → false.
- All three green (VERCEL!=1, E2E_ENABLED=1, secret≥16) → true.
- Even with everything else green, VERCEL=1 forces false (gate-ordering load-bearing).
- ALLOWED_E2E_EMAILS contains exactly the three documented identities.
- ALLOWED_E2E_EMAILS rejects look-alikes (different domain, prefix variant, casing).

End-to-end verification (this ratchet, recorded in the eval log):

```
[eval] base=http://localhost:3001 questions=30 corpus=10
[eval] acquiring CI session...
[eval] CI auth dance complete — signed in as e2e+owner@e2e.example for the calibration run.
[eval] seeding corpus...
```

The auth half of ADR-0064's closure path is therefore structurally verified — the architectural-gap is closed.

## Consequences

### Positive

- **ADR-0064 architectural-gap closure (auth half)**. The post-v0.5.12 `/api/kb/ingest` 401 that ADR-0064 disclosed is now structurally addressable: any operator with a Gemini-compatible API key can run the calibration recipe end-to-end. The architecture is no longer the blocker.
- **Cost-attack vector remains closed under stress**. The triple-gate + the build-time assertion are independent layers; either alone suffices to keep the provider off production. Both together is belt-and-braces. The Vercel-env check (VERCEL=1) is the primary; the build-time `throw` is the secondary; the runtime gate predicate is the tertiary.
- **Pattern parity with apps/collab**. A reviewer reading both `apps/collab/src/auth/config.ts` and `apps/knowledge/src/auth/config.ts` sees the same shape, same triple-gate, same allowlist. Maintenance + audit both benefit from the consistency.
- **Test coverage on the load-bearing gate**. The pure `e2eGateOpen` predicate is unit-tested; a refactor that loosens the gate semantics fails CI before merge.
- **End-to-end verified, not just structurally complete**. The calibration-attempt ratchet (this same ratchet) successfully signed in via the provider on first attempt. The runtime path is exercised, not just designed.

### Negative

- **No `prisma/seed.ts` for apps/knowledge means the auto-upsert path runs on every E2E signin**. Idempotent (upsert with empty update), but a ~10ms DB roundtrip vs apps/collab's "user already in seed" zero-cost path. Negligible at calibration scale (3-4 signins per session); could be optimized by adding a seed.ts in a future ratchet if Knowlex E2E surface grows.
- **Demo workspace OWNER auto-grant from ADR-0061 cascades to the E2E user on first ingest**. A signed-in `e2e+owner@e2e.example` ingesting into the demo workspace gets OWNER role automatically (per `requireMemberForWrite` in `auth/access.ts`). Acceptable: this is the same role grant any signed-in human reviewer would get; the demo workspace is a shared sandbox by design.
- **The lift-figure half of ADR-0064 closure path remained unproduced in this ratchet** due to ADR-0067 (Gemini Free tier account-level revocation, unrelated infrastructure incident). ADR-0067 § Decision item 2 reframes that half as BYOK-reproducible (operator runs `pnpm --filter knowledge eval` locally with their own API key against the local Postgres + dev server). The 5th graduation cycle as originally framed is half-completed structurally; the data half lands when an operator runs it.
- **Adding seed-style data via authorize() side effect is unconventional**. A purist would prefer a separate seed mechanism. The trade-off was scope discipline (no new file + new pnpm script + new CI workflow update) over architectural purity. Documented here so a future maintainer doesn't refactor it without understanding the trade-off.

### Neutral

- **No production behavior change**. The provider does not register on Vercel; the build-time assertion fires only when env is misconfigured (and at build time, never at runtime). The Knowlex prod surface for end-users is unchanged by this ratchet.
- **Vitest count: 91 → 100** (+9 from `config.test.ts`). Total knowledge-app tests cross the 100 threshold for the first time.

## Alternatives

- **Skip ADR-0061 line 52 follow-up indefinitely; never replicate the Credentials provider for apps/knowledge**. Rejected — ADR-0064 § Decision named this as the closure path; not implementing means ADR-0064 perpetually-deferred, violating the graduation cycle pattern (`KL-build_ci-202604-graduation-cycle`).
- **Add a `prisma/seed.ts` to apps/knowledge for the E2E users instead of authorize()-side upsert**. Rejected at this scope — adds a new file + a pnpm script + potentially a CI workflow change, all for ~10ms DB roundtrip savings. Revisit if Knowlex E2E surface grows past 1-2 signins per run.
- **Reuse apps/collab's auth/ directory for both apps via a shared `packages/auth/`**. Rejected per ADR-0061 § Alternatives item 5 (the two apps have divergent provider needs — collab has the E2E provider here; knowledge has the demo-allowlist + Membership-based access in `access.ts` — and forcing them to share would create coupling bugs).
- **Skip the build-time assertion; rely solely on the runtime gate**. Rejected — defense-in-depth principle. The build-time assertion costs ~5 LOC and catches a class of misconfiguration (env var typo on Vercel project Environment Variables page) the runtime gate would also catch but at request time, not deploy time.
- **Implement the Credentials provider only for the calibration eval, not the Playwright suite**. Rejected — the same structural primitive serves both use cases; scoping to one would create artificial divergence with apps/collab.

## Implementation status

Shipped in v0.5.15:

- `apps/knowledge/src/auth/config.ts` — Credentials provider + `e2eGateOpen` predicate + `ALLOWED_E2E_EMAILS` constant + `maybeCredentialsProvider()` helper + auto-upsert E2E user.
- `apps/knowledge/src/auth/config.test.ts` (new) — 9 Vitest cases pinning the gate predicate + allowlist.
- `apps/knowledge/next.config.ts` — build-time assertion (VERCEL=1 + E2E_ENABLED=1 → throw).
- `apps/knowledge/scripts/eval.ts` — `acquireE2ESession()` CSRF + signin dance + `parseSetCookie` + `mergeCookies` helpers; `ingestCorpus` and `ask` accept optional `sessionCookie` injected via `cookie:` header.
- This ADR.
- `docs/adr/README.md` — index entry.
- `docs/adr/_claims.json` — ADR-0065 entries.
- `docs/adr/0064-hybrid-retrieval-calibration-architectural-gap.md` — § Status updated: architectural-gap half closed by this ADR; lift-figure half BYOK-reproducible per ADR-0067.

### Verification

```bash
node scripts/check-doc-drift.mjs          # → 0 failures (ADR 65)
node scripts/check-adr-claims.mjs         # → all pass; ADR-0065 entries present
node scripts/check-adr-refs.mjs           # → 0 dangling
pnpm --filter knowledge test              # → 100 passed (was 91, +9 from config.test.ts)
```

End-to-end signin verification (operator local, after the ADR-0067 incident is resolved or BYOK path):

```bash
docker run -d --name knowlex-pg -e POSTGRES_DB=knowlex -e POSTGRES_USER=app \
  -e POSTGRES_PASSWORD=app -p 5432:5432 pgvector/pgvector:pg16
docker exec -e PGPASSWORD=app knowlex-pg psql -U app -d knowlex \
  -c "CREATE USER migrator WITH SUPERUSER PASSWORD 'migrator';"
pnpm --filter knowledge exec prisma migrate deploy
E2E_ENABLED=1 \
  E2E_SHARED_SECRET=$(openssl rand -base64 32) \
  AUTH_SECRET=$(openssl rand -base64 32) \
  HYBRID_RETRIEVAL_ENABLED=0 \
  pnpm --filter knowledge dev
# (separate shell)
GEMINI_API_KEY=$YOUR_KEY \
  E2E_SHARED_SECRET=<same as above> \
  EVAL_JUDGE=1 \
  pnpm --filter knowledge eval
# Expected log line: "[eval] CI auth dance complete — signed in as e2e+owner@e2e.example"
```

The full BYOK runbook for the calibration is in README.md (post-v0.5.15) — see § Run Knowlex locally with your own API key.
