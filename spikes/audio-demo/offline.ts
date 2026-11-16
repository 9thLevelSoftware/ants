// Offline renders of the real audio runtime (OfflineAudioContext): cues, ambience states, loop boundaries, giants,
// UI sounds and music, each analysed (analysis.ts). Used by the demo page and by scripts/analyse.mjs.
import { AudioRuntime, type RuntimeFrame } from '@/audio';
import { ALL_BED_IDS, BED_FILES } from '@/audio/assetIds';
import type { AmbienceInput, HabitatGroup } from '@/audio/ambience/matrix';
import { newAmbienceInput } from '@/audio/simAdapter';
import { LoopPlayer } from '@/audio/engine/loopPlayer';
import { loopRegion } from '@/audio/loopSchedule';
import { LOOP } from '@/audio/tuning';
import type { AudioBytesSource } from '@/audio/engine/buffers';
import type { UiSoundId } from '@/audio/uiSounds';
import type { HumanEventKind, Season, WeatherState } from '@/sim/types/ids';
import { analyse, continuity, type Analysis } from './analysis';

export const SR = 48000;
const BU = 4;
export const MIX = { master: 1, ambience: 0.8, effects: 0.9, giants: 0.9, ui: 0.6, music: 0.5, muted: false, musicMode: 'sparse' as const, mono: false };

export interface AmbienceState {
  group: HabitatGroup;
  hour: number;
  weather: WeatherState;
  depthBu?: number;
  nearAnts?: number;
  humidity?: number | null;
  woodNest?: boolean;
  /** Precipitation 0..1 (default 0.6; 1 = downpour). */
  precip?: number;
}

export function frameFor(amb: AmbienceInput | null, season: Season = 'summer'): RuntimeFrame {
  return { ambience: amb, paused: false, criticalActive: false, calmS: 0, season, combat: false, musicMode: 'off' };
}

export function ambienceInput(s: AmbienceState): AmbienceInput {
  const a = newAmbienceInput();
  for (const g of Object.keys(a.groups) as HabitatGroup[]) a.groups[g] = g === s.group ? 1 : 0;
  a.hour = s.hour; a.sunrise = 6; a.sunset = 20; a.weather = s.weather; a.precip = s.precip ?? 0.6;
  a.underground = (s.depthBu ?? 0) > 0; a.depthBu = s.depthBu ?? 0;
  a.nearAnts = s.nearAnts ?? 0; a.humidity = s.humidity ?? null; a.woodNest = !!s.woodNest; a.colonyAnts = s.woodNest ? 400 : 0;
  return a;
}

export async function offline(bytes: AudioBytesSource | null, seconds: number, beds: boolean) {
  const ctx = new OfflineAudioContext(2, Math.round(SR * seconds), SR);
  const rt = new AudioRuntime(ctx, { bytes, seed: 11 });
  rt.applySettings(MIX);
  await rt.preloadEffects();
  if (beds) await rt.bank.preload(ALL_BED_IDS);
  const l = rt.listener;
  l.bu = BU;
  l.pos = { x: 0, y: 2, z: 0 }; l.hear = { x: 0, y: 2, z: 0 };
  return { ctx, rt };
}

export type CueSpec =
  | { kind: 'cue'; id: string; distBu?: number; strength?: number; material?: string }
  | { kind: 'ui'; id: UiSoundId }
  | { kind: 'giant'; id: HumanEventKind; variant?: string }
  | { kind: 'thunder' }
  | { kind: 'music'; season: Season };

export function specName(s: CueSpec): string {
  if (s.kind === 'cue') return s.id + (s.material ? `/${s.material}` : '') + (s.strength !== undefined ? `@${s.strength}` : '');
  if (s.kind === 'thunder') return 'thunder';
  if (s.kind === 'music') return `music/${s.season}`;
  return `${s.kind}.${s.id}${s.kind === 'giant' && s.variant ? `/${s.variant}` : ''}`;
}

export interface CueResult { name: string; analysis: Analysis; log: string[] }

/** Renders one sound on its own (no ambience) and analyses it. */
export async function renderCue(bytes: AudioBytesSource | null, spec: CueSpec): Promise<CueResult> {
  const seconds = spec.kind === 'giant' || spec.kind === 'thunder' ? 9 : spec.kind === 'music' ? 22 : 3;
  const { ctx, rt } = await offline(bytes, seconds, spec.kind === 'giant');
  if (spec.kind === 'cue') rt.cues.cue(spec.id, { x: (spec.distBu ?? 2) * BU, y: 0.5, z: 0 }, spec.strength ?? 1, spec.material ?? null);
  else if (spec.kind === 'ui') rt.ui.play(spec.id);
  else if (spec.kind === 'thunder') rt.giants.thunder(0.2, 0.9);
  else if (spec.kind === 'music') rt.playMusic(spec.season, 'sparse', 'demo');
  else {
    const at = { x: 120 * BU, y: 0, z: 40 * BU };
    rt.giants.telegraph(1, spec.id, at, 2);
    rt.giants.start(1, spec.id, spec.variant ?? null);
    rt.giants.impact(1, spec.id, at);
  }
  rt.update(0, frameFor(null), seconds);
  const buf = await ctx.startRendering();
  return { name: specName(spec), analysis: analyse(buf), log: rt.log.list().map((e) => `${e.cue} ${e.source}`) };
}

export interface AmbienceResult { name: string; analysis: Analysis; sources: Record<string, string> }

export function ambienceName(s: AmbienceState): string {
  return `${s.group} h${s.hour} ${s.weather}${s.depthBu ? ` d${s.depthBu}` : ''}${s.woodNest ? ' wood' : ''}`;
}

/** Renders an ambience state for `seconds` and analyses the steady part (after the fades). */
export async function renderAmbience(bytes: AudioBytesSource | null, s: AmbienceState, seconds = 6): Promise<AmbienceResult> {
  const { ctx, rt } = await offline(bytes, seconds, true);
  const inp = ambienceInput(s);
  rt.listener.underground = inp.underground;
  rt.listener.depthBu = inp.depthBu;
  rt.update(0, frameFor(inp), seconds);
  const sources = rt.ambience.sources();
  const buf = await ctx.startRendering();
  return { name: ambienceName(s), analysis: analyse(buf, 2), sources };
}

export interface Continuity { stepRatio: number; rmsDipRatio: number }
export interface LoopResult {
  file: string;
  /** Crossfaded loop over its boundary region, and the same measures where one pass plays alone (control). */
  crossfade: Continuity;
  control: Continuity;
  /** No discontinuity: step <= 1.5 x the worst control step and dip >= 0.5 x the lowest control dip. */
  ok: boolean;
  /** The raw file looping on itself (`loop = true`) over its wrap, with its own control; flagged = the defect shows. */
  naive: Continuity;
  naiveControl: Continuity;
  naiveFlagged: boolean;
}

const worst = (cs: Continuity[]): Continuity => ({ stepRatio: Math.max(...cs.map((c) => c.stepRatio)), rmsDipRatio: Math.min(...cs.map((c) => c.rmsDipRatio)) });
const passes = (at: Continuity, ctl: Continuity) => at.stepRatio <= ctl.stepRatio * 1.5 && at.rmsDipRatio >= ctl.rmsDipRatio * 0.5;
/** n probe times evenly spread over [a, b]. */
const spread = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => a + ((i + 0.5) * (b - a)) / n);

/** Renders a loop file across a crossfade boundary (the player) and across its raw wrap point (naive loop). */
export async function renderLoopBoundary(bytes: AudioBytesSource, fileId: string): Promise<LoopResult> {
  const seconds = 7;
  const ctx = new OfflineAudioContext(1, SR * seconds, SR);
  const buf = await ctx.decodeAudioData(await bytes.audioData(fileId));
  // player: start at the latest offset so the first crossfade (xfade .. 2 xfade) falls inside the render
  const lp = new LoopPlayer(ctx, buf, 0, 1, 0.05);
  lp.output.connect(ctx.destination);
  lp.pump(seconds);
  const out = await ctx.startRendering();
  const x = loopRegion(buf.duration, LOOP).xfade;
  const crossfade = worst(spread(x, 2 * x, 4).map((t) => continuity(out, t, 0.08, 0.5)));
  const control = worst(spread(2 * x + 0.3, seconds - 0.3, 12).map((t) => continuity(out, t, 0.08, 0.5)));
  // naive: the raw file looping on itself, wrapping 3 s into the render
  const ctx2 = new OfflineAudioContext(1, SR * 7, SR);
  const src = ctx2.createBufferSource();
  src.buffer = await ctx2.decodeAudioData(await bytes.audioData(fileId));
  src.loop = true;
  src.connect(ctx2.destination);
  src.start(0, Math.max(0, buf.duration - 3));
  const out2 = await ctx2.startRendering();
  const naive = continuity(out2, 3, 0.08, 0.5);
  const naiveControl = worst([...spread(0.6, 2.6, 6), ...spread(3.4, 6.7, 6)].map((t) => continuity(out2, t, 0.08, 0.5)));
  return { file: fileId, crossfade, control, ok: passes(crossfade, control), naive, naiveControl, naiveFlagged: !passes(naive, naiveControl) };
}

export const LOOP_FILES: string[] = [...ALL_BED_IDS, 'audio/sfx/lawnmower_loop', 'audio/sfx/lawnmower_push_loop'];
export { BED_FILES };
