// Offline renders of whole scenes for the loudness ruling (design directions §K): calm surface day, calm
// underground, rain, a giant footstep beside the listener, night, and the possessed ant's quiet foley against the
// calm bed. Each is rendered on an OfflineAudioContext through the real runtime and measured with the BS.1770
// estimator (src/audio/loudness.ts); the numbers are checked against src/audio/loudnessTargets.ts.
import { ALL_BED_IDS } from '@/audio/assetIds';
import type { AudioBytesSource } from '@/audio/engine/buffers';
import { measure, shortTermLoudness, truePeakDb } from '@/audio/loudness';
import { FOLEY_WITHIN_LU, judge, LOUDNESS_TARGETS } from '@/audio/loudnessTargets';
import { AudioRuntime } from '@/audio';
import { LAYER_IDS } from '@/audio/ambience/layers';
import { newAmbienceTarget } from '@/audio/ambience/matrix';
import { ambienceInput, frameFor, MIX, SR, type AmbienceState } from './offline';

const BU = 4;
/** Seconds skipped at the start of a render (ambience fade-in, loop start). */
const SETTLE_S = 3;

interface Scene {
  id: string;
  seconds: number;
  ambience: AmbienceState | null;
  /** Extra setup on the runtime (listener, giants, scheduled cues). */
  setup?: (rt: AudioRuntime, ctx: OfflineAudioContext) => void;
}

const CALM: AmbienceState = { group: 'open-green', hour: 13, weather: 'clear' };

/** Runs `fn` when the offline render reaches `t` (suspend / resume), so cues start at their own time. */
function at(ctx: OfflineAudioContext, t: number, fn: () => void): void {
  void ctx.suspend(t).then(() => { fn(); void ctx.resume(); });
}

const SCENES: Scene[] = [
  { id: 'calm-surface-day', seconds: 33, ambience: CALM },
  // brood chamber: 10 BU down, 30 nest-mates within 16 BU, not damp
  { id: 'calm-underground', seconds: 33, ambience: { group: 'open-green', hour: 13, weather: 'clear', depthBu: 10, nearAnts: 30, humidity: 0.6 } },
  { id: 'rain-surface', seconds: 33, ambience: { group: 'open-green', hour: 13, weather: 'rain', precip: 0.8 } },
  { id: 'night-surface', seconds: 33, ambience: { group: 'open-green', hour: 2, weather: 'clear' } },
  {
    id: 'human-footstep-peak', seconds: 14, ambience: CALM,
    setup: (rt, ctx) => {
      const at40 = { x: 0, y: 0, z: 40 * BU };
      rt.giants.telegraph(1, 'footsteps', at40, 2);
      rt.giants.start(1, 'footsteps', null);
      at(ctx, 6, () => rt.giants.impact(1, 'footsteps', at40));
      at(ctx, 9, () => rt.giants.impact(1, 'footsteps', { x: 0, y: 0, z: 30 * BU }));
    },
  },
];

export interface SceneRow {
  id: string;
  integratedLufs: number;
  shortTermMaxLufs: number;
  truePeakDb: number;
  /** The figure the target is about (integrated or short-term max), and the verdict. */
  measuredLufs: number;
  ok: boolean;
  problems: string[];
  targetLufs: number;
  tol: number;
}

async function renderScene(bytes: AudioBytesSource | null, s: Scene, master = MIX): Promise<Float32Array[]> {
  const ctx = new OfflineAudioContext(2, Math.round(SR * s.seconds), SR);
  const rt = new AudioRuntime(ctx, { bytes, seed: 11 });
  rt.applySettings(master);
  await rt.preloadEffects();
  await rt.bank.preload(ALL_BED_IDS);
  const l = rt.listener;
  l.bu = BU;
  l.pos = { x: 0, y: 2, z: 0 };
  l.hear = { x: 0, y: 2, z: 0 };
  if (s.ambience) {
    const inp = ambienceInput(s.ambience);
    l.underground = inp.underground;
    l.depthBu = inp.depthBu;
    rt.update(0, frameFor(inp), s.seconds);
  }
  s.setup?.(rt, ctx);
  const buf = await ctx.startRendering();
  return [buf.getChannelData(0), buf.getChannelData(1)];
}

/** Renders and measures every scene of the loudness ruling. */
export async function runLoudnessScenes(bytes: AudioBytesSource | null, only: string[] | null = null): Promise<SceneRow[]> {
  const rows: SceneRow[] = [];
  for (const target of LOUDNESS_TARGETS) {
    if (only && !only.includes(target.id)) continue;
    const s = SCENES.find((x) => x.id === target.id);
    if (!s) throw new Error(`no scene for target ${target.id}`);
    const ch = await renderScene(bytes, s);
    const m = measure(ch, SR, { fromS: SETTLE_S });
    const measured = target.measure === 'integrated' ? m.integratedLufs : m.shortTermMaxLufs;
    const v = judge(target, measured, m.truePeakDb);
    rows.push({
      id: target.id, integratedLufs: round1(m.integratedLufs), shortTermMaxLufs: round1(m.shortTermMaxLufs), truePeakDb: round1(m.truePeakDb),
      measuredLufs: round1(measured), ok: v.ok, problems: v.problems, targetLufs: target.lufs, tol: target.tol,
    });
  }
  return rows;
}

// ---- quiet foley against the calm bed ----------------------------------------------------------------------------

type Foley = 'step' | 'pick-up' | 'drop' | 'dig-bite.loam';

interface FoleyPattern { id: string; events: { t: number; cue: Foley }[]; seconds: number }

/** The possessed ant's own sounds as they happen in play: ~4.5 steps/s walking, a pick-up and drop, ~2.5 bites/s digging. */
export const FOLEY_PATTERNS: FoleyPattern[] = [
  { id: 'steps', seconds: 5, events: Array.from({ length: 20 }, (_, i) => ({ t: 0.3 + i * 0.22, cue: 'step' as const })) },
  { id: 'pick-up-drop', seconds: 5, events: [0.4, 1.9, 3.4].flatMap((t) => [{ t, cue: 'pick-up' as const }, { t: t + 0.7, cue: 'drop' as const }]) },
  { id: 'dig-bite', seconds: 5, events: Array.from({ length: 10 }, (_, i) => ({ t: 0.3 + i * 0.4, cue: 'dig-bite.loam' as const })) },
  {
    id: 'walk-pick-dig', seconds: 7,
    events: [
      ...Array.from({ length: 12 }, (_, i) => ({ t: 0.3 + i * 0.22, cue: 'step' as const })),
      { t: 3.2, cue: 'pick-up' as const }, { t: 4, cue: 'drop' as const },
      ...Array.from({ length: 6 }, (_, i) => ({ t: 4.6 + i * 0.4, cue: 'dig-bite.loam' as const })),
    ],
  },
];

export interface FoleyRow {
  id: string;
  shortTermLufs: number;
  bedLufs: number;
  deltaLu: number;
  /** Peak of the pattern alone, dBFS. */
  peakDb: number;
  ok: boolean;
}

async function renderFoley(bytes: AudioBytesSource | null, p: FoleyPattern, withBed: boolean): Promise<Float32Array[]> {
  const ctx = new OfflineAudioContext(2, Math.round(SR * p.seconds), SR);
  const rt = new AudioRuntime(ctx, { bytes, seed: 11 });
  rt.applySettings(MIX);
  await rt.preloadEffects();
  if (withBed) await rt.bank.preload(ALL_BED_IDS);
  const l = rt.listener;
  l.bu = BU;
  l.pos = { x: 0, y: 2, z: 0 };
  l.hear = { x: 0, y: 2, z: 0 };
  l.possessedPos = { x: 0, y: 0, z: 0 };
  if (withBed) rt.update(0, frameFor(ambienceInput(CALM)), p.seconds);
  for (const e of p.events) at(ctx, e.t, () => rt.cues.cue(e.cue, { x: 1.5, y: 0, z: 2.5 }, 1, 'loam'));
  const buf = await ctx.startRendering();
  return [buf.getChannelData(0), buf.getChannelData(1)];
}

/** Foley alone (its own short-term loudness over the active stretch) against the calm bed's level. */
export async function runFoleyAgainstBed(bytes: AudioBytesSource | null, bedLufs: number): Promise<FoleyRow[]> {
  const rows: FoleyRow[] = [];
  for (const p of FOLEY_PATTERNS) {
    const ch = await renderFoley(bytes, p, false);
    const last = Math.max(...p.events.map((e) => e.t)) + 0.4;
    const st = shortTermLoudness(ch, SR, { fromS: 0, toS: Math.min(p.seconds, last) });
    const level = st.max;
    const delta = level - bedLufs;
    rows.push({ id: p.id, shortTermLufs: round1(level), bedLufs: round1(bedLufs), deltaLu: round1(delta), peakDb: round1(truePeakDb(ch, { fs: SR })), ok: Math.abs(delta) <= FOLEY_WITHIN_LU });
  }
  return rows;
}

/** A calm bed with the combined foley on top, as one stereo render (for listening / the spectrum). */
export async function renderBedWithFoley(bytes: AudioBytesSource | null): Promise<Float32Array[]> {
  return renderFoley(bytes, FOLEY_PATTERNS[FOLEY_PATTERNS.length - 1], true);
}

const round1 = (x: number) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : x);

// ---- per-layer levels (tuning aid) -----------------------------------------------------------------------------

export interface LayerRow { layer: string; integratedLufs: number; source: string }

/** Every ambience layer alone at matrix gain 1.0 (through the ambience bus), for choosing the per-layer trims. */
export async function runLayerLevels(bytes: AudioBytesSource | null): Promise<LayerRow[]> {
  const rows: LayerRow[] = [];
  for (const id of LAYER_IDS) {
    const ctx = new OfflineAudioContext(2, Math.round(SR * 20), SR);
    const rt = new AudioRuntime(ctx, { bytes, seed: 11 });
    rt.applySettings(MIX);
    await rt.bank.preload(ALL_BED_IDS);
    const target = newAmbienceTarget();
    target.layers[id] = 1;
    target.surface = { cutoffHz: 20000, gainDb: 0 };
    rt.ambience.update(target, 20);
    const buf = await ctx.startRendering();
    const m = measure([buf.getChannelData(0), buf.getChannelData(1)], SR, { fromS: SETTLE_S });
    rows.push({ layer: id, integratedLufs: round1(m.integratedLufs), source: JSON.stringify(rt.ambience.sources()) });
  }
  return rows;
}
