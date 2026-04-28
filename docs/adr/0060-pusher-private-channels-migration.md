# ADR-0060: Pusher private channels migration — closing T-01 (public-channel honest disclose)

- Status: Accepted
- Date: 2026-04-28
- Tags: realtime, security, defense-in-depth, pusher, auth
- Companions: [ADR-0052](0052-pusher-pivot-from-flyio-socketio.md) (the original Pusher pivot from Fly.io + Socket.IO), [ADR-0023](0023-four-tier-rbac.md) (workspace-membership role model used for the auth check), [ADR-0046](0046-zero-cost-by-construction.md) (free-tier resilience, Pusher Sandbox tier still applies)

## Context

ADR-0052 shipped Pusher Channels as the realtime fanout for Boardly. The implementation used **public Pusher channels** named `board-<boardId>`. From v0.5.4 through v0.5.10 this was disclosed in [`docs/security/threat-model.md`](../security/threat-model.md) as **T-01**:

> Pusher channel eavesdropping on `board-<id>` events. **Honest scope note**: v0.5.4 uses public Pusher channels — anyone who learns a `boardId` and the public Pusher key can subscribe and observe broadcast events. The defence is that boardIds are only visible through authenticated REST endpoints gated by `requireWorkspaceMember`; broadcast event payloads are minimal (kind + listId + cardId) and never include card content. Migrating to private/presence channels with a server-signed auth route is on the v0.6.0 roadmap to make this defence-in-depth instead of access-control-by-id-secrecy.

The defence relied on **boardId secrecy**: a boardId is a 25-character cuid hard to guess, and access-controlled at every REST endpoint. But:

- Realtime payloads carried `cardId` / `listId` values to subscribers. A leaked boardId (e.g. via a Vercel preview URL screenshot, a copy-pasted bug report, an OAuth-authorised browser extension) plus the public `NEXT_PUBLIC_PUSHER_KEY` (intentionally browser-exposed) would let an outsider observe board activity in real time.
- The defence was named "access-control-by-id-secrecy" in T-01 itself — a known anti-pattern in security literature (sometimes "security through obscurity").
- ADR-0046's stance ("guarantee is structural, not aspirational") demanded migrating to defence-in-depth eventually.

ADR-0059 (framework v1.0 freeze) explicitly named T-01 as a deferred item the framework freeze does **not** cover — T-01 is a product-feature gap, not an audit-framework axis, so closing it is on-roster post-freeze.

## Decision

Migrate every per-board fanout channel from `board-<boardId>` (public) to `private-board-<boardId>` (auth-required private). The Pusher Channels protocol activates server-side auth signing for any subscription to a `private-*` channel: the browser POSTs `socket_id` + `channel_name` to a configurable `authEndpoint`, the server returns a signed token, and Pusher only honors subscriptions whose token validates.

Concretely:

### Server-side

1. **`apps/collab/src/lib/pusher.ts`** — rename `getClient()` (private) to `getPusherServer()` (exported), add `boardChannelName(boardId)` helper that returns `"private-board-<id>"`, and update `broadcastBoard()` to use it. Add `parseBoardChannel(name)` — the inverse, used by the auth route's allow-list.
2. **`apps/collab/src/app/api/pusher/auth/route.ts`** — new `POST` handler:
   - Verifies Auth.js session (401 if missing).
   - Parses Pusher's form-encoded body (`socket_id` + `channel_name`).
   - Asserts the channel name matches `private-board-<id>` shape — rejects all other private-\* requests (the route is **not** a generic Pusher signing oracle).
   - Loads the board + workspace + membership in one Prisma query and 403s any of: deleted board, deleted workspace, non-member.
   - Calls `pusher.authorizeChannel(socketId, channelName)` and returns the signed JSON.
3. **No change** to `broadcastBoard` callsites in `apps/collab/src/server/*` — they pass through the channel-name helper transparently.

### Client-side

4. **`apps/collab/src/lib/pusher-client.ts`** — configure `authEndpoint: "/api/pusher/auth"` on the `PusherClient`. The Auth.js session cookie is sent automatically (same-origin POST), so no header plumbing needed.
5. **`apps/collab/src/app/w/[slug]/b/[boardId]/BoardClient.tsx`** — subscribe via `boardChannelName(boardId)` instead of hardcoded `board-${boardId}`. The helper is re-exported from `@/lib/pusher` to keep client and server using the same function.

### Tests

6. **`apps/collab/src/lib/pusher.test.ts`** (new) — 8 cases covering `boardChannelName` round-trip + `parseBoardChannel` allow-list (legacy public name rejected, unrelated `private-*` rejected, separator-smuggling defended, empty-id rejected). The helpers are the **single contract surface** between three independent files (server-emit, client-subscribe, auth-route allow-list); pinning them prevents the silent drift class.

### Tear-down trade-off

Browser clients on a stale tab pre-deploy will be subscribed to `board-<id>` (which the new server doesn't broadcast to). They get **silent realtime stalls** until the tab refreshes. Mitigation:

- The deploy is fast (~30 s on Vercel); the window is small.
- `BoardClient.tsx` already calls `router.refresh()` on broadcasts, so a missed broadcast is recovered the next time the user takes any action that hits the server.
- This is a one-time migration, not a recurring trade-off.

## Consequences

### Positive

- **T-01 closed**. Defence is no longer access-control-by-id-secrecy; it's a server-signed token verifying workspace membership at subscribe time. A leaked boardId no longer leaks realtime events to non-members.
- **Single channel allow-list at the auth route**: any future addition of `presence-*` or other private channel shapes is a deliberate code change to `parseBoardChannel`, not an accidental signing oracle.
- **No new operational cost**: Pusher Sandbox tier supports private channels; ADR-0046 free-tier compliance unchanged.
- **Brand: T-01 was an honest-disclose for ~6 months**. Resolving it (instead of forever-disclosing) demonstrates that honest-disclose is a temporary discipline, not a permanent dodge — exactly what the v0.5.10 honest-disclose TTL ratchet (ADR-0059) named as the right shape.

### Negative

- **One-time refresh window** during deploy: stale tabs subscribed to legacy `board-<id>` channels miss broadcasts until refresh (mitigated above).
- **New attack surface**: the auth route is now a signing endpoint. A bug there would let an attacker subscribe to channels they shouldn't. Mitigations: explicit channel-shape allow-list (no generic signing), workspace-membership query before signing, 403 on negative cases. Tests cover the allow-list explicitly.
- **No presence info yet**. A natural follow-up is `presence-board-<id>` channels with member metadata (who's currently viewing the board). That's a separate ADR (out of scope for v0.5.11 — closing T-01 is the structural priority).
- **Prisma round-trip per subscribe**. Each browser tab subscribing to a board triggers an auth POST + a Prisma query. The cost is amortised by tab-level subscription persistence (not per-broadcast), and the existing `requireWorkspaceMember` REST endpoints already do the same query shape on every board API call. Negligible at portfolio scale.

## Alternatives

- **Presence channels (`presence-board-<id>`) instead of private**. Rejected for v0.5.11 because the existing UI doesn't display per-user presence; adding presence semantics without a feature consuming them is over-engineering. Re-evaluate when a "who's online" UI feature lands.
- **Per-user private channels (`private-user-<userId>`) for notifications**. Rejected as out-of-scope; this ADR only covers board fanout. Notification delivery currently uses HTTP polling (`/api/notifications` every 30 s); a future ADR could migrate that to a per-user private channel, but the polling approach is acceptable at portfolio scale.
- **Drop boardId from the channel name and broadcast to a single `private-boards` channel filtered client-side**. Rejected because it would require client-side filtering of every event for every connected tab, which both wastes browser CPU on irrelevant events and weakens the access-control story (the "filtering" is advisory, not enforced).
- **Ship without a unit test for the channel helpers**. Rejected — the helpers are the single contract surface for three independent files, and silent drift (server emits to A, client subscribes to B, auth allow-lists C) would produce a confusing failure mode (no realtime, no error). The 8 unit cases cost ~2 min runtime once and pin the contract permanently.

## Implementation status

Shipped in v0.5.11:

- `apps/collab/src/lib/pusher.ts` — refactored: `getPusherServer()` exported, `boardChannelName()` + `parseBoardChannel()` helpers, `broadcastBoard()` uses the helper
- `apps/collab/src/lib/pusher-client.ts` — `authEndpoint: "/api/pusher/auth"` configured
- `apps/collab/src/app/api/pusher/auth/route.ts` (new) — POST handler with the four-step gate (session / parse / channel allow-list / membership)
- `apps/collab/src/app/w/[slug]/b/[boardId]/BoardClient.tsx` — uses `boardChannelName()` for subscribe + unsubscribe
- `apps/collab/src/lib/pusher.test.ts` (new) — 8 Vitest cases pinning the helpers
- `docs/security/threat-model.md` — T-01 status changed from "honest scope note" to "resolved (ADR-0060)"
- This ADR
- `docs/adr/README.md` — index entry
- `CHANGELOG.md` — v0.5.11 entry
- `docs/adr/_claims.json` — ADR-0060 entries (auth route exists; private- prefix in pusher.ts; T-01 line in attestation deferred list updated)
- README + portfolio-lp + page.tsx Stat block — ADR count 58 → 59; Vitest 216 → 224 (174 collab + 50 knowledge); route count 38 → 39

### Verification

```bash
# Helper round-trip pinned
node -e "import('./apps/collab/src/lib/pusher.ts').then(m => console.log(m.boardChannelName('abc') === 'private-board-abc'))"

# Auth route exists
test -f apps/collab/src/app/api/pusher/auth/route.ts

# Allow-list is regex-anchored (smuggling defence)
node scripts/check-doc-drift.mjs        # → 0 failures
node scripts/check-adr-claims.mjs       # → 26/26 pass + ADR-0060 PR-time integrity
node scripts/check-adr-refs.mjs         # → 0 dangling
pnpm --filter collab test               # → 174 passed (was 166, +8 pusher.test.ts)
```

Live deploy verification (post-merge): subscribe to `private-board-<id>` from a signed-in browser session → 200 from `/api/pusher/auth` + realtime events flow. Subscribe from a non-member session → 403 from `/api/pusher/auth` + no events delivered.
