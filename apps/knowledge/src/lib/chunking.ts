/**
 * Token-agnostic chunker for MVP retrieval.
 *
 * Splits pasted text into roughly fixed-size, paragraph-aware chunks so
 * the Gemini embedder sees coherent windows rather than arbitrary byte
 * slices. The chunk size and overlap are tuned for text-embedding-004:
 * ~512 chars ≈ 128 tokens, which comfortably fits the model and gives
 * 4-8 hits in a 4k-char document. `overlap` preserves context across
 * chunk boundaries so a sentence spanning the cut isn't orphaned.
 *
 * "tokens" here is a char/4 approximation — good enough for the MVP
 * upper bound. If we later need exact GPT-tokenizer counts we'd
 * depend on `tiktoken` but that adds 2MB; not worth it at this scale.
 */

export type Chunk = {
  ordinal: number;
  content: string;
  tokenCount: number;
};

export type ChunkOptions = {
  /** Target max characters per chunk. */
  maxChars?: number;
  /** Overlap between adjacent chunks, in characters. */
  overlap?: number;
};

const DEFAULT_MAX_CHARS = 512;
const DEFAULT_OVERLAP = 80;

/**
 * Cheap tokens ≈ ceil(chars / 4). Close enough to upper-bound the
 * Gemini embedder's 2048-token input window.
 */
export function approximateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function chunkText(text: string, opts: ChunkOptions = {}): Chunk[] {
  const maxChars = clampInt(opts.maxChars ?? DEFAULT_MAX_CHARS, 64, 4000);
  const overlap = clampInt(opts.overlap ?? DEFAULT_OVERLAP, 0, maxChars - 1);

  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (normalized.length === 0) return [];

  // Short input → one chunk, don't bother splitting.
  if (normalized.length <= maxChars) {
    return [
      {
        ordinal: 0,
        content: normalized,
        tokenCount: approximateTokens(normalized),
      },
    ];
  }

  // Split on paragraph boundaries first so chunks have natural shape.
  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const out: Chunk[] = [];
  let current = "";
  for (const para of paragraphs) {
    if (current.length === 0) {
      current = para;
      continue;
    }
    const candidate = `${current}\n\n${para}`;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      pushWithSplit(current, out, maxChars, overlap);
      current = para;
    }
  }
  if (current.length > 0) pushWithSplit(current, out, maxChars, overlap);

  // Re-number after any fallback splits.
  return out.map((c, i) => ({ ...c, ordinal: i }));
}

/**
 * Append `text` to `out`. If the text is still over `maxChars` (a single
 * paragraph longer than the chunk size), hard-slice it with overlap so
 * the embedder never sees an over-limit window.
 */
function pushWithSplit(
  text: string,
  out: Chunk[],
  maxChars: number,
  overlap: number,
) {
  if (text.length <= maxChars) {
    out.push({
      ordinal: out.length,
      content: text,
      tokenCount: approximateTokens(text),
    });
    return;
  }
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    const slice = text.slice(start, end);
    out.push({
      ordinal: out.length,
      content: slice,
      tokenCount: approximateTokens(slice),
    });
    if (end === text.length) break;
    start = end - overlap;
  }
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}
