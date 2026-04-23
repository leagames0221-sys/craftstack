# Free-tier onboarding

Every external service this repo talks to runs on a **credit-card-free free tier**. This guide is the definitive "how to run your own deployment of craftstack without ever typing a card number" checklist. Each service has a row; each row answers the same four questions:

1. What does it do?
2. Does craftstack need it, or is it optional?
3. Does signup require a credit card?
4. What does the app do when the service is unconfigured? (the **demo-mode** column)

For cost-attack / overage handling see [`COST_SAFETY.md`](../COST_SAFETY.md); that document covers the runtime guards. This one covers signup.

---

## Checklist summary

| Service                     | Role                              | Required? | CC at signup? | Demo mode when unconfigured                                                                        |
| --------------------------- | --------------------------------- | --------- | ------------- | -------------------------------------------------------------------------------------------------- |
| **GitHub**                  | Source hosting + Actions CI       | Required  | No            | n/a (you're already here)                                                                          |
| **Vercel Hobby**            | App hosting (both apps)           | Required  | No            | n/a                                                                                                |
| **Neon Free**               | Postgres for Boardly + Knowlex    | Required  | No            | Boardly 503s; Knowlex `/kb` shows the corpus as empty                                              |
| **Google AI Studio**        | Gemini embeddings + generation    | Optional  | No            | Playground streams a canned demo answer; Knowlex `/api/kb/ask` returns `GEMINI_NOT_CONFIGURED` 503 |
| **GitHub OAuth app**        | Auth.js sign-in for Boardly       | Optional  | No            | `/signin` hides the GitHub button                                                                  |
| **Google OAuth app**        | Auth.js sign-in for Boardly       | Optional  | No            | `/signin` hides the Google button                                                                  |
| **Upstash Redis Free**      | Shared rate-limit store (planned) | Optional  | No            | In-process rate limits still work per-container                                                    |
| **Pusher Channels Sandbox** | Realtime card fanout              | Optional  | No            | Mutations skip the broadcast; other clients poll on reload                                         |
| **Resend Free**             | Invitation emails                 | Optional  | No            | Invitation link is logged to the server console                                                    |
| **Sentry Free**             | Error tracking                    | Optional  | No            | In-memory ring buffer at `/api/observability/captures`                                             |
| **UptimeRobot Free**        | External uptime ping (planned)    | Optional  | No            | GitHub Actions `smoke.yml` cron already covers uptime                                              |

**Nothing above requires a credit card.** If a signup flow ever asks for billing details, stop — the service has changed its policy and this guide is out of date; open an issue.

---

## Step-by-step signup

### 1. GitHub repository

You're already here. Fork `leagames0221-sys/craftstack` or clone it. For Actions to run you only need a public repository; private repos still work but eat into the 2000-min/month quota.

### 2. Vercel Hobby

1. Go to <https://vercel.com/signup> and sign up with your GitHub account. No card requested.
2. Import the repo as two separate projects:
   - `craftstack-collab` — Root Directory `apps/collab`.
   - `craftstack-knowledge` — Root Directory `apps/knowledge`.
3. For each project, **skip adding a payment method** when prompted. Hobby caps out at 100 GB bandwidth + 1M invocations / month and **refuses requests rather than charging** when exceeded.

### 3. Neon Postgres (two databases)

1. Sign up at <https://console.neon.tech>. Email only.
2. Create two projects in the **AP Southeast 1 (Singapore)** region:
   - `boardly-db`
   - `knowlex-db`
3. For `knowlex-db`, enable the `vector` extension: in the SQL editor, run `CREATE EXTENSION IF NOT EXISTS vector;` against the `neondb` database.
4. For each Vercel project, copy the **Direct** connection string from Neon's Connection Details panel and paste it into the project's env:
   - `DATABASE_URL` and `DIRECT_DATABASE_URL` — both to the Direct URL
5. Apply the Prisma migrations:
   ```bash
   pnpm --filter collab exec prisma migrate deploy
   pnpm --filter knowledge exec prisma migrate deploy
   ```
   Set `DIRECT_DATABASE_URL` in your shell first; `prisma.config.ts` prefers it over `DATABASE_URL`.

### 4. Google AI Studio (Gemini) — optional but recommended

> **Critical**: use AI Studio, _not_ Google Cloud Console.
>
> - `https://aistudio.google.com/app/apikey` → keys created here are **free-tier-locked** and cannot be upgraded to billing without an explicit migration. Safe.
> - `https://console.cloud.google.com` → keys created there _can_ be billable. **Do not use.**

1. Open <https://aistudio.google.com/app/apikey>. Email signup, no card.
2. Click **Create API key**. Name it `craftstack-knowlex`.
3. Paste the key into both Vercel projects as `GEMINI_API_KEY`.
4. Redeploy. `/playground` (collab) now streams live answers; `/kb` + `/` (knowlex) ingest + RAG end-to-end.

Without this step, `/playground` falls back to a deterministic canned answer and `/api/kb/ask` returns a polite 503 — both apps stay fully browsable, just without live generation.

### 5. OAuth apps for Boardly — optional

Both are email-only signup. Instructions in [apps/collab README](../apps/collab/README.md).

- **GitHub OAuth app**: <https://github.com/settings/developers> → New OAuth App. Homepage `https://craftstack-collab.vercel.app`, Callback `https://craftstack-collab.vercel.app/api/auth/callback/github`. Copy Client ID + Secret into `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`.
- **Google OAuth app**: <https://console.cloud.google.com/apis/credentials>. Create a "Web application" OAuth 2.0 client. Yes, this is Cloud Console — but creating an OAuth client itself is free. The page does not ask for billing. Do **not** enable any APIs on this project; just create the client.

### 6. Upstash Redis Free — optional, not yet wired

Signup at <https://console.upstash.com>. Email only, no card. Create a Tokyo-region Redis database. Free tier: 10k commands / day. Not currently consumed by the app — reserved for the distributed rate-limit follow-up.

### 7. Pusher Channels Sandbox — optional

1. Sign up at <https://dashboard.pusher.com/accounts/sign_up>. Email only, no card.
2. Create a **Sandbox** app (distinct from Production; Sandbox is capped and free).
3. Copy `app_id`, `key`, `secret`, `cluster` into the collab Vercel project as `PUSHER_APP_ID` / `PUSHER_KEY` / `PUSHER_SECRET` / `PUSHER_CLUSTER`.

Without this step Boardly still works — card moves just don't broadcast to other clients in realtime; a page refresh picks up the latest state.

### 8. Resend Free — optional

1. Sign up at <https://resend.com/signup>. Email only, no card.
2. Create an API key at <https://resend.com/api-keys>, paste into `RESEND_API_KEY` on the collab project.
3. Verify the `onboarding@resend.dev` sender if you want emails to actually leave Resend's sandbox.

Without this step, invitation links are logged to the Vercel function console instead of being emailed. The accept-page flow still works if you paste the link manually.

### 9. Sentry Free — optional

1. Sign up at <https://sentry.io/signup/>. Email only, no card.
2. Create two projects, one per app, framework **Next.js**.
3. Copy the DSN from each project's SDK settings.
4. Paste into Vercel:
   - Server: `SENTRY_DSN` (both projects) — picked up by `src/instrumentation.ts`.
   - Client: `NEXT_PUBLIC_SENTRY_DSN` (both projects) — picked up by `src/instrumentation-client.ts`.
5. Optional: `SENTRY_TRACES_SAMPLE_RATE=0.1` (server) and `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.1` (client).

**You don't have to do this.** Without a DSN, every captured error lands in an in-memory ring buffer instead, and you can inspect it at `/api/observability/captures` in dev / preview. This is an explicit design choice so portfolio reviewers can prove the error pipeline works without signing up for anything. See `docs/adr/0045-observability-demo-mode.md` for the rationale.

### 10. UptimeRobot — optional and not yet wired

If you want a second opinion outside GitHub Actions, sign up at <https://uptimerobot.com/signUp>. Email only. Free tier: 50 monitors @ 5-minute intervals. Point monitors at `/api/health` on both Vercel URLs. Out of scope for v0.4.0; `smoke.yml` already runs every 6 hours.

---

## What "demo mode" actually looks like

The portfolio is designed so a reviewer can land on the repo, clone it locally with no environment variables, run `pnpm dev`, and see every feature do _something sensible_ instead of a 500.

| Feature                        | Demo-mode behaviour without any env vars                                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Boardly `/`                    | Landing page renders; links to `/signin` / `/playground` / `/docs/api`                                                                       |
| Boardly `/signin`              | Page renders with provider buttons hidden (no OAuth client ids)                                                                              |
| Boardly `/playground`          | Streams a deterministic canned answer built from the pasted context                                                                          |
| Boardly `/docs/api`            | Server-rendered OpenAPI reference                                                                                                            |
| Knowlex `/`                    | Empty-corpus Ask UI, "The provided passages do not contain information..." on any question                                                   |
| Knowlex `/kb`                  | Lists zero documents, accepts ingest (returns 503 until Gemini key set)                                                                      |
| Knowlex `/api/kb/stats`        | Returns `{documents: 0, chunks: 0, embeddings: 0, indexType: "hnsw"}` — the HNSW index is part of the migration, not of any env var          |
| `/api/observability/captures`  | Returns the in-memory ring (or `404 DISABLED` in production without `ENABLE_OBSERVABILITY_API`)                                              |
| `pnpm --filter knowledge eval` | Fails at the `ingest` step because Gemini isn't configured — _by design_; the script is only meaningful against a live deploy with a key set |

Every demo-mode path is covered by at least one Playwright smoke assertion so "the site works without any secrets" is enforced by CI, not just promised in docs.

---

## When to graduate off the free tier

Nothing in this repo is built to force an upgrade. Signs you actually need paid:

- **Vercel Pro**: > 100 GB bandwidth/month or > 1M function invocations/month. Before upgrading, check whether the abuse-defence layers in `COST_SAFETY.md` are properly tuned.
- **Neon Scale**: > 191.9 compute-hours/month. Free tier auto-scales to zero after 5 minutes idle, so a portfolio deploy should almost never touch this cap.
- **Sentry Team**: > 5k errors/month. If you're capturing that many in a portfolio deploy, something is genuinely wrong in the app — fix it first.
- **Gemini paid tier**: never from AI Studio keys. If you want Gemini 2.5 Pro or higher RPM, create a billable key on Cloud Console _separately_ and swap it in deliberately; don't let it happen by accident.
