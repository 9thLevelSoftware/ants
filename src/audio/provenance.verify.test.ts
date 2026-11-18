// Reviewer tests for task audio-provenance (adversarial). They check what the implementation's own provenance test
// does not: that the replaced set is exactly the audit's list, that the kept files are not relabelled, that the two
// loudness estimators agree on stereo and gated signals, and that the shipped MP3s keep the gapless header the old
// files had (so a decoder trims the encoder delay and padding instead of playing them).
import { describe, expect, it } from 'vitest';
import auditRaw from '../../docs/CREDITS-AUDIT.md?raw';
import recordsRaw from '../../assets-src/records_audio.json?raw';
import { integratedLoudness, truePeakDb as gameTruePeakDb } from './loudness';

// Node built-ins by a computed specifier: the project has no @types/node (the tests run under Node all the same).
interface Bytes { length: number; subarray(a: number, b: number): { toString(enc: string): string } }
const fs = (await import(/* @vite-ignore */ `node:${'fs'}`)) as { readFileSync: (p: URL | string) => Bytes };
const { spawnSync } = (await import(/* @vite-ignore */ `node:${'child_process'}`)) as {
  spawnSync: (cmd: string, args: string[], o?: { maxBuffer?: number }) => { status: number | null; stdout: Bytes };
};
const TOOLS = new URL('../../tools/audio/', import.meta.url).href;
const PUBLIC = new URL('../../public/assets/', import.meta.url);
interface Spec { id: string; seed: number; channels: number; loop?: boolean; oneShot?: boolean }
const { SOUNDS } = (await import(/* @vite-ignore */ `${TOOLS}sounds/index.mjs`)) as { SOUNDS: Spec[] };
const { makeRng } = (await import(/* @vite-ignore */ `${TOOLS}lib/rng.mjs`)) as { makeRng: (seed: number) => { white: () => number } };
const { renderPcm } = (await import(/* @vite-ignore */ `${TOOLS}lib/pipeline.mjs`)) as { renderPcm: (s: Spec, m: unknown) => Float64Array[] };
const lufsMjs = (await import(/* @vite-ignore */ `${TOOLS}lib/lufs.mjs`)) as {
  integratedLufs: (c: Float32Array[], fs: number) => number; truePeakDb: (c: Float32Array[]) => number;
};

interface AudioRecord { id: string; path: string; provenance?: string; tier?: string; source_page: string; license: string; replaces?: { source_page: string; removed: string } }
const records = JSON.parse(recordsRaw) as AudioRecord[];
const replaced = new Set(SOUNDS.map((s) => s.id));
const FS = 44100;
const haveFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

/** The ids the audit (as written at fb15f3d) named in its two audio "cannot be shown" entries. */
function auditListedIds(): string[] {
  const start = auditRaw.indexOf('### 1. Twenty-six archive.org');
  const end = auditRaw.indexOf('### 3. SMAA');
  const block = auditRaw.slice(start, end);
  const ids = new Set<string>();
  for (const m of block.matchAll(/`((?:ambience|sfx)\/[a-z0-9_]+)`/g)) ids.add(`audio/${m[1]}`);
  return [...ids].sort();
}

/** First MPEG frame carries a Xing/Info tag (with the LAME delay/padding fields) within its first 200 bytes. */
function hasGaplessTag(bytes: Bytes): boolean {
  const head = bytes.subarray(0, 200).toString('latin1');
  return head.includes('Info') || head.includes('Xing');
}

describe('provenance review: the replaced set', () => {
  it('replaced ids are exactly the ids the audit listed as "cannot be shown" (entries 1 and 2)', () => {
    const listed = auditListedIds();
    expect(listed.length).toBe(36);
    expect([...replaced].sort()).toEqual(listed);
  });

  it('the nine kept files are not relabelled as original and keep their OpenGameArt source', () => {
    const kept = records.filter((r) => !replaced.has(r.id));
    expect(kept.length).toBe(9);
    for (const r of kept) {
      expect(r.provenance, r.id).not.toBe('original');
      expect(r.source_page, r.id).toMatch(/opengameart\.org/);
      expect(r.replaces, r.id).toBeUndefined();
    }
  });

  it('every replaced record dates its removal and names a removed source that was archive.org or OpenGameArt', () => {
    for (const id of replaced) {
      const r = records.find((x) => x.id === id)!;
      expect(r.replaces?.removed, id).toBe('2026-11-18');
      expect(r.replaces?.source_page, id).toMatch(/archive\.org|opengameart\.org/);
    }
  });
});

describe('provenance review: tools/audio/lib/lufs.mjs against src/audio/loudness.ts', () => {
  const rng = makeRng(99);
  const noise = (n: number, g: number) => { const x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = g * rng.white(); return x; };

  it('agrees on a stereo signal with quiet and loud halves (relative gate active)', () => {
    const n = FS * 6;
    const l = noise(n, 0.08), r = noise(n, 0.05);
    for (let i = 0; i < n / 2; i++) { l[i] *= 0.02; r[i] *= 0.02; } // first half ~34 dB down: gated out
    expect(lufsMjs.integratedLufs([l, r], FS)).toBeCloseTo(integratedLoudness([l, r], FS), 6);
  });

  it('agrees on silence (no block above the absolute gate)', () => {
    const z = new Float32Array(FS * 2);
    expect(lufsMjs.integratedLufs([z], FS)).toBe(-Infinity);
    expect(integratedLoudness([z], FS)).toBe(-Infinity);
  });

  it('true peak estimators agree on an inter-sample peak', () => {
    const x = new Float32Array(FS);
    for (let i = 0; i < x.length; i++) x[i] = 0.7 * Math.sin(2 * Math.PI * 11025 * (i / FS) + Math.PI / 4); // samples at 0.495, true peak 0.7
    const a = lufsMjs.truePeakDb([x]), b = gameTruePeakDb([x], { fs: FS });
    expect(Math.abs(a - b)).toBeLessThan(0.05);
  });
});

describe('provenance review: shipped MP3 format matches what the old files had', () => {
  it('the nine kept (old-encoder) files carry a Xing/Info gapless header (baseline for the next test)', () => {
    for (const r of records.filter((x) => !replaced.has(x.id))) {
      expect(hasGaplessTag(fs.readFileSync(new URL(`${r.id}.mp3`, PUBLIC))), r.id).toBe(true);
    }
  });

  // Regression (fixed): finish.mjs once encoded to `pipe:1`, where ffmpeg cannot seek back to write the Xing/Info
  // frame, so the decoder kept the 1105-sample encoder delay and the end padding (about 25 ms of silence before every
  // replaced one-shot, and every buffer longer than the sound). It now encodes to a temporary file.
  it('every replaced file carries a Xing/Info gapless header too', () => {
    const missing = SOUNDS.filter((s) => !hasGaplessTag(fs.readFileSync(new URL(`${s.id}.mp3`, PUBLIC)))).map((s) => s.id);
    expect(missing).toEqual([]);
  });

  it.skipIf(!haveFfmpeg)('a replaced one-shot decodes to the length of the sound that was rendered (no encoder delay or padding)', () => {
    const s = SOUNDS.find((x) => x.id === 'audio/sfx/ui_click_01')!;
    const rendered = renderPcm(s, makeRng)[0].length;
    const file = new URL(`${s.id}.mp3`, PUBLIC).pathname;
    const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(FS), 'pipe:1'], { maxBuffer: 1 << 24 });
    const decoded = r.stdout.length / 4;
    expect(decoded).toBe(rendered);
  });
});
