import { describe, expect, it } from "vitest";

import { buildUserMessage } from "./rag-prompt";

const mkChunk = (ordinal: number, title: string, content: string) => ({
  chunkId: `chk_${ordinal}`,
  documentId: `doc_${title}`,
  documentTitle: title,
  ordinal,
  content,
  distance: 0.1 * ordinal,
});

describe("buildUserMessage", () => {
  it("returns a no-hits context when nothing was retrieved", () => {
    const msg = buildUserMessage("What is craftstack?", []);
    expect(msg).toContain("no retrieval hits");
    expect(msg).toContain("Question: What is craftstack?");
  });

  it("numbers passages starting at 1 and includes the title + ordinal", () => {
    const msg = buildUserMessage("How many tests?", [
      mkChunk(0, "Boardly brief", "Boardly has 160 Vitest cases."),
      mkChunk(1, "Boardly brief", "CI runs on GitHub Actions."),
    ]);
    expect(msg).toContain("[1]");
    expect(msg).toContain("[2]");
    expect(msg).toContain('"Boardly brief" (chunk 0)');
    expect(msg).toContain('"Boardly brief" (chunk 1)');
    expect(msg).toContain("Boardly has 160 Vitest cases.");
  });

  it("puts the context block before the question", () => {
    const msg = buildUserMessage("Q?", [mkChunk(0, "T", "C")]);
    expect(msg.indexOf("<context>")).toBeLessThan(msg.indexOf("Question:"));
  });
});
