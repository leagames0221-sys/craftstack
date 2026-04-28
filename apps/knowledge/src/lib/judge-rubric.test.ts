import { describe, expect, it } from "vitest";
import {
  aggregateJudgeScores,
  buildJudgePrompt,
  DEFAULT_JUDGE_MODEL,
  parseJudgeResponse,
  RUBRIC_MAX,
  RUBRIC_MIN,
} from "./judge-rubric";

describe("buildJudgePrompt", () => {
  it("includes the question, expected document title, corpus excerpt, and model answer", () => {
    const p = buildJudgePrompt({
      question: "What index does Knowlex use?",
      answer: "Knowlex uses HNSW for cosine kNN.",
      expectedDocumentTitle: "Knowlex RAG architecture",
      corpusExcerpt: "Knowlex stores embeddings in pgvector with HNSW index.",
    });
    expect(p).toContain("What index does Knowlex use?");
    expect(p).toContain("Knowlex uses HNSW for cosine kNN.");
    expect(p).toContain("Knowlex RAG architecture");
    expect(p).toContain("HNSW index");
  });

  it("truncates corpus excerpts longer than 1500 chars to defend against future golden expansion", () => {
    const long = "x".repeat(2000);
    const p = buildJudgePrompt({
      question: "q",
      answer: "a",
      expectedDocumentTitle: "t",
      corpusExcerpt: long,
    });
    expect(p).toContain("...[truncated]");
    // The actual text inside the prompt should be at most ~1500 + suffix
    const corpusBlock = p.match(/"""([\s\S]*?)"""/);
    expect(corpusBlock).not.toBeNull();
    expect(corpusBlock![1].length).toBeLessThan(1600);
  });

  it("emits 0-3 rubric scale + JSON output instruction", () => {
    const p = buildJudgePrompt({
      question: "q",
      answer: "a",
      expectedDocumentTitle: "t",
      corpusExcerpt: "c",
    });
    expect(p).toContain("0-3");
    expect(p).toContain("3 = correct, fully grounded");
    expect(p).toContain("0 = wrong / hallucinated");
    expect(p).toContain('"score"');
  });
});

describe("parseJudgeResponse", () => {
  it("extracts a clean JSON-only response", () => {
    const got = parseJudgeResponse(
      '{"score": 3, "reasoning": "fully grounded"}',
    );
    expect(got.score).toBe(3);
    expect(got.reasoning).toBe("fully grounded");
  });

  it("handles score as a quoted string (judge sometimes does this)", () => {
    const got = parseJudgeResponse('{"score": "2", "reasoning": "partial"}');
    expect(got.score).toBe(2);
    expect(got.reasoning).toBe("partial");
  });

  it("strips ```json code fences before parsing", () => {
    const got = parseJudgeResponse(
      '```json\n{"score": 1, "reasoning": "hedges"}\n```',
    );
    expect(got.score).toBe(1);
    expect(got.reasoning).toBe("hedges");
  });

  it("tolerates trailing prose after the JSON object", () => {
    const got = parseJudgeResponse(
      '{"score": 0, "reasoning": "hallucinated"}\n\nNote: the answer cited a different doc.',
    );
    expect(got.score).toBe(0);
    expect(got.reasoning).toBe("hallucinated");
  });

  it("returns null score when the response is unparseable (does not silently penalise)", () => {
    const got = parseJudgeResponse("Yeah, looks fine to me.");
    expect(got.score).toBeNull();
    expect(got.reasoning).toContain("unparseable");
  });

  it("returns null score for out-of-range integers (defends rubric scale invariant)", () => {
    const got = parseJudgeResponse('{"score": 7, "reasoning": "way too high"}');
    expect(got.score).toBeNull();
    expect(got.reasoning).toContain("out-of-range");
  });

  it("returns null score for negative integers", () => {
    const got = parseJudgeResponse('{"score": -1, "reasoning": "minus"}');
    expect(got.score).toBeNull();
  });

  it("falls back to '(no reasoning provided)' when reasoning field is omitted", () => {
    const got = parseJudgeResponse('{"score": 3}');
    expect(got.score).toBe(3);
    expect(got.reasoning).toBe("(no reasoning provided)");
  });

  it("accepts the full RUBRIC_MIN..RUBRIC_MAX integer range", () => {
    for (let i = RUBRIC_MIN; i <= RUBRIC_MAX; i++) {
      const got = parseJudgeResponse(`{"score": ${i}}`);
      expect(got.score).toBe(i);
    }
  });
});

describe("aggregateJudgeScores", () => {
  it("computes mean from all available scores", () => {
    const got = aggregateJudgeScores([3, 2, 2, 1]);
    expect(got.meanScore).toBe(2);
    expect(got.total).toBe(4);
    expect(got.available).toBe(4);
  });

  it("excludes nulls from the denominator (judge unavailable does not silently lower the mean)", () => {
    const got = aggregateJudgeScores([3, null, 3, 3]);
    expect(got.meanScore).toBe(3);
    expect(got.total).toBe(4);
    expect(got.available).toBe(3);
  });

  it("returns null mean when every score is null", () => {
    const got = aggregateJudgeScores([null, null, null]);
    expect(got.meanScore).toBeNull();
    expect(got.total).toBe(3);
    expect(got.available).toBe(0);
  });

  it("returns null mean for an empty input", () => {
    const got = aggregateJudgeScores([]);
    expect(got.meanScore).toBeNull();
    expect(got.total).toBe(0);
    expect(got.available).toBe(0);
  });
});

describe("DEFAULT_JUDGE_MODEL", () => {
  it("targets a stronger model than the generator (gemini-2.5-pro vs gemini-2.5-flash)", () => {
    // The whole point of LLM-as-judge is the judge is meaningfully
    // stronger than the generator. If a future ratchet ever switches
    // the default to a weaker model, this test fails so the trade-off
    // is named explicitly in the change.
    expect(DEFAULT_JUDGE_MODEL).toBe("gemini-2.5-pro");
  });
});
