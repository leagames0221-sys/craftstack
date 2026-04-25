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

  it("retries on 429 honouring the Retry-After header (delta-seconds form)", async () => {
    // Knowlex's per-IP limiter (kb-rate-limit.ts) emits Retry-After
    // as integer seconds — the realistic shape for ADR-0049.
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: "RATE_LIMIT_EXCEEDED",
            message: "Too many questions from this address.",
          }),
          {
            status: 429,
            headers: {
              "content-type": "application/json",
              "retry-after": "12",
            },
          },
        ),
      )
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const sleeps: number[] = [];
    const log = vi.fn();
    const res = await retryFetch(fetchImpl, "http://x", undefined, {
      attempts: 3,
      backoffMs: [1, 1],
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
      log,
    });

    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    // The wait should be the header value (12 s = 12000 ms), not the
    // default `backoffMs[0]` of 1.
    expect(sleeps).toEqual([12_000]);
    const breadcrumb = log.mock.calls[0][0] as string;
    expect(breadcrumb).toContain("429");
    expect(breadcrumb).toContain("12000ms");
    expect(breadcrumb).toContain("Retry-After header");
  });

  it("caps an excessive Retry-After at maxRetryAfterMs", async () => {
    // A pathological 600-second Retry-After header (e.g. CDN
    // misroute) should be capped — the workflow's `timeout-minutes:
    // 15` means we can't afford 10-minute single-call waits.
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(
        new Response("ratelimited", {
          status: 429,
          headers: { "retry-after": "600" },
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const sleeps: number[] = [];
    const res = await retryFetch(fetchImpl, "http://x", undefined, {
      attempts: 3,
      backoffMs: [1, 1],
      maxRetryAfterMs: 90_000,
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
      log: silentLog,
    });

    expect(res.status).toBe(200);
    expect(sleeps).toEqual([90_000]);
  });

  it("falls back to default backoff when 429 has no Retry-After header", async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(new Response("ratelimited", { status: 429 }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const sleeps: number[] = [];
    const log = vi.fn();
    const res = await retryFetch(fetchImpl, "http://x", undefined, {
      attempts: 3,
      backoffMs: [333, 666],
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
      log,
    });

    expect(res.status).toBe(200);
    expect(sleeps).toEqual([333]);
    const breadcrumb = log.mock.calls[0][0] as string;
    expect(breadcrumb).toContain("no Retry-After header");
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
