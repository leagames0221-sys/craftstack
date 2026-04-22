import { describe, expect, it } from "vitest";
import { dueStatus } from "./dnd-helpers";

const NOW = new Date("2026-04-23T10:00:00.000Z");

function iso(yyyyMmDd: string): string {
  return new Date(`${yyyyMmDd}T00:00:00.000Z`).toISOString();
}

describe("dueStatus", () => {
  it("returns 'none' for null", () => {
    expect(dueStatus(null, NOW)).toBe("none");
  });

  it("returns 'none' for garbage strings", () => {
    expect(dueStatus("not-a-date", NOW)).toBe("none");
  });

  it("classifies yesterday as overdue", () => {
    expect(dueStatus(iso("2026-04-22"), NOW)).toBe("overdue");
  });

  it("classifies today as today", () => {
    expect(dueStatus(iso("2026-04-23"), NOW)).toBe("today");
  });

  it("classifies tomorrow as soon", () => {
    expect(dueStatus(iso("2026-04-24"), NOW)).toBe("soon");
  });

  it("classifies day after tomorrow as soon", () => {
    expect(dueStatus(iso("2026-04-25"), NOW)).toBe("soon");
  });

  it("classifies 3+ days out as later", () => {
    expect(dueStatus(iso("2026-04-30"), NOW)).toBe("later");
  });

  it("is timezone-independent (UTC anchor)", () => {
    // Noon UTC vs. very early morning UTC of the same date must match.
    expect(dueStatus(iso("2026-04-23"), new Date("2026-04-23T00:00:01Z"))).toBe(
      "today",
    );
    expect(dueStatus(iso("2026-04-23"), new Date("2026-04-23T23:59:59Z"))).toBe(
      "today",
    );
  });
});
