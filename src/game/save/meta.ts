// Building and validating save metadata (GDD 08 App. A "Save meta", GDD 06 §15 rule 5). Reads a SimState only.
import { FOUNDRESS_VERSION } from '@/core/version';
import { currentDayOfSeason, currentSeason, currentYear, TICKS_PER_DAY } from '@/sim/time';
import type { SimState } from '@/sim/types';
import { SAVE_VERSION } from '@/sim/save/version';
import { slotOfKey } from './slots';
import type { SaveMeta } from './types';

export interface MetaContext {
  key: string;
  generation: number;
  label: string;
  pinned: boolean;
  playTimeS: number;
  nowMs: number;
  worldFingerprint: number;
  thumbnail: string | null;
  /** The view at save time (restored on load). */
  view?: string;
  camera?: SaveMeta['camera'];
}

const hex4 = (n: number) => (n & 0xffff).toString(16).toUpperCase().padStart(4, '0');

/** "4F7A-21C9" from a uint32 seed (GDD 08 §7.8). */
export function seedCodeOf(seed: number): string {
  const s = seed >>> 0;
  return `${hex4(s >>> 16)}-${hex4(s)}`;
}

/** Simulated workers of the player colony: living ants that are not queen, gyne or male. */
export function populationOf(state: SimState): number {
  const col = state.colonies[0];
  if (!col) return 0;
  let n = 0;
  const ants = state.ants;
  for (let i = 0; i < ants.length; i++) {
    const a = ants[i];
    if (a.alive && a.colony === col.id && a.caste !== 'queen' && a.caste !== 'gyne' && a.caste !== 'male') n++;
  }
  return n;
}

export function dateLabelOf(state: SimState): string {
  const season = currentSeason(state);
  return `${season[0].toUpperCase()}${season.slice(1)} · Day ${currentDayOfSeason(state)} · Year ${currentYear(state)}`;
}

export function buildMeta(state: SimState, ctx: MetaContext): SaveMeta {
  const w = state.config.world;
  return {
    key: ctx.key,
    slot: slotOfKey(ctx.key) ?? 'quick',
    generation: ctx.generation,
    label: ctx.label,
    pinned: ctx.pinned,
    species: state.config.species,
    archetype: w.archetype,
    seed: w.seed >>> 0,
    seedCode: seedCodeOf(w.seed),
    sizeClass: w.sizeClass,
    difficulty: state.config.difficulty.preset,
    stage: state.progression?.stage?.id ?? 'founding',
    tick: state.tick,
    dateLabel: dateLabelOf(state),
    colonyDay: Math.floor(state.tick / TICKS_PER_DAY),
    population: populationOf(state),
    playTimeS: Math.max(0, Math.round(ctx.playTimeS)),
    savedAtIso: new Date(ctx.nowMs).toISOString(),
    savedAtMs: ctx.nowMs,
    saveVersion: SAVE_VERSION,
    generatorVersion: state.generatorVersion,
    worldFingerprint: ctx.worldFingerprint >>> 0,
    appVersion: FOUNDRESS_VERSION,
    thumbnail: ctx.thumbnail,
    ...(ctx.view ? { view: ctx.view } : {}),
    ...(ctx.camera ? { camera: ctx.camera } : {}),
  };
}

const NUMBER_FIELDS: (keyof SaveMeta)[] = [
  'generation', 'seed', 'tick', 'colonyDay', 'population', 'playTimeS', 'savedAtMs', 'saveVersion', 'generatorVersion', 'worldFingerprint',
];
const STRING_FIELDS: (keyof SaveMeta)[] = [
  'key', 'slot', 'label', 'species', 'archetype', 'seedCode', 'sizeClass', 'difficulty', 'stage', 'dateLabel', 'savedAtIso', 'appVersion',
];

/** True when `x` has every field of a SaveMeta with the right primitive type. */
export function isValidMeta(x: unknown): x is SaveMeta {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  for (const f of NUMBER_FIELDS) if (typeof o[f] !== 'number' || !Number.isFinite(o[f] as number)) return false;
  for (const f of STRING_FIELDS) if (typeof o[f] !== 'string') return false;
  return typeof o.pinned === 'boolean' && (o.thumbnail === null || typeof o.thumbnail === 'string');
}
