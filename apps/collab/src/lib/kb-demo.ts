/**
 * Deterministic "demo mode" answer generator used when GEMINI_API_KEY is
 * not configured. The goal is to keep the playground UX demonstrable — a
 * recruiter should be able to click Ask and see a streamed answer even
 * when no env var has been set. The answer makes demo mode explicit so we
 * are not pretending to be the real model.
 */

const DEMO_BANNER = `[Demo mode — the GEMINI_API_KEY env var is not set, so this response is a deterministic canned answer. The plumbing, streaming, rate limiting, abort-cancel and body validation are all real. Set a free Google AI Studio key to switch this page to live Gemini 2.0 Flash.]`;

/**
 * Pull a short extracted answer out of the pasted context using plain
 * substring heuristics — no model, no embedding. Good enough for a demo:
 * if the context literally contains the answer to the question, we'll
 * usually find it. Otherwise we fall back to the "couldn't find it" line
 * that the real system prompt would produce, keeping the UX shape
 * consistent between demo and live modes.
 */
export function buildDemoAnswer(context: string, question: string): string {
  const ctx = context.trim();
  const q = question.trim();
  const snippet = extractRelevantSnippet(ctx, q);

  const body = snippet
    ? `Based on the passage you pasted:\n\n"${snippet}"\n\nIn plain terms, this addresses "${q}". When the live model is enabled this page will instead return a fully generated Gemini 2.0 Flash answer streamed token-by-token — rather than this extraction.`
    : `The passage you pasted does not appear to directly answer "${q}". A live Gemini 2.0 Flash model would say the same thing more confidently; this demo fallback uses plain keyword matching, not semantic understanding.`;

  return `${DEMO_BANNER}\n\n${body}`;
}

function extractRelevantSnippet(
  context: string,
  question: string,
): string | null {
  const stopwords = new Set([
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "can",
    "do",
    "does",
    "for",
    "from",
    "has",
    "have",
    "how",
    "i",
    "in",
    "is",
    "it",
    "its",
    "not",
    "of",
    "on",
    "or",
    "that",
    "the",
    "this",
    "to",
    "was",
    "were",
    "what",
    "when",
    "where",
    "who",
    "why",
    "will",
    "with",
    "you",
    "your",
  ]);
  const keywords = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopwords.has(w));

  if (keywords.length === 0) return null;

  const sentences = context
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  let bestScore = 0;
  let bestSentence: string | null = null;
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    let score = 0;
    for (const kw of keywords) if (lower.includes(kw)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      bestSentence = sentence;
    }
  }

  if (!bestSentence || bestScore === 0) return null;
  if (bestSentence.length > 320) {
    return bestSentence.slice(0, 320).trim() + "…";
  }
  return bestSentence;
}

/**
 * Streams a string to a ReadableStream chunk-by-chunk so the client sees
 * realistic incremental rendering instead of a one-shot paste. The timing
 * is tuned to feel like the real model without being irritatingly slow.
 */
export function streamStringAsResponse(
  text: string,
  {
    chunkSize = 6,
    delayMs = 18,
  }: { chunkSize?: number; delayMs?: number } = {},
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for (let i = 0; i < text.length; i += chunkSize) {
        controller.enqueue(encoder.encode(text.slice(i, i + chunkSize)));
        await new Promise((r) => setTimeout(r, delayMs));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-playground-mode": "demo",
      "cache-control": "no-store",
    },
  });
}
