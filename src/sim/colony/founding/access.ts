// Shared lookups of the founding module: the opening record, the founding queen and her nest, the module's
// scratch numbers on the queen (ant.bb, numbers only, so saves stay exact) and the phase change.

import type { Ant, Colony, Nest, OpeningPhase, OpeningState, Sim, SpeciesDef } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';

/** Keys of the founding module's scratch values on the queen (ant.bb). */
export const FB = {
  phaseTick: 'fd.phaseTick',
  stillTicks: 'fd.still',
  sniffTicks: 'fd.sniff',
  siteX: 'fd.siteX', siteY: 'fd.siteY', siteZ: 'fd.siteZ', siteTick: 'fd.siteTick',
  biteStart: 'fd.biteStart',
  bites: 'fd.bites',
  careTick: 'fd.careTick',
  cannibalTick: 'fd.cannibalTick',
  hazardTick: 'fd.hazardTick',
  broodLostTick: 'fd.broodLostTick',
  relayClutch: 'fd.relay',
  /** cheat.completeFounding: run every remaining step automatically (1) and the clutch to aim for. */
  auto: 'fd.auto',
  autoClutch: 'fd.autoClutch',
  readinessTick: 'fd.readyTick',
  /** Workers the queen helped out of their cocoons, and brood she ate (overlay counters). */
  eclosed: 'fd.eclosed',
  eaten: 'fd.eaten',
  /** The dig site has been assessed (its reading holds from then on). */
  digSite: 'fd.digSite',
  /** Raw readings of the last site read-out: deep soil moisture 0..1 and cell temperature, C. */
  siteTheta: 'fd.siteTheta',
  siteTempC: 'fd.siteTempC',
  /** The passive player's automatic batch was laid (the lapse begins once it is done, GDD 06 §5.1). */
  autoLaid: 'fd.autoLaid',
  /** Eggs of earlier clutches (the extra clutch after total brood loss counts its own eggs from 0). */
  earlierEggs: 'fd.earlierEggs',
} as const;

export function openingOf(sim: Sim): OpeningState | null {
  return sim.state.player.opening;
}

export function playerColonyOf(sim: Sim): Colony | undefined {
  const c = sim.stores.colonies.get(sim.state.player.colonyId) ?? sim.state.colonies[0];
  return c && c.alive ? c : undefined;
}

/** The player colony's queen while she is a founding queen (queen.founding set), else undefined. */
export function foundingQueen(sim: Sim): Ant | undefined {
  const col = playerColonyOf(sim);
  const q = col ? sim.stores.ants.get(col.queenId) : undefined;
  return q && q.alive && q.queen && q.queen.founding ? q : undefined;
}

/** The player colony's queen (alive or not yet removed), founding or not. */
export function queenOf(sim: Sim): Ant | undefined {
  const col = playerColonyOf(sim);
  return col ? sim.stores.ants.get(col.queenId) : undefined;
}

/** The colony's founding nest record (its first nest). */
export function foundingNest(sim: Sim): Nest | undefined {
  const col = playerColonyOf(sim);
  if (!col) return undefined;
  for (const id of col.nestIds) {
    const n = sim.stores.nests.get(id);
    if (n && n.alive) return n;
  }
  return undefined;
}

export function speciesOf(sim: Sim): SpeciesDef {
  const col = playerColonyOf(sim);
  return (col ? sim.getSpecies(col.species) : undefined) ?? sim.species;
}

export function bbGet(a: Ant, key: string, fallback = -1): number {
  const v = a.bb[key];
  return v === undefined ? fallback : v;
}

export function bbSet(a: Ant, key: string, v: number): void {
  a.bb[key] = v;
}

/** Removes every founding scratch value from the queen (hand-over). */
export function bbClear(a: Ant): void {
  for (const k of Object.keys(a.bb)) if (k.startsWith('fd.')) delete a.bb[k];
}

/** Game days since the queen entered the current phase. */
export function phaseAgeGd(sim: Sim, q: Ant | undefined): number {
  if (!q) return 0;
  return (sim.state.tick - bbGet(q, FB.phaseTick, sim.state.tick)) / TICKS_PER_DAY;
}

/** Changes the opening phase (event `opening.phase`), stamping the entry tick on the queen. */
export function setPhase(sim: Sim, op: OpeningState, to: OpeningPhase): void {
  const from = op.phase;
  if (from === to) return;
  op.phase = to;
  if (to === 'done') op.done = true;
  const q = queenOf(sim);
  if (q && q.alive) bbSet(q, FB.phaseTick, sim.state.tick);
  sim.emit({ type: 'opening.phase', from, to });
}

/** Above-ground walkers: on the surface medium, or not below the terrain. */
export function isAboveGround(sim: Sim, a: Ant): boolean {
  if (a.medium === 'surface' || a.medium === 'air') return sim.field.substrate(a.pos) >= 0 || a.nestId < 0;
  return false;
}

/** Depth of the walker below the local ground height, mm (0 on the surface). */
export function depthBelowGround(sim: Sim, a: Ant): number {
  return Math.max(0, sim.field.height(a.pos.x, a.pos.z) - a.pos.y);
}
