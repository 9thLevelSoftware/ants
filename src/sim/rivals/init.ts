// New Game: one abstract colony per world rival site (GDD 05 §3.1, §3.2, §3.8) with its nest record, territory
// slot and core territory marks. Light (entity helpers only): the real nest (carving, queens, display brood) is
// built on the first rivals tick, when a full Sim exists (setup.ts).

import type { Colony, RivalAbstract, RivalSite, SimState, WorldData } from '@/sim/types';
import { createColony, createNest, type EntityCtx } from '@/sim/entities';
import {
  CORE_DEPOSIT, CORE_R_BASE_BU, CORE_R_MAX_BU, CORE_R_PER_N, CORE_START_SHARE, INCIPIENT_BROOD, INCIPIENT_FIRST_WORKERS_GD,
  INCIPIENT_START_C, INCIPIENT_START_P, START_BROOD_PER_N, START_C_U, START_P_SHARE, TERR_HALF_LIFE_GD,
} from '@/sim/balance/rivals';
import { rivalProfile } from '@/sim/species/rivals/profiles';
import { TICKS_PER_DAY, TICKS_PER_SECOND } from '@/sim/time';
import { aggressionOf, storeCaps, upkeepOf } from './model';
import { assignSlot, colExt, hasFreeSlot } from './state';

/** Plain territory grid allocation (first use). */
export function ensureTerritory(state: SimState): void {
  const t = state.rivals.territory;
  if (t.marks.length !== t.w * t.h * t.slots) t.marks = new Float32Array(t.w * t.h * t.slots);
}

/** Core radius R_core = min(150, 40 + 0.1 N), BU. */
export function coreRadiusBu(n: number): number {
  return Math.min(CORE_R_MAX_BU, CORE_R_BASE_BU + CORE_R_PER_N * n);
}

/** Equilibrium mark of a cell fed only by the core deposit (deposit rate / decay rate). */
export function coreEquilibrium(): number {
  const perGd = CORE_DEPOSIT * (TICKS_PER_DAY / TICKS_PER_SECOND);
  return perGd / (Math.LN2 / TERR_HALF_LIFE_GD);
}

/** Seeds the core cells around a point at CORE_START_SHARE of the equilibrium (territory exists from day one). */
export function seedCore(state: SimState, slot: number, x: number, z: number, radiusMm: number, value: number): void {
  const t = state.rivals.territory;
  ensureTerritory(state);
  const c0x = Math.max(0, Math.floor((x - radiusMm) / t.cell)), c1x = Math.min(t.w - 1, Math.floor((x + radiusMm) / t.cell));
  const c0z = Math.max(0, Math.floor((z - radiusMm) / t.cell)), c1z = Math.min(t.h - 1, Math.floor((z + radiusMm) / t.cell));
  for (let cz = c0z; cz <= c1z; cz++) {
    for (let cx = c0x; cx <= c1x; cx++) {
      const dx = (cx + 0.5) * t.cell - x, dz = (cz + 0.5) * t.cell - z;
      if (dx * dx + dz * dz > radiusMm * radiusMm) continue;
      const i = (cz * t.w + cx) * t.slots + slot;
      t.marks[i] = Math.max(t.marks[i], value);
    }
  }
}

/** The abstract record of a new rival colony. */
export function newRivalAbstract(species: Colony['species'], incipient: boolean, slot: number): RivalAbstract {
  const p = rivalProfile(species);
  const n = incipient ? 0 : p.n0;
  const u = upkeepOf(n, incipient ? 1 : p.queens);
  const caps = storeCaps(n, u);
  return {
    n, b: incipient ? INCIPIENT_BROOD : Math.round(START_BROOD_PER_N * n),
    cS: incipient ? INCIPIENT_START_C : START_C_U * u, pS: incipient ? INCIPIENT_START_P : START_P_SHARE * caps.p,
    agg: aggressionOf(p.aggression, 'summer', 1, 0, 1, false), knowsNest: 0, orphaned: false, incipient, raid: null,
    lastRaidTick: -1, fieldedIds: [], virtualTend: 0, territorySlot: slot,
  };
}

/**
 * Creates a rival colony at a site: abstract colony record, nest record, territory slot and (established colonies)
 * core marks. Returns the colony, or null when no territory slot is free.
 */
export function createRivalColony(ctx: EntityCtx, site: RivalSite, bu: number): Colony | null {
  if (!hasFreeSlot(ctx)) return null;
  const col = createColony(ctx, { species: site.species, isPlayer: false, fidelity: 'abstract' });
  const slot = assignSlot(ctx, col.id);
  col.rival = newRivalAbstract(site.species, site.incipient, slot);
  col.foundedTick = ctx.state.tick;
  createNest(ctx, { colony: col.id, origin: { ...site.origin } });
  const ext = colExt(ctx.state, col.id);
  if (site.incipient) ext.firstWorkersTick = ctx.state.tick + Math.round(INCIPIENT_FIRST_WORKERS_GD * TICKS_PER_DAY);
  else seedCore(ctx.state, slot, site.origin.x, site.origin.z, coreRadiusBu(col.rival.n) * bu, CORE_START_SHARE * coreEquilibrium());
  return col;
}

/** Creates the rival colonies of the world's rival sites at New Game (GDD 05 §3.1; sites from worldgen, GDD 04 §12.5). */
export function initRivals(ctx: EntityCtx, world: WorldData): void {
  for (const site of world.placements.rivalSites) createRivalColony(ctx, site, world.bu);
}
