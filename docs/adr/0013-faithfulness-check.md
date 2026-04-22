# ADR-0013: Faithfulness check for RAG grounding

- Status: Accepted
- Date: 2026-04-22
- Tags: ai, quality

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
