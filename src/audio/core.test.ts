// Pure audio core: bus maths, distance and occlusion curves, cue table completeness, voice limiting, alert gate.
import { describe, expect, it } from 'vitest';
import { CUE_IDS } from '@/sim/types/ids/progression';
import { HUMAN_EVENT_KINDS, MATERIALS } from '@/sim/types/ids';
import { busGains, dbToGain, gainToDb, inverseDistanceGain, sliderToGain, surfaceOcclusion } from './mix';
import { CUE_SOUNDS, GIANT_ONESHOTS, raindropSemis, resolveCue } from './cueTable';
import { SYNTH_ONESHOTS } from './synth/ids';
import { ALL_BED_IDS, ALL_SFX_IDS } from './assetIds';
import { CrowdMeter, VoiceTable } from './voices';
import { AlertSoundGate } from './alertGate';
import { BUS_DEFAULT_DB, DISTANCE, MASTER_TRIM_DB } from './tuning';
import manifest from '../../public/assets/manifest.json';

const DEFAULTS = { master: 1, ambience: 0.8, effects: 0.9, giants: 0.9, ui: 0.6, music: 0.5, muted: false, musicMode: 'sparse' as const };

describe('bus maths (GDD 08 §13.2)', () => {
  it('converts dB both ways', () => {
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(-6)).toBeCloseTo(0.501, 3);
    expect(gainToDb(dbToGain(-14))).toBeCloseTo(-14, 9);
    expect(gainToDb(0)).toBe(-Infinity);
  });
  it('slider law is (slider/100)^2 and 0 mutes', () => {
    expect(sliderToGain(0)).toBe(0);
    expect(sliderToGain(0.5)).toBe(0.25);
    expect(sliderToGain(1)).toBe(1);
    expect(sliderToGain(2)).toBe(1);
    expect(sliderToGain(Number.NaN)).toBe(0);
  });
  it('bus gains: default dB x slider law, mute and music off', () => {
    const g = busGains(DEFAULTS);
    expect(gainToDb(g.master)).toBeCloseTo(MASTER_TRIM_DB, 9);
    expect(g.ambience).toBeCloseTo(dbToGain(BUS_DEFAULT_DB.ambience) * 0.64, 9);
    expect(gainToDb(g.ui)).toBeCloseTo(BUS_DEFAULT_DB.ui + 20 * Math.log10(0.36), 9);
    expect(busGains({ ...DEFAULTS, muted: true }).master).toBe(0);
    expect(busGains({ ...DEFAULTS, musicMode: 'off' }).music).toBe(0);
    expect(busGains({ ...DEFAULTS, effects: 0 }).effects).toBe(0);
  });
});

describe('distance and occlusion (GDD 08 §13.3)', () => {
  it('inverse model: unity inside ref, falls with rolloff, clamps at max', () => {
    const f = DISTANCE.foley;
    expect(inverseDistanceGain(0, f)).toBe(1);
    expect(inverseDistanceGain(3, f)).toBe(1);
    expect(inverseDistanceGain(13, f)).toBeCloseTo(3 / (3 + 1.2 * 10), 9);
    expect(inverseDistanceGain(100, f)).toBe(inverseDistanceGain(40, f));
    const g = DISTANCE.giant;
    expect(inverseDistanceGain(1500, g)).toBeCloseTo(150 / (150 + 0.8 * 1350), 9);
    // giants carry much further than foley
    expect(inverseDistanceGain(40, g)).toBeGreaterThan(inverseDistanceGain(40, f));
  });
  it('E16: at depth 12 BU the surface bed is low-passed at 1500 Hz and -18 dB', () => {
    const o = surfaceOcclusion(12, true);
    expect(o.cutoffHz).toBeCloseTo(1500, 6);
    expect(o.gainDb).toBeCloseTo(-18, 9);
  });
  it('occlusion floors and the open surface', () => {
    expect(surfaceOcclusion(100, true)).toEqual({ cutoffHz: 250, gainDb: -24 });
    expect(surfaceOcclusion(12, false).gainDb).toBe(0);
    expect(surfaceOcclusion(0, true).cutoffHz).toBeGreaterThanOrEqual(6000);
  });
});

describe('cue mapping (GDD 08 §13.5-13.6)', () => {
  it('every simulation cue id has a sound or a deliberate silent entry', () => {
    for (const id of CUE_IDS) {
      const s = CUE_SOUNDS[id];
      expect(s, id).toBeDefined();
      if (s.silent) { expect(s.note, `${id} silent without reason`).toBeTruthy(); continue; }
      expect(s.synth !== null || s.files.length > 0, id).toBe(true);
    }
    expect(CUE_SOUNDS.death.silent).toBe(true);
  });
  it('every file-based cue has a synth fallback (the code never depends on one file existing)', () => {
    const all = [...Object.values(CUE_SOUNDS), ...Object.values(GIANT_ONESHOTS)];
    for (const s of all) if (!s.silent && s.files.length > 0) expect(s.synth).not.toBeNull();
  });
  it('synth ids and file ids are known (files exist in the manifest)', () => {
    const ids = new Set((manifest as { assets: { id: string }[] }).assets.map((a) => a.id));
    for (const f of [...ALL_SFX_IDS, ...ALL_BED_IDS]) expect(ids.has(f), f).toBe(true);
    const synth = new Set<string>(SYNTH_ONESHOTS);
    for (const s of [...Object.values(CUE_SOUNDS), ...Object.values(GIANT_ONESHOTS)]) if (s.synth) expect(synth.has(s.synth), s.synth).toBe(true);
  });
  it('namespaced cues resolve: dig-bite.<material> for every material, giant.<kind> for every human event', () => {
    for (const m of MATERIALS) {
      const r = resolveCue(`dig-bite.${m}`);
      expect(r, m).not.toBeNull();
      expect(r!.key).toBe(m.startsWith('wood') || m === 'bark' ? 'wood-chew' : 'dig-bite');
    }
    for (const k of HUMAN_EVENT_KINDS) expect(resolveCue(`giant.${k}`)?.sound.bus, k).toBe('giants');
    expect(resolveCue('ambient.cricket')?.key).toBe('ambient.cricket');
    expect(resolveCue('ambient.nonsense')).toBeNull();
    expect(resolveCue('no-such-cue')).toBeNull();
  });
  it('variations: gravel steps use grit files, swarms use buzz files, raindrop pitch by size', () => {
    expect(resolveCue('step', 1, 'gravel')!.sound.files.length).toBe(3);
    expect(resolveCue('step', 1, 'loam')!.sound.files.length).toBe(0);
    expect(resolveCue('wing-buzz', 0.9)!.sound.mode).toBe('file');
    expect(resolveCue('wing-buzz', 0.2)!.sound.mode).toBe('synth');
    expect(raindropSemis(0)).toBe(12);
    expect(raindropSemis(1)).toBe(-5);
  });
});

describe('voice limiting (GDD 08 §13.3)', () => {
  it('caps total voices and steals the quietest of the lowest priority', () => {
    const t = new VoiceTable(3);
    const ids = [t.add('a', 1, 0.5, 10), t.add('b', 1, 0.1, 10), t.add('c', 2, 0.05, 10)];
    const adm = t.admit('d', 1, 0.3, 4, 0);
    expect(adm.ok).toBe(true);
    expect(adm.steal).toBe(ids[1]); // quietest at priority 1 (not the quieter priority-2 voice)
    expect(t.admit('d', 1, 0.01, 4, 0).ok).toBe(false); // quieter than every candidate
    expect(t.admit('d', 4, 0.01, 4, 0).steal).toBe(ids[1]); // possessed beats everything
  });
  it('per-cue cap replaces the quietest voice of the same cue', () => {
    const t = new VoiceTable(24);
    const a = t.add('step', 1, 0.2, 10);
    t.add('step', 1, 0.4, 10);
    expect(t.admit('step', 1, 0.3, 2, 0).steal).toBe(a);
    expect(t.admit('step', 1, 0.1, 2, 0).ok).toBe(false);
    expect(t.admit('bite', 1, 0.1, 2, 0)).toEqual({ ok: true, steal: -1 });
  });
  it('ended voices free their slots', () => {
    const t = new VoiceTable(1);
    t.add('a', 1, 1, 0.5);
    expect(t.admit('b', 1, 0.1, 4, 0.4).ok).toBe(false);
    expect(t.admit('b', 1, 0.1, 4, 0.6)).toEqual({ ok: true, steal: -1 });
  });
  it('32 requests in a burst never exceed the voice limit', () => {
    const t = new VoiceTable(24);
    for (let i = 0; i < 32; i++) {
      const a = t.admit(`c${i % 8}`, 1 + (i % 3), Math.random(), 4, 0);
      if (!a.ok) continue;
      if (a.steal >= 0) t.remove(a.steal, true);
      t.add(`c${i % 8}`, 1 + (i % 3), 0.5, 10);
      expect(t.active).toBeLessThanOrEqual(24);
    }
    expect(t.active).toBeLessThanOrEqual(24);
  });
  it('crowd meter turns a flood of steps into a texture', () => {
    const m = new CrowdMeter(0.5, 6);
    let single = 0;
    for (let i = 0; i < 40; i++) if (m.note(i * 0.01)) single++;
    expect(single).toBe(3); // 3 per 0.5 s window = 6 per second
    expect(m.rate(0.39)).toBeGreaterThan(60);
    expect(m.rate(5)).toBe(0);
  });
});

describe('alert sound gate (GDD 08 §6.3, §13.8; App. E 4, 27)', () => {
  const raise = (kind: string, level: 'info' | 'notice' | 'warning' | 'critical', subjectId = 1) => ({ op: 'raise' as const, kind, subjectId, level });
  it('E4: 5 raises of the same key sound once', () => {
    const g = new AlertSoundGate();
    const played = [0, 1, 2, 3, 4].map((i) => g.decide(raise('food-c-low', 'warning'), i * 10, i * 100, false));
    expect(played.filter((x) => x !== null)).toEqual(['warning']);
  });
  it('escalation re-sounds; info never sounds', () => {
    const g = new AlertSoundGate();
    expect(g.decide(raise('nest-flooding', 'warning'), 0, 0, false)).toBe('warning');
    expect(g.decide(raise('nest-flooding', 'critical'), 1, 10, false)).toBe('critical');
    expect(g.decide(raise('autosave', 'info'), 2, 20, false)).toBeNull();
  });
  it('E27: with the HUD hidden only critical sounds', () => {
    const g = new AlertSoundGate();
    expect(g.decide(raise('food-p-low', 'warning'), 0, 0, true)).toBeNull();
    expect(g.decide(raise('queen-in-danger', 'critical'), 1, 0, true)).toBe('critical');
  });
  it('rate cap of 4 per 30 s (critical exempt), and cooldown after clear', () => {
    const g = new AlertSoundGate();
    const n = [1, 2, 3, 4, 5, 6].map((i) => g.decide(raise('source-found', 'notice', i), i, 0, false)).filter(Boolean).length;
    expect(n).toBe(4);
    expect(g.decide(raise('queen-in-danger', 'critical', 9), 7, 0, false)).toBe('critical');
    const h = new AlertSoundGate();
    expect(h.decide(raise('trail-lost', 'notice'), 0, 0, false)).toBe('notice');
    h.decide({ op: 'clear', kind: 'trail-lost', subjectId: 1, level: 'notice' }, 1, 100, false);
    expect(h.decide(raise('trail-lost', 'notice'), 100, 200, false)).toBeNull(); // within 3 game h
    h.decide({ op: 'clear', kind: 'trail-lost', subjectId: 1, level: 'notice' }, 150, 300, false);
    expect(h.decide(raise('trail-lost', 'notice'), 200, 300 + 3 * 250, false)).toBe('notice');
  });
});
