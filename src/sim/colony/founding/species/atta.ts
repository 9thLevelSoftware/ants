// Atta founding variation (GDD 06 §5.15 "Atta fungus", GDD 07 §5.4.3, §6.4.8; mode `claustral-fungus`): the queen
// carries a fungus pellet from the start (player.garden.pelletHealth 1.0, decaying pelletDecayPerGd while the air or
// cell around her is drier than pelletMinRh or outside pelletMinC..pelletMaxC; 0 = founding failed, `garden-lost`).
// In her cell she plants it (`plant`, hold E 4 s; a passive queen or cheat.completeFounding plants it herself after
// FOUND_AUTO_PLANT_GD); it becomes a garden of plantedGu in the cell, fertilised from her reserves at gardenFertCost
// loads per game day, with the chapter's single founding outbreak roll (foundingOutbreakP x predatorDensityMult).
// Eggs are blocked until the garden is established (G >= FOUND_ESTABLISHED_MULT x plantedGu): the opening stays in
// `dig` (its readiness check is held back) until then, and only then may she seal and lay. Of the first clutch a
// share trophicFraction is eaten by the queen as it is laid (its egg cost returns to her pool). If the founding
// garden dies before the hand-over the founding fails (`garden-lost`).
// The garden's own dynamics are the fungus module's (src/sim/species/modules/fungus/economy.ts, founding rules).
// Registered as a system by the fungus module (src/sim/species/modules/fungus/index.ts).

import { rngFloat } from '@/core/rng';
import type { Ant, Colony, Nest, OpeningState, Sim, System } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';
import { FOUND_AUTO_PLANT_GD, FOUND_ESTABLISHED_MULT } from '@/sim/balance/species-leafcutter';
import { EGG_COST_P } from '@/sim/balance/actions';
import { difficultyValue } from '@/sim/balance/difficulty';
import { chamberRh, pointTempC, chamberTempC } from '../../envAdapter';
import { broodDies } from '../../brood';
import { FB, bbGet, bbSet, foundingNest, foundingQueen, openingOf, playerColonyOf } from '../access';
import { failOpening } from '../failure';
import { fungusParams, type FungusParams } from '@/sim/species/modules/fungus/params';
import { gardenOf, seedGarden } from '@/sim/species/modules/fungus/state';

/** Queen bb keys: tick she was first in her cell; highest brood id already looked at for trophic eating. */
const IN_CELL_SINCE = 'at.inCell';
const LAST_EGG = 'at.lastEgg';
/** Eggs of the clutch counted so far (for the trophic share), and eggs eaten. */
const EGGS_SEEN = 'at.eggsSeen';
const EGGS_EATEN = 'at.eggsEaten';

/** The founding cell of the nest (registered by the nest module once the geometry is met). */
export function foundingCellOf(nest: Nest) {
  return nest.chambers.find((c) => c.type === 'founding');
}

/** Context of an Atta opening in progress, or null. */
function attaOpening(sim: Sim): { op: OpeningState; col: Colony; q: Ant; nest: Nest; P: FungusParams } | null {
  const op = openingOf(sim);
  if (!op || op.done || op.phase === 'failed' || op.phase === 'handover' || op.phase === 'done' || op.phase === 'intro-card') return null;
  const col = playerColonyOf(sim);
  if (!col || col.species !== 'atta-texana' || !col.fungus) return null;
  const q = foundingQueen(sim);
  const nest = foundingNest(sim);
  const P = fungusParams(sim.getSpecies(col.species));
  return q && nest && P && op.garden ? { op, col, q, nest, P } : null;
}

/** Whether the queen stands in her founding cell (registered chamber, or on its floor within its ellipsoid). */
export function queenInCell(sim: Sim, q: Ant, nest: Nest): boolean {
  const cell = foundingCellOf(nest);
  if (!cell) return false;
  if (q.chamberId === cell.id) return true;
  const dx = (q.pos.x - cell.center.x) / Math.max(1, cell.radii.x * 1.3);
  const dy = (q.pos.y - cell.center.y) / Math.max(1, cell.radii.y * 2.5);
  const dz = (q.pos.z - cell.center.z) / Math.max(1, cell.radii.z * 1.3);
  return dx * dx + dy * dy + dz * dz <= 1;
}

/** Why the queen cannot plant now (null = she can). */
export function plantRefusal(sim: Sim, q: Ant): 'species' | 'no-target' | 'not-allowed-here' | null {
  const ctx = attaOpening(sim);
  if (!ctx || ctx.q.id !== q.id) return 'species';
  if (sim.state.player.opening!.garden!.planted) return 'no-target';
  return queenInCell(sim, q, ctx.nest) ? null : 'not-allowed-here';
}

/** Plants the pellet in the founding cell (the `plant` action's effect, and the automatic planting). */
export function plantPellet(sim: Sim): boolean {
  const ctx = attaOpening(sim);
  if (!ctx) return false;
  const pg = sim.state.player.opening!.garden!;
  const cell = foundingCellOf(ctx.nest);
  if (pg.planted || !cell || pg.pelletHealth <= 0) return false;
  const g = seedGarden(sim, ctx.col.fungus!, ctx.P, cell.id, ctx.P.plantedGu, Math.min(1, pg.pelletHealth), 0);
  // GDD 06 §5.15: one founding outbreak roll (6.6 % x predator density)
  const p = ctx.P.foundingOutbreakP * difficultyValue(sim, 'predatorDensityMult');
  if (rngFloat(sim.stream('rng.opening')) < p) {
    g.infection = ctx.P.escOutbreakI;
    ctx.op.hazardLog.push({ tick: sim.state.tick, hazard: 'fungus', outcome: 'outbreak' });
  }
  pg.planted = true;
  pg.biomass = g.biomass;
  sim.emit({ type: 'garden-state', chamberId: cell.id, state: g.state, cause: 'planted' });
  sim.emit({ type: 'cue', cue: 'garden-tend', pos: { x: cell.center.x, y: cell.center.y, z: cell.center.z }, strength: 1 });
  return true;
}

/** The pellet's health clock before planting. */
function pelletTick(sim: Sim, q: Ant, nest: Nest, P: FungusParams): void {
  const pg = sim.state.player.opening!.garden!;
  if (pg.planted) return;
  const cell = foundingCellOf(nest);
  const inCell = cell && queenInCell(sim, q, nest);
  const t = inCell ? chamberTempC(sim, cell.id) : pointTempC(sim, q.pos);
  const rh = inCell ? chamberRh(sim, cell.id, cell.center) : chamberRh(sim, -1, q.pos);
  if (rh < P.pelletMinRh || t < P.pelletMinC || t > P.pelletMaxC) pg.pelletHealth = Math.max(0, pg.pelletHealth - P.pelletDecayPerGd / TICKS_PER_DAY);
}

/** The queen eats the trophic share of the first clutch as it is laid (GDD 06 §5.15, ATTA_TROPHIC_FRACTION_FIRST). */
function trophicEggs(sim: Sim, col: Colony, q: Ant): void {
  const frac = sim.getSpecies(col.species)?.opening.trophicFraction ?? 0;
  if (frac <= 0) return;
  let last = bbGet(q, LAST_EGG, -1);
  let seen = bbGet(q, EGGS_SEEN, 0), eaten = bbGet(q, EGGS_EATEN, 0);
  for (const b of sim.stores.brood.list) {
    if (!b.alive || b.colony !== col.id || b.stage !== 'egg' || b.id <= bbGet(q, LAST_EGG, -1)) continue;
    seen++;
    if (b.id > last) last = b.id;
    // eat every egg that brings the eaten share up to the trophic fraction (even, deterministic spacing)
    if (Math.floor(seen * frac) > eaten) {
      eaten++;
      broodDies(sim, b, 'cannibalised');
      if (q.queen?.founding) q.queen.founding.reserveLoads += EGG_COST_P;
      sim.emit({ type: 'queen.egg-eaten', queenId: q.id });
    }
  }
  bbSet(q, LAST_EGG, last);
  bbSet(q, EGGS_SEEN, seen);
  bbSet(q, EGGS_EATEN, eaten);
}

/** One tick of the Atta opening (before the founding system, which runs in the `queen` phase). */
export function attaFoundingTick(sim: Sim): void {
  const ctx = attaOpening(sim);
  if (!ctx) return;
  const { op, col, q, nest, P } = ctx;
  const pg = sim.state.player.opening!.garden!;
  pelletTick(sim, q, nest, P);
  if (!pg.planted && pg.pelletHealth <= 0) { failOpening(sim, op, 'garden-lost'); return; }
  const cell = foundingCellOf(nest);
  // the passive queen (and the automatic founding) plants the pellet once she has been in her cell a while
  if (!pg.planted && cell && queenInCell(sim, q, nest)) {
    const since = bbGet(q, IN_CELL_SINCE, -1);
    if (since < 0) bbSet(q, IN_CELL_SINCE, sim.state.tick);
    // cheat.completeFounding (founding auto mode, FB.auto) plants at once
    const wait = bbGet(q, FB.auto, 0) === 1 ? 0 : FOUND_AUTO_PLANT_GD * TICKS_PER_DAY;
    if (since >= 0 && sim.state.tick - since >= wait && !q.action) plantPellet(sim);
  }
  const g = cell ? gardenOf(col.fungus!, cell.id) : undefined;
  if (pg.planted && g) {
    if (g.state === 'dead') { failOpening(sim, op, 'garden-lost'); return; }
    pg.biomass = g.biomass;
    if (!pg.established && g.biomass >= FOUND_ESTABLISHED_MULT * P.plantedGu) pg.established = true;
    // the queen fertilises it from her reserves
    if (q.queen?.founding) q.queen.founding.reserveLoads -= P.gardenFertCost / TICKS_PER_DAY;
  }
  // eggs blocked until the garden is established: hold the dig's readiness check (the cell stays registered)
  if (op.phase === 'dig' && !pg.established) bbSet(q, FB.readinessTick, sim.state.tick);
  if (op.phase === 'lay' || op.phase === 'timelapse' || op.phase === 'seal') trophicEggs(sim, col, q);
}

export const attaFoundingSystem: System = {
  name: 'atta-founding', phase: 'colony-allocation', run: attaFoundingTick,
};
