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
import { resolve } from "node:path";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..", "..");
const SCRIPT_FILE = resolve(ROOT, "scripts/demo/narration.json");
const OUT_DIR = resolve(ROOT, "scripts/demo/out");

async function main() {
  const raw = await readFile(SCRIPT_FILE, "utf8");
  const script = JSON.parse(raw);
  const provider = process.env.TTS_PROVIDER ?? "voicevox";

  console.log(`[tts] provider=${provider}, lines=${script.lines.length}`);
  await mkdir(OUT_DIR, { recursive: true });

  for (let i = 0; i < script.lines.length; i++) {
    const line = script.lines[i];
    const outPath = resolve(OUT_DIR, `line-${String(i).padStart(3, "0")}.wav`);
    console.log(`[tts] ${i + 1}/${script.lines.length} @${line.at}s: ${line.text.slice(0, 40)}...`);
    if (provider === "voicevox") {
      await viaVoicevox(line.text, script.voice.voicevox, outPath);
    } else if (provider === "azure") {
      await viaAzure(line.text, script.voice.azure, outPath);
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
  const ssml = `<?xml version='1.0'?>
<speak version='1.0' xml:lang='ja-JP' xmlns:mstts='https://www.w3.org/2001/mstts'>
  <voice name='${voiceName}'>
    <mstts:express-as style='${style}'>${escapeXml(text)}</mstts:express-as>
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
