import { describe, expect, it } from "vitest";
import { buildDemoAnswer } from "./kb-demo";

describe("buildDemoAnswer", () => {
  const context = `Boardly has 137 Vitest unit tests and 11 Playwright smoke
scenarios. It uses Prisma 7 for its data layer and Pusher Channels for
realtime fanout.`;

  it("includes the demo banner so users know the response is canned", () => {
    const out = buildDemoAnswer(context, "How many tests does Boardly have?");
    expect(out).toMatch(/Demo mode/i);
    expect(out).toMatch(/GEMINI_API_KEY/);
  });

  it("extracts a relevant sentence when the context contains one", () => {
    const out = buildDemoAnswer(
      context,
      "How many Vitest tests does Boardly have?",
    );
    expect(out).toMatch(/137/);
    expect(out).toMatch(/Vitest/i);
  });

  it("falls back to a graceful 'not found' line when no sentence matches", () => {
    const out = buildDemoAnswer(context, "What color is the shop front?");
    expect(out).toMatch(/does not appear to directly answer/i);
  });

  it("ignores short stopwords when scoring keywords", () => {
    const out = buildDemoAnswer(context, "What is the quantity?");
    expect(out).toMatch(/does not appear/i);
  });
});
