import { describe, expect, it, vi } from "vitest";

import { retryFetch, type FetchLike } from "./eval-retry-fetch";

const noSleep = (_ms: number) => Promise.resolve();
const silentLog = (_msg: string) => {};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("retryFetch", () => {
  it("returns the first response when it succeeds (no retry, no log)", async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const log = vi.fn();
    const res = await retryFetch(fetchImpl, "http://x", undefined, {
      sleep: noSleep,
      log,
    });

    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
  });

  it("retries on 500, succeeds on the second attempt, returns the success", async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse(500, { code: "transient" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const res = await retryFetch(fetchImpl, "http://x", undefined, {
      sleep: noSleep,
      log: silentLog,
    });

    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries on Prisma cold-start body marker even with a non-standard status, then succeeds", async () => {
    // The actual Vercel response shape that triggered the 2026-04-25
    // first-night failure: 500 with a body containing the
    // "Unable to start a transaction" Prisma marker.
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(
        jsonResponse(500, {
          code: "Transaction API error: Unable to start a transaction in the given time.",
          message: "Ingest failed",
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const res = await retryFetch(fetchImpl, "http://x", undefined, {
      attempts: 3,
      backoffMs: [10, 20],
      sleep: noSleep,
      log: silentLog,
    });

    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("returns the final response when all attempts fail with retryable status", async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValue(jsonResponse(503, { code: "still down" }));

    const res = await retryFetch(fetchImpl, "http://x", undefined, {
      attempts: 3,
      backoffMs: [10, 20],
      sleep: noSleep,
      log: silentLog,
    });

    // The caller inspects the final response — retryFetch returns it
    // rather than throwing, so the existing `if (!res.ok) throw …`
    // guard in the eval script still surfaces the user-readable error.
    expect(res.status).toBe(503);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does NOT retry on a 4xx (non-transient) status", async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValue(jsonResponse(400, { code: "bad request" }));

    const res = await retryFetch(fetchImpl, "http://x", undefined, {
      attempts: 3,
      backoffMs: [10, 20],
      sleep: noSleep,
      log: silentLog,
    });

    expect(res.status).toBe(400);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries on network error, then resolves with success", async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const res = await retryFetch(fetchImpl, "http://x", undefined, {
      attempts: 3,
      backoffMs: [10, 20],
      sleep: noSleep,
      log: silentLog,
    });

    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rethrows the last error when every attempt throws", async () => {
    const err = new TypeError("fetch failed");
    const fetchImpl = vi.fn<FetchLike>().mockRejectedValue(err);

    await expect(
      retryFetch(fetchImpl, "http://x", undefined, {
        attempts: 3,
        backoffMs: [10, 20],
        sleep: noSleep,
        log: silentLog,
      }),
    ).rejects.toBe(err);

    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("emits a log breadcrumb for each retry, including the label and status", async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse(502, { code: "bad gateway" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const log = vi.fn();
    await retryFetch(fetchImpl, "http://x", undefined, {
      attempts: 3,
      backoffMs: [10, 20],
      sleep: noSleep,
      log,
      label: 'ingest "Knowlex RAG architecture"',
    });

    expect(log).toHaveBeenCalledTimes(1);
    const breadcrumb = log.mock.calls[0][0] as string;
    expect(breadcrumb).toContain("[retryFetch]");
    expect(breadcrumb).toContain('ingest "Knowlex RAG architecture"');
    expect(breadcrumb).toContain("502");
    expect(breadcrumb).toContain("Neon cold-start");
  });
});
