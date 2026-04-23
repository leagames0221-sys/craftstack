#!/usr/bin/env node
/**
 * Compose the demo video.
 *
 * Inputs:
 *   - scripts/demo/input.mp4 (silent screen recording the user captured)
 *   - scripts/demo/out/line-*.wav (TTS output)
 *   - scripts/demo/out/captions.srt (optional subtitle overlay)
 *   - scripts/demo/narration.json (source of truth for timestamps)
 *
 * Output:
 *   - scripts/demo/out/final.mp4
 *
 * Pipeline:
 *   1. Build an ffmpeg filtergraph that delays each wav by its `at` timestamp
 *      then amix()es them together into a single audio track.
 *   2. Mux the silent video + mixed audio (+ optional subtitles) into the
 *      output mp4.
 *
 * Requires ffmpeg on PATH. Install via `choco install ffmpeg` (Windows),
 * `brew install ffmpeg` (macOS), or `apt install ffmpeg` (Ubuntu).
 */

import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const NARRATION = resolve(ROOT, "scripts/demo/narration.json");
const INPUT_VIDEO = resolve(ROOT, "scripts/demo/input.mp4");
const OUT_DIR = resolve(ROOT, "scripts/demo/out");
const OUT_VIDEO = resolve(OUT_DIR, "final.mp4");
const CAPTIONS = resolve(OUT_DIR, "captions.srt");

async function main() {
  await requireFile(INPUT_VIDEO, [
    "Put the silent screen recording at scripts/demo/input.mp4.",
    "Loom -> Share -> Download, or use OBS / Windows Game Bar to export a silent mp4.",
  ]);
  await requireFile(NARRATION, [
    "scripts/demo/narration.json should exist — it ships with the repo.",
  ]);

  const script = JSON.parse(await readFile(NARRATION, "utf8"));
  const wavPaths = script.lines.map((_, i) =>
    resolve(OUT_DIR, `line-${String(i).padStart(3, "0")}.wav`),
  );
  for (const w of wavPaths) {
    await requireFile(w, [
      "Run `pnpm demo:tts` first to generate wavs from narration.json.",
    ]);
  }

  const wantsSubtitles = process.env.DEMO_SUBTITLES === "1";
  if (wantsSubtitles) await requireFile(CAPTIONS, []);

  // Build the filter_complex string. Pattern per line:
  //   [N:a]adelay=MS|MS[aN]   <- delay in ms, duplicated for stereo
  // Then:
  //   [a0][a1]...[aK]amix=inputs=K:dropout_transition=0[mixed]
  const filterParts = [];
  script.lines.forEach((line, i) => {
    const ms = Math.round(line.at * 1000);
    // Input index 0 is the video; wav inputs start at 1.
    const src = i + 1;
    filterParts.push(`[${src}:a]adelay=${ms}|${ms}[a${i}]`);
  });
  const mixIns = script.lines.map((_, i) => `[a${i}]`).join("");
  filterParts.push(
    `${mixIns}amix=inputs=${script.lines.length}:dropout_transition=0:normalize=0[mixed]`,
  );

  const args = [
    "-y",
    "-i",
    INPUT_VIDEO,
    ...wavPaths.flatMap((p) => ["-i", p]),
    "-filter_complex",
    filterParts.join(";"),
    "-map",
    "0:v",
    "-map",
    "[mixed]",
    "-c:v",
    wantsSubtitles ? "libx264" : "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-shortest",
  ];

  if (wantsSubtitles) {
    // Burn the SRT into the video track. This re-encodes video (hence
    // libx264 above) but keeps a single-file deliverable for sharing.
    args.splice(args.indexOf("-c:v"), 0, "-vf", `subtitles=${CAPTIONS.replace(/\\/g, "/").replace(/:/g, "\\:")}`);
  }

  args.push(OUT_VIDEO);

  console.log("[compose] running: ffmpeg", args.join(" "));
  const code = await run("ffmpeg", args);
  if (code !== 0) {
    console.error(`[compose] ffmpeg exited ${code}`);
    process.exit(code);
  }
  console.log(`[compose] wrote ${OUT_VIDEO}`);
}

function run(cmd, args) {
  return new Promise((resolvePromise) => {
    const p = spawn(cmd, args, { stdio: "inherit" });
    p.on("exit", (code) => resolvePromise(code ?? 1));
    p.on("error", (err) => {
      console.error(`[compose] failed to spawn ${cmd}: ${err.message}`);
      resolvePromise(127);
    });
  });
}

async function requireFile(path, hints) {
  try {
    await access(path);
  } catch {
    console.error(`[compose] missing file: ${path}`);
    for (const h of hints) console.error(`  - ${h}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[compose] failed:", err.message);
  process.exit(1);
});
