// Provenance (task audio-provenance): no shipped sound may rest on an uploader's word about someone else's recording.
// The 36 sounds that did are original work, rendered by the deterministic scripts in tools/audio/. This test checks
// that every one of them still has its id and role, that the records and credits say what is true, that rendering is
// reproducible, and that the level conventions hold. The cheap checks always run; FOUNDRESS_LONG=1 renders and
// measures all 36 sounds (encode, decode, spectrum, loudness, true peak, loop seams) and compares the shipped files
// with a fresh render byte for byte.
import { describe, expect, it } from 'vitest';
import recordsRaw from '../../assets-src/records_audio.json?raw';
import manifestRaw from '../../public/assets/manifest.json?raw';
import publicCredits from '../../public/assets/CREDITS.md?raw';
import rootCredits from '../../CREDITS.md?raw';
import { requestedAudioFiles } from './requestedFiles';
import { integratedLoudness } from './loudness';

declare const process: { env: Record<string, string | undefined> } | undefined;
const LONG = (typeof process !== 'undefined' ? process.env : {}).FOUNDRESS_LONG === '1';

// The renderers are plain .mjs outside the typed project: load them by URL (as packaging.test.ts does for the build).
const TOOLS = new URL('../../tools/audio/', import.meta.url).href;
interface Spec { id: string; seed: number; channels: number; loop?: boolean; oneShot?: boolean; lufs?: number; render: unknown; expect: { centroidHz: [number, number] } }
interface Checked { id: string; problems: string[]; metrics: Record<string, number> }
const { SOUNDS } = (await import(/* @vite-ignore */ `${TOOLS}sounds/index.mjs`)) as { SOUNDS: Spec[] };
const { makeRng } = (await import(/* @vite-ignore */ `${TOOLS}lib/rng.mjs`)) as { makeRng: (seed: number) => unknown };
const { renderPcm, renderMp3 } = (await import(/* @vite-ignore */ `${TOOLS}lib/pipeline.mjs`)) as {
  renderPcm: (s: Spec, m: unknown) => Float64Array[]; renderMp3: (s: Spec, m: unknown) => { bytes: Uint8Array };
};
const { checkSpec, shippedMatchesRender } = (await import(/* @vite-ignore */ `${TOOLS}check.mjs`)) as {
  checkSpec: (s: Spec, o?: { encode?: boolean }) => Checked; shippedMatchesRender: (s: Spec) => boolean;
};
const { integratedLufs } = (await import(/* @vite-ignore */ `${TOOLS}lib/lufs.mjs`)) as { integratedLufs: (c: Float32Array[], fs: number) => number };

interface AudioRecord { id: string; path: string; bytes: number; seconds: number; provenance?: string; tier?: string; evidence?: string; source_page: string; download_url: string; license: string; processing: string; note?: string; author: string; replaces?: { source_page: string } }
const records = JSON.parse(recordsRaw) as AudioRecord[];
const manifest = JSON.parse(manifestRaw) as { assets: { id: string; kind: string; bytes: number; license: string; note?: string }[] };
const replacedIds = SOUNDS.map((s) => s.id);
const spec = (id: string): Spec => SOUNDS.find((s) => s.id === id)!;
const cheap = ['audio/sfx/ui_click_01', 'audio/sfx/cricket_chirp_02', 'audio/sfx/water_drip_02'];

describe('provenance: the replaced sounds', () => {
  it('replaces the 26 archive.org files and the 10 second-hand OpenGameArt files, 36 in all, each id once', () => {
    expect(replacedIds.length).toBe(36);
    expect(new Set(replacedIds).size).toBe(36);
    for (const id of ['audio/ambience/crickets_night', 'audio/ambience/rain_heavy', 'audio/ambience/street_suburban', 'audio/ambience/traffic_distant',
      'audio/ambience/playground_distant', 'audio/ambience/underground_rumble', 'audio/sfx/lawnmower_loop', 'audio/sfx/lawnmower_push_loop',
      'audio/sfx/thud_giant_step_01', 'audio/sfx/stridulation_grasshopper_01', 'audio/sfx/ui_click_01', 'audio/sfx/water_drip_01', 'audio/sfx/wood_creak_03']) {
      expect(replacedIds, id).toContain(id);
    }
  });

  it('every replaced id is still one the code asks for and still ships (cue ids and ambience ids resolve to a file)', () => {
    const requested = requestedAudioFiles();
    expect(replacedIds.filter((id) => !requested.includes(id))).toEqual([]);
    const shipped = manifest.assets.filter((a) => a.kind === 'audio').map((a) => a.id);
    expect(replacedIds.filter((id) => !shipped.includes(id))).toEqual([]);
  });

  it('every replaced sound has a loudness convention: beds and loops a LUFS target, one-shots a peak target', () => {
    for (const s of SOUNDS) expect(s.loop ? typeof s.lufs === 'number' : s.oneShot === true, s.id).toBe(true);
    expect(SOUNDS.filter((s) => s.loop).length).toBe(8); // six beds and two mower loops
  });
});

describe('provenance: records and credits say what is true', () => {
  it('no shipped audio record is tier B: every record has a provenance, the replaced ones are "original" and cite no outside source', () => {
    expect(records.length).toBe(45);
    for (const r of records) {
      expect(r.provenance, r.id).toBeTruthy();
      expect(r.tier, r.id).not.toBe('B');
      // 'A' = first-hand source with licence evidence the repository can show (original work: nothing to show);
      // the nine kept files hold only a recorded badge string, which the record says in its own tier label.
      if (replacedIds.includes(r.id)) expect(r.tier, r.id).toBe('A');
      else {
        expect(r.tier, r.id).toBe('A-badge');
        expect(r.evidence, r.id).toMatch(/no saved copy/);
      }
    }
    for (const id of replacedIds) {
      const r = records.find((x) => x.id === id)!;
      expect(r.provenance, id).toBe('original');
      const text = [r.source_page, r.download_url, r.license, r.processing, r.note ?? '', r.author].join(' ');
      expect(text, id).not.toMatch(/archive\.org|opengameart|freesound|kenney|uploader-asserted|tier B/i);
      expect(r.replaces?.source_page, `${id} keeps the removed source for the audit trail`).toBeTruthy();
    }
  });

  it('the records give the duration a decoder plays (the Info frame trims delay and padding), not ffprobe\'s padded one', () => {
    const click = records.find((r) => r.id === 'audio/sfx/ui_click_01')!;
    expect(click.seconds).toBeCloseTo(4851 / 44100, 2); // 0.11 s; ffprobe's format duration reads 0.16 s
  });

  it('the pack manifest carries no archive.org claim and calls the replaced files original', () => {
    expect(manifestRaw).not.toMatch(/archive\.org|uploader-asserted|tier B/i);
    for (const id of replacedIds) expect(manifest.assets.find((a) => a.id === id)?.license, id).toBe('original');
  });

  it('CREDITS.md and public/assets/CREDITS.md list no source page on archive.org and no sourced table row for a replaced sound', () => {
    for (const [name, text] of [['public/assets/CREDITS.md', publicCredits], ['CREDITS.md', rootCredits]] as const) {
      expect(text.match(/https?:\/\/[^\s)>`'"|]*archive\.org[^\s)>`'"|]*/g) ?? [], name).toEqual([]);
      expect(text, name).not.toMatch(/uploader-asserted/i);
      const rows = text.split('\n').filter((l) => l.startsWith('|'));
      for (const id of replacedIds) {
        const short = id.replace('audio/', '');
        expect(rows.filter((l) => l.includes(`\`${id}.mp3\``) || l.includes(`\`${short}\``)), `${name}: table row naming ${id}`).toEqual([]);
      }
    }
  });
});

describe('provenance: rendering is deterministic and the loudness estimator agrees with the game\'s', () => {
  it('rendering a sound twice gives identical samples (three cheap sounds)', () => {
    for (const id of cheap) {
      const a = renderPcm(spec(id), makeRng), b = renderPcm(spec(id), makeRng);
      expect(a.length).toBe(b.length);
      for (let c = 0; c < a.length; c++) expect(a[c].every((v, i) => v === b[c][i]), id).toBe(true);
    }
  });

  it('encoding twice gives identical bytes (three cheap sounds; skipped when ffmpeg is missing)', () => {
    let have = true;
    try { renderMp3(spec(cheap[0]), makeRng); } catch { have = false; }
    if (!have) return;
    for (const id of cheap) {
      const a = renderMp3(spec(id), makeRng).bytes, b = renderMp3(spec(id), makeRng).bytes;
      expect(a.length).toBe(b.length);
      expect(a.every((v, i) => v === b[i]), id).toBe(true);
    }
  });

  it('tools/audio/lib/lufs.mjs reads the same integrated loudness as src/audio/loudness.ts', () => {
    const rng = makeRng(7) as { white: () => number };
    const x = new Float32Array(44100 * 4);
    for (let i = 0; i < x.length; i++) x[i] = 0.05 * rng.white() * (0.6 + 0.4 * Math.sin(i / 9000));
    expect(integratedLufs([x], 44100)).toBeCloseTo(integratedLoudness([x], 44100), 6);
  });

  it('a cheap bed (street_suburban) is periodic: smooth wrap, level steady across the seam, -24 LUFS, true peak under -1 dBFS', () => {
    const r = checkSpec(spec('audio/ambience/street_suburban'), { encode: false });
    expect(r.problems).toEqual([]);
    expect(r.metrics.truePeakDb).toBeLessThan(-1);
  });

  it('three cheap one-shots keep the level convention and their spectral role (without the encoder)', () => {
    for (const id of cheap) expect(checkSpec(spec(id), { encode: false }).problems, id).toEqual([]);
  });

  it('three cheap one-shots meet the level convention on the decoded file, which is exactly as long as the rendered sound', () => {
    for (const id of cheap) {
      const r = checkSpec(spec(id));
      expect(r.problems, id).toEqual([]);
      expect(r.metrics.decodedSeconds, id).toBeCloseTo(renderPcm(spec(id), makeRng)[0].length / 44100, 6);
    }
  });
});

describe.skipIf(!LONG)('provenance (FOUNDRESS_LONG=1): all 36 sounds measured as shipped', () => {
  it('every sound is inside its role\'s spectral range, meets its level target on the decoded MP3, has true peak < -1 dBFS and, for loops, a smooth seam', () => {
    const bad: string[] = [];
    for (const s of SOUNDS) {
      const r = checkSpec(s);
      for (const p of r.problems) bad.push(`${s.id}: ${p}`);
    }
    expect(bad).toEqual([]);
  }, 300_000);

  it('the files in public/assets/audio are byte-identical to a fresh render (the scripts and seeds in the repository make them)', () => {
    expect(SOUNDS.filter((s) => !shippedMatchesRender(s)).map((s) => s.id)).toEqual([]);
  }, 300_000);
});
