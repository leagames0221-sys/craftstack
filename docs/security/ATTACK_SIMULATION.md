# Attack simulation

`scripts/attack-simulation.mjs` exercises the cost-safety defenses
declared in [`COST_SAFETY.md`](../../COST_SAFETY.md) and the STRIDE
§ [Cost exhaustion](./threat-model.md) rows `C-01..C-06` against a
running Knowlex deployment. The point isn't to find zero-days — the
per-IP limiter, global budget, Zod byte cap, and `EMERGENCY_STOP`
flag are all unit-tested already — it's to produce a single artefact
that proves the defenses catch the shapes of attack they're
documented to catch.

## Why it exists

A portfolio reviewer reading the threat model has three reasonable
questions:

1. Are these mitigations actually wired, or just documented?
2. If an attacker tried the textbook shapes, would the documented
   layer catch them?
3. When the documented layer doesn't fire (the honest case — e.g.
   the per-container limiter on multi-region Vercel), does the repo
   admit it, and is there a next layer?

Unit tests answer (1). An attack bench that produces a public
artefact answers (2) and (3) in one shot.

## Scenarios

| ID   | Attack shape                              | Expected defense                                                                            |
| ---- | ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| C-01 | 11 rapid POSTs to `/api/kb/ask` (one IP)  | `kb-rate-limit.ts` per-IP sliding window refuses the 11th with 429 `RATE_LIMIT_EXCEEDED`    |
| C-02 | Global budget monotonicity                | `/api/kb/budget` `ask.day.used` increments after a real call; cap values expose the ceiling |
| C-05 | `/api/kb/budget` exposes `emergencyStop`  | GET returns 200 with `{ ask, ingest, emergencyStop: boolean }` shape                        |
| C-06 | 60 000-char `content` to `/api/kb/ingest` | Zod rejects with `BAD_REQUEST` before any DB / Gemini work                                  |

`C-03` (key leak to billable Cloud Console key) and `C-04` (silent
tier upgrade) are caught by the **static** `free-tier-compliance`
CI gate rather than by runtime behaviour — see the `free-tier-compliance`
job in [`ci.yml`](../../.github/workflows/ci.yml) and
[`scripts/check-free-tier-compliance.mjs`](../../scripts/check-free-tier-compliance.mjs).

## How to run

```bash
# Against local dev (safest — counters reset per run)
pnpm --filter knowledge dev &     # boots :3001 with a working DB
ATTACK_TARGET_URL=http://localhost:3001 pnpm attack:sim

# Against production (use --skip-budget to avoid burning the day cap)
ATTACK_TARGET_URL=https://craftstack-knowledge.vercel.app \
  pnpm attack:sim -- --skip-budget
```

Output:

- `docs/security/ATTACK_SIMULATION_RESULTS.json` — machine-readable,
  one entry per scenario with `expected`, `actual`, `pass`.
- `docs/security/ATTACK_SIMULATION_RESULTS.md` — the same data as a
  table, plus a methodology section regenerated from this file.

Exit code is non-zero when any scenario's actual outcome diverges
from its expectation. Those files are **not** committed — they're
local artefacts for post-deploy verification, so the reviewer sees
the methodology (this file) rather than a stale snapshot.

## Honest limitations

- **Per-container limiter on Vercel**: C-01 may pass locally but
  return `200` for all 11 calls against multi-region production,
  because Vercel routes sequential requests across warm containers
  and each one has a fresh per-IP window. This is the exact
  limitation documented in [ADR-0043](../adr/0043-knowlex-ops-cost-ci-eval.md)
  § Trade-offs and addressed by the deferred Upstash-backed limiter
  in [ADR-0046](../adr/0046-zero-cost-by-construction.md) § Trade-offs.
  When the attack bench catches this, it's surfacing a known gap —
  not inventing one.
- **Global budget C-02 trip test**: tripping the 800/day cap would
  require 801 real Gemini calls and so isn't run by default; the
  bench instead validates the observability plumbing (counters
  increment, cap values exposed), which is sufficient signal that
  the budget would fire when the cap is reached. This mirrors how
  the existing `retrieve.integration.test.ts` validates pgvector kNN
  shape without loading a production-scale corpus.
- **No bot / distributed-origin simulation**: a real attacker would
  rotate IPs and user-agents across regions. That escape path is
  tracked as the intended Cloudflare Turnstile mitigation (deferred)
  and is why `C-02` global budget exists as a second layer.

## When to re-run

- After every deploy that touches `/api/kb/**` or `lib/kb-rate-limit`
  / `lib/global-budget` / `lib/emergency-stop`.
- Before any release tag, as part of the cost-safety smoke.
- When the threat model gains or retires a `C-0x` row.
