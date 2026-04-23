# Demo video pipeline

Overlays a synthesized TTS narration onto a silent screen recording so you can ship a presentable demo without owning a microphone or editing software. All tooling is free-tier.

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

## Recording workflow

1. **Capture a silent screen recording** (~90 seconds) walking through the board. Save it as:

   ```
   scripts/demo/input.mp4
   ```

   Any tool works — OBS, Windows Game Bar (Win+G), macOS Screenshot (Cmd+Shift+5), Loom → download. Mute the microphone before recording.

2. **Edit `narration.json`** if you want to change the script. The `at` timestamps are your cue points; each line plays at `at` seconds into the video.

3. **Generate the voice tracks:**

   ```bash
   # VOICEVOX engine must be running
   TTS_PROVIDER=voicevox pnpm demo:tts

   # or
   TTS_PROVIDER=azure pnpm demo:tts
   ```

   Output: `scripts/demo/out/line-NNN.wav` (one per narration line) + `captions.srt`.

4. **Compose the final mp4:**

   ```bash
   pnpm demo:compose
   # or with subtitles burned in:
   DEMO_SUBTITLES=1 pnpm demo:compose
   ```

   Output: `scripts/demo/out/final.mp4`

5. Upload to Loom / YouTube / paste into README.

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
