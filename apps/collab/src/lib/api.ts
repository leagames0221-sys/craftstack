import { NextResponse } from "next/server";
import { ApiError } from "./errors";

/**
 * Wrap a Route Handler so thrown ApiErrors become standardized JSON 4xx/5xx.
 * Unexpected errors become a logged 500.
 */
export function handle<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json(err.toJSON(), { status: err.status });
      }
      console.error("[api] unhandled error", err);
      return NextResponse.json(
        { code: "INTERNAL_ERROR", message: "Internal server error" },
        { status: 500 },
      );
    }
  };
}

export function json<T>(data: T, init?: ResponseInit): Response {
  return NextResponse.json(data, init);
}
