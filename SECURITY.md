# Security policy

See also: [**COST_SAFETY.md**](COST_SAFETY.md) for the threat model and mitigations around runaway-cost attacks (bandwidth, LLM-invocation, email-quota abuse).

## Supported versions

This is a solo portfolio project. Only the `main` branch is supported. Please exercise `main`'s current HEAD when reporting.

## Reporting a vulnerability

If you discover a security issue in the code, the infrastructure, or the live demo at <https://craftstack-collab.vercel.app>, please do **not** open a public issue.

Instead, open a private security advisory on GitHub:

<https://github.com/leagames0221-sys/craftstack/security/advisories/new>

Include:

- A short description of the issue
- Reproduction steps or a proof-of-concept
- The component affected (e.g. Auth.js callback, API route handler, migration SQL)
- Any mitigation ideas you have

I aim to acknowledge reports within 72 hours and to publish a fix or a detailed plan within 14 days. If the issue is high-severity and requires production action (rotating secrets, revoking tokens, pulling the deployment), I will act immediately.

## Scope

In scope:

- Code in this repository
- The Vercel deployment of Boardly
- The Neon database schema and migrations
- Any future Fly.io machine once realtime ships

Out of scope:

- Vulnerabilities in upstream dependencies (please report those to the respective maintainers; I will update once they publish a fix)
- Social engineering against me or other contributors
- Physical attacks on Vercel, Neon, or Upstash infrastructure

## Thanks

Security researchers and friendly observers who report issues responsibly are acknowledged in release notes (with permission).
