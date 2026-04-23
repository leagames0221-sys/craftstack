# Knowlex demo video pipeline

Companion to [`../demo/README.md`](../demo/README.md). Same three-stage pipeline — capture → narrate → compose — just pointed at Knowlex instead of Boardly.

```bash
pnpm demo:knowlex:all
# equivalent to:
# pnpm demo:knowlex:record
# pnpm demo:knowlex:convert
# pnpm demo:knowlex:tts
# pnpm demo:knowlex:compose
```

Output: `scripts/demo-knowlex/out/final.mp4`. Upload to Loom and paste the URL into `README.md` (alongside the Boardly Loom).

## What each stage does

| Stage      | Command                     | Effect                                                                                                                                                                            |
| ---------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Record  | `pnpm demo:knowlex:record`  | Drives `apps/knowledge/tests/demo/record.spec.ts` headed at 1920×1080 against <https://craftstack-knowledge.vercel.app>. Writes `apps/knowledge/test-results-demo/**/video.webm`. |
| 2. Convert | `pnpm demo:knowlex:convert` | Finds the newest webm under `apps/knowledge/test-results-demo/`, trims dead frames, emits `scripts/demo-knowlex/input.mp4`.                                                       |
| 3. Narrate | `pnpm demo:knowlex:tts`     | Reads `scripts/demo-knowlex/narration.json`, produces one wav per line via VOICEVOX (default) or Azure Neural TTS into `scripts/demo-knowlex/out/`.                               |
| 4. Compose | `pnpm demo:knowlex:compose` | ffmpeg overlays the wavs at their timestamps onto the mp4 → `scripts/demo-knowlex/out/final.mp4`.                                                                                 |

The underlying Node scripts in `scripts/demo/` are shared; the Knowlex variants just set `DEMO_APP=knowledge` and `DEMO_DIR=scripts/demo-knowlex` before invoking them. Everything else — VOICEVOX setup, ffmpeg, subtitles via `DEMO_SUBTITLES=1`, running the VOICEVOX engine locally — works identically.

## Target against local dev

```bash
DEMO_BASE_URL=http://localhost:3001 pnpm demo:knowlex:record
```

## Editing the narration — don't overlap the cues

`narration.json` cues (`at` seconds) and the Playwright script's `waitForTimeout` values are a tight contract. If a line is longer than the gap to the next cue, ffmpeg's `amix` plays them on top of each other and the output is unlistenable.

Rough budget for VOICEVOX speaker=3 at `speedScale: 1.15`:

| Japanese chars | ≈ duration |
| -------------- | ---------- |
| 20             | ~3.4 s     |
| 30             | ~5.1 s     |
| 40             | ~6.8 s     |
| 50             | ~8.5 s     |

Target: `at[i+1] - at[i] >= estimated_duration(line[i]) + 2 s`. The +2 s cushion absorbs Playwright `slowMo` jitter and Vercel cold-start variance.

If you edit a line:

1. Eyeball the new character count against the table above.
2. Bump the next cue's `at` if needed.
3. Mirror any new dwell time in `apps/knowledge/tests/demo/record.spec.ts` so the video actually has content at each cue.
4. Re-run `pnpm demo:knowlex:tts && pnpm demo:knowlex:compose`.

The current script maxes at line 2 (~40 chars → ~6.8 s) between cues 6.0 and 14.0 — that's the tightest pair; everything else has ≥ 2.5 s headroom.

## Pre-requisites

Same as the Boardly pipeline (see the main demo README):

1. `@playwright/test` + `chromium` (`pnpm --filter knowledge exec playwright install --with-deps chromium`).
2. `ffmpeg` on PATH.
3. Either VOICEVOX engine running locally at `http://localhost:50021`, or `AZURE_TTS_KEY` + `AZURE_TTS_REGION` env vars set.
