# ADR-0054: doc-drift-detect CI gate — closing the prose-coherence gap

- Status: Accepted
- Date: 2026-04-28
- Tags: ci-enforcement, audit-survivability, observability, hiring-sim
- Companion to: [ADR-0053](0053-runtime-schema-canary.md) (same shape — structural assertion that doc-claim ↔ implementation stays coherent at PR time)

## Context

Two independent audits surfaced the same drift class on this codebase within ~36 hours of each other:

1. The **v2-methodology hiring sim Run #4** (`~/.claude/other-projects/craftstack/52_hiring_sim_run_4_2026-04-28.md`) explicitly named "prose drift across portfolio-lp / interview-qa / system-overview / runbook / threat-model / About sidebar / landing page Stat block" as the v1-methodology miss; the v2 cross-check verified `git grep` against every count claim (52 ADRs / 38 routes / 24 Playwright / 19+4 models). Run #3's `strong hire` verdict was reactive to that drift; Run #4's `hire conditional` was the corrected calibration.

2. The **manual drift audit** (Session 262, PR #42) executed the same cross-check candidate-side after the v0.5.3 + v0.5.4 ship pair and found **11 files** with stale numerics — `Vitest: 206` claims that should have read `211` after ADR-0053 added 5 cases. Each fix was correct, but the audit was 100% manual `grep` + edit. Without a structural gate, the next ship reproduces the same drift class because there is no PR-time signal that says "you forgot to update README + portfolio-lp + interview-qa + page.tsx + layout.tsx + opengraph-image when you added a test."

`docs/hiring/interview-qa.md` Q29 ("what would you do differently?") explicitly named the doc-drift-detect CI gate as a planned v0.5.4 follow-up:

> The institutional fix is the doc-drift-detect CI gate planned for v0.5.4 (extends [ADR-0051](0051-prisma-migrate-on-vercel-build.md) drift-detect-v2 from schema to documentation).

This ADR ships that gate.

## Decision

A new PR-blocking CI job, `doc-drift-detect`, runs `node scripts/check-doc-drift.mjs` on every PR. The script resolves the **truth** for each invariant from the actual codebase and asserts every documented **claim** matches:

### Truth resolvers

| Invariant                 | Truth source                                                         |
| ------------------------- | -------------------------------------------------------------------- |
| ADR count                 | `readdirSync('docs/adr')` filtered by `^\d{4}-.*\.md$`               |
| Vitest collab subtotal    | `pnpm --filter collab test` → parse `Tests N passed` from summary    |
| Vitest knowledge subtotal | `pnpm --filter knowledge test` → parse `Tests N passed` from summary |
| Vitest total              | sum of the two subtotals                                             |
| Boardly route count       | recursive walk of `apps/collab/src/app/**/{route.ts,page.tsx}`       |
| Playwright test() count   | regex match `^\s*test\s*\(` in `apps/collab/tests/e2e/**/*.spec.ts`  |
| Latest git tag            | `git describe --tags --abbrev=0`                                     |

### Claim regexes

For each invariant, a list of `(file, regex)` pairs identifies every place the doc claims that number. Examples:

- ADR count: `(\d+) entries`, `Decision records \((\d+)\)`, `\*\*(\d+) ADRs\*\*`, `label="ADRs" value="(\d+)"`
- Vitest total: `Tests: (\d+) Vitest`, `tests-(\d+)%20%2B%20\d+`, `Vitest \(\*\*(\d+)\*\* unit cases`, `(\d+) Vitest \+ \d+ Playwright`, `"(\d+) tests"`, etc.
- Status banner version: `\*\*Status \(as of (v\d+\.\d+\.\d+)`

Naive `test(` / `it(` parsing of source files **miscounts** `test.each([...])` and `describe.each([...])` because each row of the matrix expands into a separate case at runtime. Vitest's own count is the only reliable truth for the test-count invariants — the script invokes `pnpm test` for each app and parses the summary line. CI duplicates this run in the existing `lint / typecheck / test / build` job (~3s overhead total), but the only-source-of-truth property is worth the cost.

### Failure semantics

| Outcome                                 | Behaviour                                                                                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Number / version mismatch               | `fail` — exit 1 — PR-blocking                                                                                                                  |
| Claim regex matches no text in the file | `warn` — soft, non-blocking. Catches "the surrounding prose was rewritten and the regex needs maintenance" without false-failing unrelated PRs |
| Truth source unavailable                | `fail` — script broken, fix the script                                                                                                         |

### Vendor whitelist

A second pass asserts the three `package.json` files (`/`, `apps/collab/`, `apps/knowledge/`) do not depend on `socket.io`, `socket.io-client`, `@socket.io/*`, or `bullmq`. Per ADR-0052, those are superseded by Pusher Channels; a code-level dep on any of them would mean the supersession is incomplete or that the ratchet was bypassed by accident.

### Status banner version

A third pass extracts the `**Status (as of vX.Y.Z)` banner from the four authoritative status-bearing docs (portfolio-lp, interview-qa, system-overview, runbook) and asserts each matches `git describe --tags --abbrev=0`. This is the class that drifted in PR #42 (`v0.5.2` banners after the v0.5.3 + v0.5.4 ship pair).

## Consequences

### Positive

- **Closes the run #4 v2 hiring-sim drift class structurally**. The "polished portfolio with stale interior" pattern that downgraded run #4's coherence score from 5/5 to 4/5 is now caught at PR time, not at hiring-sim time. A reviewer cannot find a number in this repo that contradicts the codebase, because the CI would have failed the merge.
- **Closes the Session 262 manual-audit ratchet**. The 11-file fix in PR #42 was 100% manual; this gate replaces that labour with a script that runs in seconds and cannot forget a file.
- **Self-applies the same ADR-0046 discipline to docs**. ADR-0046 says "guarantee is structural, not aspirational" for cost safety. ADR-0051 + ADR-0053 say the same for schema integrity. ADR-0054 extends the discipline to prose claims — the audit-survivability stance is now consistent across cost / schema / prose layers.
- **Makes interview-qa Q29 self-resolving**. Q29's self-criticism ("the institutional fix is the doc-drift-detect CI gate planned for v0.5.4") flips from a deferred plan to a ship-tag entry. The candidate's own self-criticism becomes the candidate's own structural ratchet log — exactly the pattern ADR-0049 § 7th arc demonstrates for eval reliability.
- **Linear maintenance**. Adding a new claim site means appending one `(file, regex)` tuple to the right truth's `claims` array. Adding a new invariant means adding a truth resolver function (~10 lines) and the corresponding `claims` array.

### Negative

- **Vitest run duplicated** between this job and the existing `lint / typecheck / test / build` job. ~3s extra CI time per PR. Not optimised for shared cache because the doc-drift job is intentionally minimal — keeping it self-contained makes it auditable and lets it ship without coupling to the bigger CI job's lifecycle. If the CI cost ever bites, the optimisation is to drop the doc-drift job's `pnpm test` invocation and instead read a pre-emitted JSON report from the test job's artifact (the eval workflow already does this).
- **Regex maintenance**. When prose is rewritten in a way that changes the surface form of a claim ("206 unit cases" → "across the 206-case matrix"), the regex no longer matches and the script emits a soft warn instead of a hard fail. The warn is intentional — failing all unrelated PRs because of regex breakage would be the wrong trade-off — but it does mean a regex update follow-up is needed. The follow-up is cheap (one line per claim) and the warn output names the file + the regex so the fix is mechanical.
- **Tests-as-truth coupling**. If the test suite breaks (vitest fails) the truth resolver throws and the script fails before reaching the claim assertions. This is correct — you cannot validate doc claims against a broken test suite — but it means a test failure causes both `lint / typecheck / test / build` AND `doc-drift-detect` to fail, doubling the PR's red-check count. The single-cause-double-symptom pattern is a wash; tracking down the test failure fixes both.

## Alternatives

- **Templating** (Pattern B): replace embedded numbers with placeholders (`<!-- ADR_COUNT -->`) and a generation script. Rejected because the prose ugliness ("`<!-- ADR_COUNT --> ADRs documenting`...") is real and the maintenance overhead (generation script, CI step that re-generates and asserts no diff) is comparable to the regex approach without being any cleaner. The regex approach also catches divergence on hand-written prose that templating cannot reach.
- **Single-source-of-truth `metrics.json` + derive everything** (Pattern C): define `metrics.json` once and have all docs derive their numbers from it. Astro / Docusaurus / Mintlify do this with content-collections + Zod schema validation. Rejected because Next.js + plain-markdown is the existing stack and switching CMS is a large unrelated migration. The shields.io endpoint badge already does this for the measured-eval badge (`docs/eval/badge.json`); the same pattern doesn't extend cheaply to prose.
- **Living with the drift**: most portfolios do this. Senior reviewers tolerate it because it's the base rate. Rejected because the `audit-survivable engineering` topic (literally the GitHub repo About sidebar tag) has to mean something; tolerating drift contradicts the brand.
- **Run vitest with `--reporter=json` and parse**: more efficient than parsing the human-formatted summary line but the JSON shape changes between vitest major versions; the human-formatted "Tests N passed" line has been stable since vitest 1.x. The script intentionally targets the stable surface.

## Implementation status

Shipped in v0.5.5:

- `scripts/check-doc-drift.mjs` — the script (truth resolvers + numeric claim checks + status banner check + vendor whitelist check)
- `.github/workflows/ci.yml` — new `doc-drift-detect` PR-blocking job
- `docs/hiring/interview-qa.md` Q29 — self-criticism ("planned for v0.5.4") flipped to ship status ("shipped in v0.5.5 as ADR-0054")
- This ADR
- `docs/adr/README.md` index entry
- `CHANGELOG.md` v0.5.5 entry
- ADR count 53 → 54 across all surfaces (the script catches this transition; the script is its own first regression test)

The dynamic invariants (ADR count, Vitest counts, route count, Playwright count, status banner tag) are all asserted on every PR. Prose drift is now a structural gate, not a vibe.
