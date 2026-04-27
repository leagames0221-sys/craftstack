# ADR-0013: Faithfulness check for RAG grounding

- Status: **Accepted (planned)** — design-phase decision; **deferred for v0.5.2** per [ADR-0039](0039-knowlex-mvp-scope.md) MVP scope. Hallucination defence currently relies on three other layers (citation requirement, golden-set substring scoring, adversarial refusal questions) per [ADR-0049 § 7th arc](0049-rag-eval-client-retry-contract.md)
- Date: 2026-04-22
- Tags: ai, quality

> **Implementation status (v0.5.2)**: NLI-mode Faithfulness check not implemented. The shipped hallucination defence is: (1) system-prompt-required inline citations `[1]` `[2]` matched to retrieved chunks; (2) nightly RAG eval cron with substring-OR + AND-proper-noun scoring per ADR-0049 § 7th arc; (3) 3 adversarial golden-set questions verifying refusal-when-out-of-corpus. NLI Faithfulness remains on the roadmap once the corpus and traffic justify the +1.5s per response.

## Context

RAG responses can still hallucinate — adding plausible-sounding content not supported by retrieved chunks. In business use this is unacceptable.

## Decision

After generation, split the response into sentences. For each sentence, ask Gemini Flash in zero-shot NLI mode whether the cited chunks entail it. Mark unsupported sentences as "unverified" in the UI and record a per-sentence faithfulness score.

## Consequences

Positive:

- Hallucinations become visible rather than silent
- Faithfulness is a metric the CI gate can enforce (see ADR-0015)
- Users can trust the green checkmarks and scrutinize the yellow ones

Negative:

- Extra ~1.5s of LLM work after streaming ends
- Flash can produce false negatives; threshold needs periodic tuning

## Alternatives

- No check: rejected — unacceptable for business use
- Full Ragas pipeline: partial — richer metrics than free tier affords
