# ADR-0020: Prompt Git-managed with SHA256 tracking

- Status: Accepted
- Date: 2026-04-22
- Tags: ai, quality

## Context

Prompt edits silently move model output. Without traceability, we cannot correlate a quality regression with the prompt change that caused it.

## Decision

Store every production prompt under `apps/knowledge/src/server/ai/prompts/*.md` with frontmatter (`id`, `version`). A build-time script computes SHA256 of each file into `registry.json`. Every `Message` record stores `promptId` and `promptHash`, tying responses to the exact prompt text that produced them.

## Consequences

Positive:

- Git diff shows exactly what changed between prompt versions
- Eval runs can segment metrics by prompt hash
- Supports A/B experiments without schema change

Negative:

- One more thing to keep in sync between code and database
