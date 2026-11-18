// Turning a rendered signal into a shipped file: level normalisation (the same conventions as the files they replace)
// and the encoder.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SR, dbToGain, gainToDb, hp, peak } from './dsp.mjs';
import { integratedLufs, meanLufs, samplePeak, truePeakDb } from './lufs.mjs';

/** Gain to bring channels to `targetLufs` integrated; clips shorter than 0.5 s use the ungated mean. Returns dB applied. */
export function normalizeLufs(chs, targetLufs) {
  const len = chs[0].length;
  const cur = len / SR >= 1 ? integratedLufs(chs, SR) : meanLufs(chs, SR);
  const g = targetLufs - cur;
  for (const c of chs) for (let i = 0; i < len; i++) c[i] *= dbToGain(g);
  return g;
}

/** Peak-normalise all channels together to `db` dBFS. Returns dB applied. */
export function normalizePeak(chs, db) {
  const p = chs.reduce((m, c) => Math.max(m, peak(c)), 0);
  const g = db - gainToDb(p);
  for (const c of chs) for (let i = 0; i < c.length; i++) c[i] *= dbToGain(g);
  return g;
}

/**
 * Keeps the true peak under `ceilDb` with a memoryless soft knee on the excursions only (samples below the knee are
 * untouched). Only used for beds whose crest factor exceeds what the loudness target leaves room for.
 */
export function softCeiling(chs, ceilDb) {
  const ceil = dbToGain(ceilDb), knee = ceil * 0.7;
  for (const c of chs) for (let i = 0; i < c.length; i++) {
    const a = Math.abs(c[i]);
    if (a > knee) c[i] = Math.sign(c[i]) * (knee + (ceil - knee) * Math.tanh((a - knee) / (ceil - knee)));
  }
}

export const highPass30 = (x) => hp(hp(x, 30), 30);

export function toFloat32(chs) { return chs.map((c) => Float32Array.from(c)); }

/** Interleaved little-endian float32 bytes. */
function interleave(chs) {
  const n = chs[0].length, buf = Buffer.alloc(n * chs.length * 4);
  for (let i = 0; i < n; i++) for (let c = 0; c < chs.length; c++) buf.writeFloatLE(chs[c][i], (i * chs.length + c) * 4);
  return buf;
}

export const MP3_ARGS = ['-c:a', 'libmp3lame', '-b:a', '96k', '-ar', String(SR), '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', '-write_id3v1', '0', '-id3v2_version', '0'];

/** Runs `fn(filePath)` with a path inside a fresh temporary directory, removed afterwards. */
function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'foundress-mp3-'));
  try { return fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

/**
 * MP3 bytes (96 kbps CBR, 44.1 kHz) with ffmpeg's libmp3lame; deterministic for the same ffmpeg build.
 * The encoder writes to a real file, not a pipe: only a seekable output lets the muxer go back and fill in the Info
 * (Xing/LAME) frame that carries the encoder delay and padding. Without it a decoder plays the 1105-sample lead-in and
 * the padding as silence, which delays every one-shot by about 25 ms and breaks plain loop=true. The old files had it.
 */
export function encodeMp3(chs) {
  return withTempDir((dir) => {
    const file = path.join(dir, 'out.mp3');
    const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'f32le', '-ar', String(SR), '-ac', String(chs.length), '-i', 'pipe:0', ...MP3_ARGS, '-f', 'mp3', file],
      { input: interleave(chs), maxBuffer: 1 << 28 });
    if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
    return fs.readFileSync(file);
  });
}

/**
 * Decodes an MP3 (bytes) to channels of Float32Array at SR, the way a browser does: delay and padding trimmed by the
 * Info frame. Decoded from a file for the same reason as the encoder: from a pipe ffmpeg cannot trim the end padding.
 */
export function decodeMp3(bytes, channels) {
  const buf = withTempDir((dir) => {
    const file = path.join(dir, 'in.mp3');
    fs.writeFileSync(file, bytes);
    const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-f', 'f32le', '-ar', String(SR), '-ac', String(channels), 'pipe:1'], { maxBuffer: 1 << 28 });
    if (r.status !== 0) throw new Error(`ffmpeg decode failed: ${r.stderr}`);
    return r.stdout;
  });
  const n = Math.floor(buf.length / 4 / channels);
  const out = Array.from({ length: channels }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) for (let c = 0; c < channels; c++) out[c][i] = buf.readFloatLE((i * channels + c) * 4);
  return out;
}

export { integratedLufs, samplePeak, truePeakDb };
