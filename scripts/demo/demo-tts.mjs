#!/usr/bin/env node
/**
 * Demo narration TTS generator.
 *
 * Reads scripts/demo/narration.json and produces one wav per line plus a
 * master SRT subtitle file, into scripts/demo/out/.
 *
 * Providers:
 *   - voicevox (default): free, local, no API key. Requires the VOICEVOX
 *     engine to be running at http://localhost:50021. Install from
 *     https://voicevox.hiroshiba.jp/ or run the Docker image.
 *   - azure: Azure Cognitive Services Speech. Requires AZURE_TTS_KEY +
 *     AZURE_TTS_REGION env vars (free tier: 500k chars/month).
 *
 * Select with:
 *   TTS_PROVIDER=voicevox pnpm demo:tts
 *   TTS_PROVIDER=azure    pnpm demo:tts
 *
 * All output is written relative to the repo root so the compose script
 * can pick it up without absolute paths.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Resolve paths from the script's own location so the tool works regardless
// of the cwd when invoked via pnpm. fileURLToPath is the correct Windows-
// friendly way to turn `import.meta.url` into a filesystem path — raw
// `.pathname` leaves a leading slash that path.resolve mishandles.
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
// `DEMO_DIR` lets a second pipeline (Knowlex) share these scripts by
// pointing at its own narration.json + output directory. Defaults
// preserve the original Boardly paths.
const DEMO_DIR = process.env.DEMO_DIR ?? "scripts/demo";
const SCRIPT_FILE = resolve(ROOT, `${DEMO_DIR}/narration.json`);
const OUT_DIR = resolve(ROOT, `${DEMO_DIR}/out`);

async function main() {
  const raw = await readFile(SCRIPT_FILE, "utf8");
  const script = JSON.parse(raw);
  const provider = process.env.TTS_PROVIDER ?? "voicevox";

  console.log(`[tts] provider=${provider}, lines=${script.lines.length}`);
  await mkdir(OUT_DIR, { recursive: true });

  for (let i = 0; i < script.lines.length; i++) {
    const line = script.lines[i];
    const outPath = resolve(OUT_DIR, `line-${String(i).padStart(3, "0")}.wav`);
    // Per-line overrides take priority over the voice-level default. This
    // lets the first / last lines run at a different speed without having
    // to split the narration file.
    const mergedVoice = (base) => ({
      ...(base ?? {}),
      ...(typeof line.speedScale === "number"
        ? { speedScale: line.speedScale }
        : {}),
      ...(typeof line.pitchScale === "number"
        ? { pitchScale: line.pitchScale }
        : {}),
    });
    console.log(
      `[tts] ${i + 1}/${script.lines.length} @${line.at}s${typeof line.speedScale === "number" ? ` (x${line.speedScale})` : ""}: ${line.text.slice(0, 40)}...`,
    );
    if (provider === "voicevox") {
      await viaVoicevox(line.text, mergedVoice(script.voice.voicevox), outPath);
    } else if (provider === "azure") {
      await viaAzure(line.text, mergedVoice(script.voice.azure), outPath);
    } else {
      throw new Error(`Unknown TTS_PROVIDER: ${provider}`);
    }
  }

  // Also emit a SubRip subtitle file so users can burn captions if they
  // want — optional input to the compose script.
  const srt = buildSrt(script.lines);
  await writeFile(resolve(OUT_DIR, "captions.srt"), srt, "utf8");
  console.log(`[tts] wrote ${script.lines.length} wavs + captions.srt to ${OUT_DIR}`);
}

async function viaVoicevox(text, voice, outPath) {
  const base = process.env.VOICEVOX_URL ?? "http://localhost:50021";
  const speaker = voice?.speaker ?? 3;

  // Step 1: audio_query — derive phrasing + pitch data from text.
  const q = await fetch(
    `${base}/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`,
    { method: "POST" },
  );
  if (!q.ok) {
    throw new Error(
      `VOICEVOX audio_query failed (${q.status}). Is the engine running at ${base}?`,
    );
  }
  const query = await q.json();
  // Apply speed / pitch / volume tweaks from narration.json. speedScale
  // defaults to 1.0 (normal); set 1.15 for a slightly faster delivery that
  // fits more text into each cue window without running into the next line.
  if (typeof voice?.speedScale === "number") query.speedScale = voice.speedScale;
  if (typeof voice?.pitchScale === "number") query.pitchScale = voice.pitchScale;
  if (typeof voice?.intonationScale === "number")
    query.intonationScale = voice.intonationScale;
  if (typeof voice?.volumeScale === "number")
    query.volumeScale = voice.volumeScale;

  // Step 2: synthesis — render the wav.
  const s = await fetch(`${base}/synthesis?speaker=${speaker}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(query),
  });
  if (!s.ok) throw new Error(`VOICEVOX synthesis failed (${s.status})`);
  const buf = Buffer.from(await s.arrayBuffer());
  await writeFile(outPath, buf);
}

async function viaAzure(text, voice, outPath) {
  const key = process.env.AZURE_TTS_KEY;
  const region = process.env.AZURE_TTS_REGION ?? "japaneast";
  if (!key) {
    throw new Error(
      "AZURE_TTS_KEY not set. Get one from Azure portal -> Speech service.",
    );
  }
  const voiceName = voice?.name ?? "ja-JP-NanamiNeural";
  const style = voice?.style ?? "general";
  // Map the VOICEVOX-ish speedScale to Azure's prosody rate. 1.0 = +0%,
  // 1.15 = +15%, 0.9 = -10%.
  const rate =
    typeof voice?.speedScale === "number"
      ? `${Math.round((voice.speedScale - 1) * 100)}%`
      : "+0%";
  const ssml = `<?xml version='1.0'?>
<speak version='1.0' xml:lang='ja-JP' xmlns:mstts='https://www.w3.org/2001/mstts'>
  <voice name='${voiceName}'>
    <mstts:express-as style='${style}'>
      <prosody rate='${rate}'>${escapeXml(text)}</prosody>
    </mstts:express-as>
  </voice>
</speak>`;

  const res = await fetch(
    `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "riff-24khz-16bit-mono-pcm",
        "User-Agent": "craftstack-demo-tts",
      },
      body: ssml,
    },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Azure TTS failed (${res.status}): ${detail}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(outPath, buf);
}

function escapeXml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Produce a conservative SRT by giving each line a 4-second visible window
 * (or until the next line starts, whichever is shorter). This is a rough
 * approximation — if you want lip-sync captions, generate them from the
 * actual wav durations after the fact with ffprobe.
 */
function buildSrt(lines) {
  return (
    lines
      .map((line, i) => {
        const start = line.at;
        const nextAt = lines[i + 1]?.at ?? start + 4;
        const end = Math.min(start + 4, nextAt - 0.1);
        return [
          String(i + 1),
          `${toSrtTime(start)} --> ${toSrtTime(end)}`,
          line.text,
          "",
        ].join("\n");
      })
      .join("\n") + "\n"
  );
}

function toSrtTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  return (
    String(h).padStart(2, "0") +
    ":" +
    String(m).padStart(2, "0") +
    ":" +
    String(s).padStart(2, "0") +
    "," +
    String(ms).padStart(3, "0")
  );
}

main().catch((err) => {
  console.error("[tts] failed:", err.message);
  process.exit(1);
});
