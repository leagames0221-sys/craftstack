# ADR-0034: Accessibility assertions via axe-core in the Playwright smoke layer

- Status: Accepted
- Date: 2026-04-23
- Tags: accessibility, testing, quality

## Context

The app ships real interactive UI — forms, modals, dropdowns, drag-and-drop, a streaming chat, a command palette. Accessibility regressions are easy to introduce (a button without a label, a modal without an `aria-modal`, insufficient color contrast), and they are both ethical failures and a legal exposure in many jurisdictions. Relying on manual review doesn't scale.

## Decision

Run `@axe-core/playwright` against every public page in the smoke suite (`/`, `/signin`, `/playground`) on every CI run, asserting zero `serious` or `critical` violations. Moderate and minor violations are logged but do not fail the build — they show up in the CI output and get addressed in follow-ups.

The tagset is `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`. Covering authenticated pages needs a seeded DB and is deferred (see [ADR-0022](0022-e2e-credentials-provider.md)).

## Consequences

Positive:

- A11y drift is caught at PR time, not in post-launch audits.
- axe-core's rule corpus is maintained by Deque; we inherit their WCAG coverage for free.
- The portfolio can honestly claim WCAG 2.1 AA compliance on its public surface.

Negative:

- The smoke layer now depends on a headless Chromium + axe engine per route, which adds ~5s to CI wall time.
- Overflow into "moderate" violations is easy to ignore over time — we should periodically sweep the logged ones so they don't snowball.

## Alternatives Considered

- **Manual a11y review before each release** — rejected; doesn't scale, no regression protection.
- **Lighthouse a11y score** — considered; runs in the same tool family but gives a single score rather than an enumerable violation list. axe-core is more actionable for "block the PR" gating.
- **jest-axe / vitest-axe at the component layer** — complementary but narrower; doesn't exercise the composed page (ARIA tree, focus order, color contrast of the real stack). We may add it later as a second layer.
