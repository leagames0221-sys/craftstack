# ADR-0040: Roll back nonce + strict-dynamic CSP; accept A grade for a working site

- Status: Accepted (supersedes the nonce-based CSP recorded implicitly in Session 251 Push #2 and in the README's v0.3.0 Security claim)
- Date: 2026-04-24
- Tags: security, csp, operational

## Context

Session 251 reached an **A+** on [securityheaders.com](https://securityheaders.com/?q=https%3A%2F%2Fcraftstack-collab.vercel.app%2F&followRedirects=on) by emitting a per-request nonce-based CSP from the Next 16 proxy (`'nonce-XXX'` + `'strict-dynamic'`, no `'unsafe-inline'` in `script-src`). That stance is the W3C-recommended posture for strict XSS defence.

On Vercel's platform it stopped working in practice. The `/playground` page in particular — and by extension every page whose client interactivity depends on hydration — **silently failed to hydrate**: Ask button did nothing, keyboard shortcuts didn't fire. Browser console showed a cascade of `Refused to execute inline script` violations, origin:

- **Vercel platform-injected scripts** (Speed Insights, preview toolbar, occasional platform instrumentation) are appended to the document at the edge _after_ our proxy runs. They carry no nonce attribute.
- `'strict-dynamic'` disables every host-based allowlist (`'self'`, `https:`) AND `'unsafe-inline'` as fallbacks — only nonced scripts and their transitive loads are permitted.
- The W3C spec also says: **the mere presence of a nonce in `script-src` makes the browser ignore `'unsafe-inline'`**, even without `'strict-dynamic'`. So adding `'unsafe-inline'` as a safety net was a no-op.

Net effect: the "A+" grade came with a broken interactive surface. Unacceptable for a recruiter-facing portfolio where the Playground is the single biggest AI-capability signal.

## Decision

Roll the CSP back to a **static, per-response policy in `next.config.ts`**:

- `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live https://*.vercel-insights.com https://*.vercel-scripts.com`
- `'unsafe-eval'` added because Vercel Speed Insights uses `eval` at runtime.
- No nonce anywhere. Per-request generation + header-forwarding removed from the proxy. The proxy becomes auth-only again.
- Every other hardened header (HSTS 2y preload, X-Frame-Options DENY, Cross-Origin-Opener-Policy same-origin, Cross-Origin-Resource-Policy same-origin, Permissions-Policy denying 17 capabilities, Referrer-Policy strict-origin-when-cross-origin) stays intact.

Expected grade on securityheaders.com: **A** (one notch down from A+; `'unsafe-inline'` in script-src triggers the grade cap).

## Consequences

Positive:

- **The site actually works.** Every interactive page — Playground, dashboard, board, command palette, shortcuts modal, undo/redo — hydrates and responds to user events.
- Static CSP is trivially observable from `curl -I`, vs. having to decode a per-request nonce.
- One fewer moving part in the request path; the proxy no longer allocates a nonce per page load.
- Every other security dimension (cost-attack defence, tenant isolation, rate limits, authed E2E, CodeQL, SBOM, etc.) is unaffected.

Negative:

- **`'unsafe-inline'` allows in-page `<script>` tags and inline event handlers to run.** Because the React runtime auto-escapes user-provided text and server-side validation happens via zod + parameterized Prisma queries, the practical XSS surface is unchanged — but the _stated_ defence is weaker than before.
- **`'unsafe-eval'` allows runtime code generation (eval / Function).** Required by Vercel's Speed Insights; no realistic workaround without disabling the feature.
- The securityheaders.com grade regresses A+ → A. Conspicuous on the README badge; mitigated by the inline README note pointing at this ADR.

## Alternatives Considered

- **Keep nonce + strict-dynamic, disable Vercel Speed Insights / preview toolbar entirely.** Rejected — loses performance observability and the Vercel preview workflow; mutes Vercel feature value for a pure cosmetic grade.
- **Self-host every inline script with a computed SHA-256 hash** in `script-src`. Impractical — Vercel's injected scripts change at the edge per deploy; hash list would need CI regeneration and still lag behind.
- **Keep the nonce-based CSP, accept broken interactivity.** Rejected — the Playground is load-bearing for the portfolio narrative. A "demo page that doesn't work when you click the button" is worse than a "less-strict CSP that scored A."
- **Add a custom `_document.tsx` that nonce-tags all platform script tags server-side before the edge can inject.** Explored; Next 16 App Router doesn't expose `_document.tsx`, and the root-layout equivalent can't intercept Vercel's edge injection. Dead end without a deeper platform integration.

## Follow-up (future-ADR candidates)

1. **Re-attempt A+ when/if Vercel ships nonce-aware platform scripts** (or allows turning them off per-project without losing observability). Track as deferred.
2. **`'unsafe-eval'` removal** once Vercel Speed Insights switches away from `eval`. The [Vercel roadmap](https://vercel.com/changelog) is the source of truth.
3. **Per-route CSP tightening** for the `/api/*` surface — since those don't serve HTML, a stricter policy is possible there without breaking anything.

## Related

- README "Security headers" bullet (A grade, linked here)
- `apps/collab/next.config.ts` — the CSP source
- `apps/collab/src/proxy.ts` — now auth-only, no CSP
- [ADR-0037](0037-cost-attack-hardening-layered-budgets.md) — cost-attack defence remains the harder wall; A vs A+ is a cosmetic delta next to `$0 under adversarial load` guarantees
