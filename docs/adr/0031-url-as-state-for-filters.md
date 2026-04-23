# ADR-0031: URL query string as source of truth for board filters

- Status: Accepted
- Date: 2026-04-23
- Tags: ui, state, shareability

## Context

Board views have multiple filters (label chips, free-text search, later: assignee, due-date). A typical SPA stores this in component state or a client store (Zustand, Jotai). But a filtered view is exactly the thing users paste into Slack — "here's the bug backlog" — and a client-only store can't survive a page refresh or a shared link.

## Decision

Every board filter writes to the URL query string: `?labels=id1,id2`, `?q=foo`. Reading is done with `useSearchParams` and `useMemo`; writing uses `router.replace(href, { scroll: false })` to avoid a top-of-page scroll jump. The URL is the source of truth; component state only mirrors it where the controlled-input pattern requires it.

## Consequences

Positive:

- Shareable: a filtered board URL carries the whole state.
- Refresh-survives with no extra plumbing.
- Composable: `useMemo` derivations chain cleanly off `searchParams`.
- Back/forward buttons behave sanely — users can undo a filter change with the browser.

Negative:

- Long filter combinations produce long URLs; we keep each param compact (`labels=id,id` not JSON-encoded).
- Cross-filter derivations require re-reading `searchParams`; we centralized this where it mattered.

## Alternatives Considered

- **Client store** — rejected; breaks shareability and refresh.
- **Hash fragment** — rejected; not sent to the server, which means server components can't pre-filter for the initial render.
- **LocalStorage** — rejected; cross-device and cross-browser users expect shared URLs to work.
