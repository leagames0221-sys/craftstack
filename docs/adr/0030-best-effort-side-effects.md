# ADR-0030: Best-effort side effects separated from business writes

- Status: Accepted
- Date: 2026-04-23
- Tags: reliability, realtime, notifications

## Context

A card creation fires off a flurry of side effects: an activity log row, a Pusher broadcast to every connected client on that board, a Resend email for invitations, a notification row for each mentioned or assigned user. None of these are the user's _goal_ — the goal is "save my card." If the Resend API has a blip, the user should not see a 500.

## Decision

Every side effect is wrapped in a try/catch that logs and swallows failures. The transactional piece is the business write; the fanout is cosmetic. Callers write the pattern as: `await prisma.card.create(...); await logActivity(...).catch(noop); await broadcast(...).catch(noop);`.

## Consequences

Positive:

- Partial outages in third-party services do not break the product.
- Running locally without Pusher / Resend credentials is a clean degrade — nothing breaks, console log shows what would have been sent.
- Tests can stub the side effects to no-ops and still exercise the real business path.

Negative:

- Silent failure is a real debugging hazard. We mitigate by logging at `warn` level, not `debug`, and by making failure modes observable in notifications metrics.
- A side effect that _should_ be transactional (e.g. a payment receipt in a hypothetical future) must not use this pattern; it needs an outbox. The README makes the distinction explicit.

## Alternatives Considered

- **Transactional outbox** — rejected for now as operational overhead for a kanban; worth it if we ever need exactly-once email delivery.
- **Synchronous, fail-hard** — rejected; a Pusher outage would break every card create.
- **Queue with retries** (SQS / BullMQ) — rejected; a worker runtime and a queue broker are both disproportionate at this stage and would leave the free-tier budget.
