#!/usr/bin/env node
/**
 * Bridge step between the Playwright recording and the TTS pipeline.
 *
 * Playwright writes the recording as `test-results-demo/**&#47;video.webm`. This
 * script locates the most recent one, trims/converts it to mp4, and drops
 * it at `scripts/demo/input.mp4` where `demo-compose.mjs` expects to find
 * it.
 *
 * The trim is intentional: Playwright's recording starts slightly before
 * the test and ends slightly after, leaving dead frames on both ends. We
 * also cap the output at 95 seconds since the narration maxes at ~90s.
 */

import { spawn } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { resolve, relative } from "node:path";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..", "..");
const SEARCH_ROOT = resolve(ROOT, "apps/collab/test-results-demo");
const OUT = resolve(ROOT, "scripts/demo/input.mp4");

const MAX_DURATION_SEC = 95;
const TRIM_HEAD_SEC = 0.3;

async function main() {
  const webm = await findLatestWebm(SEARCH_ROOT);
  if (!webm) {
    console.error(
      `[convert] no video.webm found under ${relative(ROOT, SEARCH_ROOT)}.`,
    );
    console.error("  Run `pnpm --filter collab demo:record` first.");
    process.exit(1);
  }
  console.log(`[convert] source: ${relative(ROOT, webm)}`);

  const code = await run("ffmpeg", [
    "-y",
    "-ss",
    String(TRIM_HEAD_SEC),
    "-i",
    webm,
    "-t",
    String(MAX_DURATION_SEC),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-an", // drop the (silent) audio track
    OUT,
  ]);
  if (code !== 0) {
    console.error(`[convert] ffmpeg exited ${code}`);
    process.exit(code);
  }
  console.log(`[convert] wrote ${relative(ROOT, OUT)}`);
}

async function findLatestWebm(dir) {
  let newest = null;
  async function walk(d) {
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = resolve(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile() && e.name.endsWith(".webm")) {
        const s = await stat(p);
        if (!newest || s.mtimeMs > newest.mtime) {
          newest = { path: p, mtime: s.mtimeMs };
        }
      }
    }
  }
  await walk(dir);
  return newest?.path ?? null;
}

function run(cmd, args) {
  return new Promise((res) => {
    const p = spawn(cmd, args, { stdio: "inherit" });
    p.on("exit", (code) => res(code ?? 1));
    p.on("error", (err) => {
      console.error(`[convert] failed to spawn ${cmd}: ${err.message}`);
      res(127);
    });
  });
}

main().catch((err) => {
  console.error("[convert] failed:", err.message);
  process.exit(1);
});
