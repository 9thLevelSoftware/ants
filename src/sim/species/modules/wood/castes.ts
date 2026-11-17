// Age-gated polymorphism of a wood-nesting colony (GDD 07 §2.6, §5.2.2): worker eggs are minors (the first brood
// nanitic minors), and at larva start a larva may be destined `media` or `major` once the colony is old and large
// enough (CasteDef.unlock), following the caste-mix target that ramps in over casteRampYears, the directive
// casteEmphasis and the major P gate (MAJOR_GATE_GD). Emits `caste-unlocked` the first time a caste is destined.

import type { Brood, CasteDef, Colony, Sim, SpeciesDef } from '@/sim/types';
import { rngFloat } from '@/core/rng';
import { CASTE_EMPHASIS_SPAN, MAJOR_GATE_GD } from '@/sim/balance/species-carpenter';
import { NANITIC_SCALE } from '@/sim/balance/colony';
import { larvaFood } from '@/sim/colony/life';
import { ticksPerYear } from '@/sim/time';
import type { WoodParams } from './params';

type WorkerCaste = 'minor' | 'media' | 'major';
const LARGE: readonly WorkerCaste[] = ['media', 'major'];

/** Colony age in game years. */
export function colonyAgeYears(sim: Sim, col: Colony): number {
  return Math.max(0, sim.state.tick - col.foundedTick) / ticksPerYear(sim.state.config);
}

function casteDef(def: SpeciesDef, c: WorkerCaste): CasteDef | undefined {
  return def.castes.find((x) => x.caste === c);
}

/** Adult workers of the colony (the colony core's cache, else a count). */
export function adultWorkers(sim: Sim, col: Colony): number {
  if (col.core) return col.core.workers;
  let n = 0;
  for (const a of sim.stores.ants.list) if (a.alive && a.colony === col.id && (a.caste === 'minor' || a.caste === 'media' || a.caste === 'major' || a.caste === 'worker')) n++;
  return n;
}

/** Is a large caste unlocked for this colony now (CasteDef.unlock: workers and colony age)? */
export function casteUnlocked(sim: Sim, def: SpeciesDef, col: Colony, c: WorkerCaste): boolean {
  const cd = casteDef(def, c);
  if (!cd) return false;
  return adultWorkers(sim, col) >= cd.unlock.minWorkers && colonyAgeYears(sim, col) >= cd.unlock.minColonyAgeYears;
}

/** Target shares (minor, media, major) now: minors only before the unlock, then the table row ramped in. */
export function casteTarget(sim: Sim, def: SpeciesDef, col: Colony, p: WoodParams): [number, number, number] {
  if (!casteUnlocked(sim, def, col, 'media') && !casteUnlocked(sim, def, col, 'major')) return [1, 0, 0];
  const n = adultWorkers(sim, col);
  let row = def.life.casteMixTarget[0];
  for (const r of def.life.casteMixTarget) if (n >= r[0]) row = r;
  const unlockAge = Math.min(...LARGE.map((c) => casteDef(def, c)?.unlock.minColonyAgeYears ?? 0));
  const ramp = Math.max(0, Math.min(1, (colonyAgeYears(sim, col) - unlockAge) / Math.max(1e-6, p.casteRampYears)));
  let media = row[2] * ramp, major = row[3] * ramp;
  if (!casteUnlocked(sim, def, col, 'media')) media = 0;
  if (!casteUnlocked(sim, def, col, 'major')) major = 0;
  major *= 1 + CASTE_EMPHASIS_SPAN * Math.max(-1, Math.min(1, col.directives.casteEmphasis ?? 0));
  const minor = Math.max(0, 1 - media - major);
  return [minor, media, major];
}

/** Current worker mix: adults plus larvae and pupae already destined (minor, media, major counts). */
function currentMix(sim: Sim, col: Colony): [number, number, number] {
  const m: [number, number, number] = [0, 0, 0];
  const add = (c: string) => { if (c === 'minor' || c === 'worker') m[0]++; else if (c === 'media') m[1]++; else if (c === 'major') m[2]++; };
  for (const a of sim.stores.ants.list) if (a.alive && a.colony === col.id) add(a.caste);
  for (const b of sim.stores.brood.list) if (b.alive && b.colony === col.id && b.stage !== 'egg' && b.destinedLengthBu !== 1) add(b.destined);
  return m;
}

/** Does the P store cover MAJOR_GATE_GD game days of the larvae's protein demand (§2.6)? */
export function majorGateOpen(sim: Sim, def: SpeciesDef, col: Colony): boolean {
  let perGd = 0;
  for (const b of sim.stores.brood.list) {
    if (!b.alive || b.colony !== col.id || b.stage !== 'larva') continue;
    perGd += larvaFood(def, b.destined, b.destinedLengthBu).p / Math.max(1e-6, def.life.stageGd.larva);
  }
  return col.stores.p >= MAJOR_GATE_GD * perGd;
}

/** Triangular draw (min, mean as mode, max), BU. */
function drawLength(sim: Sim, cd: CasteDef | undefined, _nanitic: boolean): number {
  const L = cd?.lengthBu ?? { min: 1, mean: 1, max: 1 };
  const u = rngFloat(sim.stream('rng.brood'));
  const { min: a, mean: c, max: b } = L;
  if (b <= a) return c;
  const f = (c - a) / (b - a);
  const x = u < f ? a + Math.sqrt(u * (b - a) * (c - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - c));
  // 1 is the "undecided" marker of destinedLengthBu: never store exactly 1
  return x === 1 ? 1 + 1e-6 : x;
}

/**
 * One pass over a colony's brood: worker eggs become minors; a larva not yet sized gets its caste and length.
 * Returns the castes destined for the first time (for `caste-unlocked`).
 */
export function assignCastes(sim: Sim, def: SpeciesDef, col: Colony, p: WoodParams, seen: Set<string>): WorkerCaste[] {
  const unlocked: WorkerCaste[] = [];
  let target: [number, number, number] | null = null, mix: [number, number, number] | null = null, gate: boolean | null = null;
  for (const b of sim.stores.brood.list) {
    if (!b.alive || b.colony !== col.id) continue;
    if (b.destined === 'worker') b.destined = 'minor';
    if (b.stage !== 'larva' || b.destinedLengthBu !== 1 || (b.destined !== 'minor' && b.destined !== 'media' && b.destined !== 'major')) continue;
    const nanitic = (b.flags & 8) !== 0; // BroodFlag.NANITIC
    let caste: WorkerCaste = 'minor';
    if (!nanitic) {
      target ??= casteTarget(sim, def, col, p);
      mix ??= currentMix(sim, col);
      const total = mix[0] + mix[1] + mix[2] + 1;
      const deficit = (i: number) => target![i] - mix![i] / total;
      const order: [WorkerCaste, number][] = [['major', 2], ['media', 1], ['minor', 0]];
      let best: [WorkerCaste, number] = ['minor', 0];
      for (const o of order) if (target[o[1]] > 0 && deficit(o[1]) > deficit(best[1]) + 1e-9) best = o;
      caste = best[0];
      if (caste === 'major') { gate ??= majorGateOpen(sim, def, col); if (!gate) caste = target[1] > 0 ? 'media' : 'minor'; }
      mix[caste === 'minor' ? 0 : caste === 'media' ? 1 : 2]++;
    }
    setCaste(sim, def, b, caste, nanitic);
    if (caste !== 'minor' && !seen.has(caste)) { seen.add(caste); unlocked.push(caste); }
  }
  return unlocked;
}

function setCaste(sim: Sim, def: SpeciesDef, b: Brood, caste: WorkerCaste, nanitic: boolean): void {
  b.destined = caste;
  // nanitics: the colony module sizes them at eclosion (NANITIC_SCALE x the caste mean); the length here only sets
  // their (smaller) larval food
  const mean = casteDef(def, caste)?.lengthBu.mean ?? 1;
  b.destinedLengthBu = nanitic ? NANITIC_SCALE * mean : drawLength(sim, casteDef(def, caste), false);
}
