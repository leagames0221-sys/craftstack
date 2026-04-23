# Demo video pipeline

Produces a narrated demo video of Boardly without a microphone, without screen-recording skill, and with zero ongoing cost.

The pipeline is **split into three optional stages** so you can enter at whichever point matches the time you have:

| Stage      | Command                                                     | What it does                                                                                                            | When you'd skip                                                                                    |
| ---------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1. Capture | `pnpm demo:auth` → `pnpm demo:record` → `pnpm demo:convert` | Drives a real browser via Playwright using your saved OAuth cookies, records a silent mp4 into `scripts/demo/input.mp4` | If you'd rather record manually with OBS / Win+G and drop your own mp4 at `scripts/demo/input.mp4` |
| 2. Narrate | `pnpm demo:tts`                                             | Synthesizes Japanese narration from `narration.json` using VOICEVOX or Azure Neural TTS                                 | If you want no voice-over                                                                          |
| 3. Compose | `pnpm demo:compose`                                         | ffmpeg overlays the narration (and optional subtitles) onto `input.mp4`, emits `scripts/demo/out/final.mp4`             | You can't skip this if you ran stage 2                                                             |

Or just `pnpm demo:all` from the repo root to run all three back to back.

## One-time setup

Install **ffmpeg** (any platform) and pick a TTS provider:

### Provider A — VOICEVOX (recommended for Japanese, fully free)

1. Download and run the VOICEVOX engine from <https://voicevox.hiroshiba.jp/>
   - Or run the Docker image:
     ```bash
     docker run --rm -it -p 50021:50021 voicevox/voicevox_engine:cpu-latest
     ```
2. The engine listens on `http://localhost:50021`. No account, no API key.
3. Character / speaker id lives in `narration.json` under `voice.voicevox.speaker` (3 = ずんだもん ノーマル by default).

### Provider B — Azure Neural TTS (professional voice, 500k chars/month free)

1. Azure portal → Create a **Speech** resource (free F0 tier).
2. Copy the key + region, export as env:
   ```bash
   export AZURE_TTS_KEY=...
   export AZURE_TTS_REGION=japaneast
   ```
3. Voice name lives in `narration.json` under `voice.azure.name` (default: `ja-JP-NanamiNeural`).

## Stage 1: Automated capture (Playwright)

Uses **your** saved OAuth cookies to drive a real browser end-to-end. Records against `https://craftstack-collab.vercel.app` by default; override with `DEMO_BASE_URL` (e.g. `http://localhost:3000` when you want to record against dev).

Pre-req: have at least one workspace + board + a handful of cards already created in the account you'll sign in as. The script doesn't create data — it navigates what's there.

### One-time auth capture

```bash
pnpm demo:auth
```

A browser window opens on `/signin`. **Sign in manually with GitHub** (recommended — Google is still in Testing gate). As soon as `/dashboard` loads, Playwright saves the cookies to `apps/collab/playwright/.auth/user.json` and the window closes. Re-run this whenever the session cookie expires (~30 days).

### Reproducible recording

```bash
pnpm demo:record
# optional: point at a specific workspace / board
DEMO_WORKSPACE_SLUG=demo DEMO_BOARD_SLUG=sprint-1 pnpm demo:record
```

A real Chrome window opens at 1920×1080, navigates dashboard → workspace → board, drags a card, opens the card modal, scrolls to show labels / assignees / comments / history, opens the notifications bell, and returns to the workspace page — a roughly 60-second silent walkthrough.

### Convert to mp4

```bash
pnpm demo:convert
```

Finds the newest `video.webm` that Playwright wrote under `apps/collab/test-results-demo/**`, trims the dead frames off the head, caps at 95 seconds, and writes `scripts/demo/input.mp4`.

## Stage 1 alternative: manual screen recording

If you'd rather not automate the browser, capture a silent mp4 with any tool (OBS, Windows Game Bar / Win+G, macOS Screenshot, Loom → download) and save it as `scripts/demo/input.mp4`. Skip to Stage 2.

## Stage 2: Narration (TTS)

Edit `narration.json` if you want to change the script. The `at` timestamps are cue points; each line plays at `at` seconds into the video.

```bash
# VOICEVOX engine must be running locally
TTS_PROVIDER=voicevox pnpm demo:tts

# or Azure Neural TTS (AZURE_TTS_KEY + AZURE_TTS_REGION env vars required)
TTS_PROVIDER=azure pnpm demo:tts
```

Output: `scripts/demo/out/line-NNN.wav` (one per narration line) + `captions.srt`.

## Stage 3: Compose

```bash
pnpm demo:compose
# or with subtitles burned in:
DEMO_SUBTITLES=1 pnpm demo:compose
```

Output: `scripts/demo/out/final.mp4`. Upload to Loom / YouTube / embed in README.

## Troubleshooting

- **VOICEVOX audio_query failed (ECONNREFUSED)** — the engine isn't running. Start it per the setup step, then retry.
- **Azure TTS failed (401)** — key/region mismatch. Verify both match the Speech resource in the portal.
- **ffmpeg: command not found** — install ffmpeg (`choco install ffmpeg` / `brew install ffmpeg` / `apt install ffmpeg`).
- **Audio lines overlap each other** — a line's narration is longer than the gap to the next cue. Either shorten the text or push the next cue's `at` later in `narration.json`, then re-run `pnpm demo:tts`.

## Why this split?

The silent video is captured manually (cheap, 5 minutes) rather than scripted through Playwright, because:

1. OAuth + DB seeding + screen-layout tweaking in a headless browser is 2+ hours of fragile plumbing for a one-shot artifact.
2. A human recording a real browser on a real prod deploy is more honest anyway — the narration is the automated part.
3. The narration is the part that wants to be reproducible: once the pipeline exists, updating the story is a JSON edit + two commands.
