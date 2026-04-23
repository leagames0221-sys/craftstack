# ADR-0026: Token-hashed invitations with email-bound accept

- Status: Accepted
- Date: 2026-04-23
- Tags: security, invitations, tokens

## Context

Workspace invitations carry a URL with an unguessable token. Two obvious failure modes: the plaintext token living in the database (one SQL leak compromises every pending invite) and URL sharing (Alice forwards the email to Bob who joins the workspace as Alice's invitee). Both are realistic incidents for a small SaaS.

## Decision

Store only `SHA-256(token)` in the database; the plaintext token exists only in the outgoing email body and the resulting URL. Additionally, the accept endpoint requires the signed-in email to match the invitation's target email — the token is necessary but not sufficient.

## Consequences

Positive:

- A stolen database dump yields no usable tokens; an attacker would still need the email's plaintext side.
- Link sharing is defeated at the bind step: Bob signing in with `bob@example.com` on `alice@example.com`'s invite fails the email match.
- Revocation is cheap: delete (or flag) the Invitation row; no "token blocklist" needed.

Negative:

- Invitation emails are single-use: if the user loses the email, they need a fresh invite. We considered this acceptable (admins can re-send).
- The email-match rule forces the invitee to sign in / sign up with the exact address — prevents "just use any Google account you have." We chose this explicitness; it's also clearer UX.

## Alternatives Considered

- **Plaintext tokens in DB with expiry + single-use flag** — rejected; expiry doesn't help the DB-leak case.
- **Signed JWT invitations (stateless)** — rejected; revocation becomes a pain (need a blocklist anyway).
- **Token without email match** — rejected; link forwarding is too easy a mistake to make.
