# Cost safety

This project is designed to run at **$0/month** and to stay there under adversarial traffic. If you operate a deployment of craftstack, this document describes every service it talks to, the failure mode when quota is exhausted, and the specific foot-guns to avoid — in particular the Japan-style cost-attack patterns (AWS S3 presigned-URL bandwidth theft, Firebase read-loop, Cloud Run auto-scale) that have made headlines recently.

## Summary table

| Service                                 | Free-tier cap                                                | Cap-exceeded behavior                              | Needs a credit card? | Auto-upgrades to paid?                 |
| --------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------- | -------------------- | -------------------------------------- |
| **Vercel Hobby**                        | 100 GB bandwidth, 100 function-hours, 1M invocations / month | `503 Service Unavailable`; functions refuse to run | **No**               | **No** — requires explicit Pro upgrade |
| **Neon Postgres (Free)**                | 191.9 compute-hours, 0.5 GB storage, auto-scales to zero     | Connections refused                                | No                   | No                                     |
| **Google AI Studio** (Gemini 2.0 Flash) | 1,500 requests/day, 15 RPM, 1M TPM                           | Returns `429 Too Many Requests`                    | No                   | No (Studio key is free-tier-locked)    |
| **Pusher Channels** (Sandbox)           | 200k messages/day, 100 concurrent connections                | Messages dropped, new connections refused          | No                   | No                                     |
| **Resend** (Free)                       | 100 emails/day, 3,000/month                                  | Sends refused                                      | No                   | No                                     |
| **GitHub Actions** (public repo)        | Unlimited minutes for public repos                           | —                                                  | No                   | No                                     |

Every service above ships the **"cap out to zero cost"** failure mode rather than the **"auto-scale to the attacker's credit card"** failure mode — provided you follow the setup rules below.

## Setup rules (critical)

### Gemini key

> **Do**: generate at <https://aistudio.google.com/app/apikey>. This is the **AI Studio** key; it is free-tier-locked by default and Google cannot bill you for overage.

> **Don't**: generate a Generative Language API key via Google Cloud Console with billing enabled. If you do, abusive traffic can translate into a real bill.

If `GEMINI_API_KEY` is unset, `/api/kb/ask` falls back to a deterministic demo mode (see [`apps/collab/src/lib/kb-demo.ts`](apps/collab/src/lib/kb-demo.ts)) — so the playground stays demonstrable without any setup and with zero external cost.

### Vercel plan

Keep the project on the **Hobby** plan (the default). Do **not** click "Upgrade to Pro" prompts unless you have a business reason. Vercel will happily 503 your deploy when Hobby caps are exhausted rather than silently charging you.

Do not add a payment method unless you need a Pro feature. A Hobby account with no payment method on file is mechanically incapable of incurring charges.

### Neon / Pusher / Resend

All three issue free-tier accounts without a credit card. If prompted to add billing, decline. The service degrades (connections refused, messages dropped, sends refused) but never bills.

## Defense-in-depth inside this repo

Even with the above setup, the code itself caps abuse:

### `/api/kb/ask` (Knowlex playground)

1. **Auth-free by design** — demo must work without signup, so a public rate limit matters.
2. **Per-IP sliding window** (10 req / 60s): [`lib/kb-rate-limit.ts`](apps/collab/src/lib/kb-rate-limit.ts). In-memory, per-container.
3. **Global daily/monthly budget** (800/day, 10,000/month): [`lib/global-budget.ts`](apps/collab/src/lib/global-budget.ts). Defense-in-depth for the hypothetical "operator wired a billing-enabled Cloud key by mistake" case. Overrideable via `KB_BUDGET_PER_DAY` / `KB_BUDGET_PER_MONTH`.
4. **Google AI Studio's own 1500 RPD cap** sits above both — even if the above fail, a free-tier key physically can't exceed Google's limit.

### `/api/search`, `/api/notifications`

Authenticated reads that would otherwise be attack-valuable against Neon compute hours:

- `/api/search` — 60 req / 60s per signed-in user
- `/api/notifications` — 30 req / 60s per signed-in user (the bell polls every 30s, so 15x headroom)

Both return a `RateLimitError` (HTTP 429) with a `code` field the client can branch on.

### `/api/workspaces/:id/invitations` (email-sending)

Three-layer rate limit from [ADR-0027](docs/adr/0027-three-layer-invitation-rate-limit.md):

- Global: 1000 invitations/month (well under Resend's 3k)
- Per-workspace: 50/day
- Per-user: 20/day

The caps are env-overridable but the defaults alone cannot saturate Resend's free quota even under full abuse.

### Everything else (auth-gated REST)

All mutations require an Auth.js session cookie. An attacker must successfully complete OAuth with GitHub or Google — itself rate-limited by the providers — and the signed-in account can then be banned by a workspace OWNER. The RBAC gate in `roleAtLeast` (ADR-0023) means non-admin accounts can only affect workspaces they belong to.

## What happens when the attack actually hits

| Attack                                                | Effect                                                                                                                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public DoS on `/api/kb/ask` with many IPs             | Per-IP limit trips at 10/min/IP → global budget trips at 800/day → Gemini's own 1500 RPD caps the rest. $0 spent. Service returns `429` until the window resets. |
| Authenticated tab spamming `/api/search`              | Per-user limiter trips at 60/min → `429`. Neon compute preserved.                                                                                                |
| Public scraper pulling `/api/openapi.json` repeatedly | Vercel CDN caches the response (`s-maxage=3600`), ~zero function invocations.                                                                                    |
| Public bandwidth DoS on the landing page              | Vercel CDN caches most assets; the dynamic landing renders under the Hobby 100GB/month cap, then 503s at the cap. No charges.                                    |
| Abuse of the invitation email endpoint                | Three-layer rate limit → `429` at the caller; Resend free quota preserved.                                                                                       |

**The one residual risk** is an operator misconfiguring `GEMINI_API_KEY` against a billing-enabled Google Cloud project. The global budget in `lib/global-budget.ts` caps that at 10,000 invocations/month even if the operator does so. At Gemini 2.0 Flash public pricing (as of 2026-04), 10k invocations bounded by our context size is an upper-bound of single-digit USD per month — worst case, not catastrophic — and the operator sees the `BUDGET_EXCEEDED` errors in their logs before the bill grows.

## Reporting a new attack surface

If you think you've found a path that could cause real charges on a default setup, **do not open a public GitHub issue**. See [SECURITY.md](SECURITY.md) for the private disclosure process.
