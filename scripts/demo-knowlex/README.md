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

## Editing the narration

Open `narration.json`. `at` is cue time in seconds; each line plays then. If a line is too long for its slot, either shorten the text or push the next cue's `at` later, then re-run `pnpm demo:knowlex:tts` + `pnpm demo:knowlex:compose`.

## Pre-requisites

Same as the Boardly pipeline (see the main demo README):

1. `@playwright/test` + `chromium` (`pnpm --filter knowledge exec playwright install --with-deps chromium`).
2. `ffmpeg` on PATH.
3. Either VOICEVOX engine running locally at `http://localhost:50021`, or `AZURE_TTS_KEY` + `AZURE_TTS_REGION` env vars set.
