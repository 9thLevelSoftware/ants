// Foraging and scouting for a granary species: the shared outdoor engine (src/sim/ants/behaviours/outdoor) with a
// harvester's source filter and departure gate (GDD 07 §5.3.7, §6.3.2).
//   - Diet: sources the species does not eat (preference 0 or none, e.g. honeydew) are ignored by scouts and foragers.
//   - Seed selection: a seed is taken with p = clamp(sizeFit x hardFit / (1 + dist / acceptDistBu), 0, 1); a visit
//     looks at SEED_LOOKS_PER_VISIT seeds, drawn once per ant, node and day (stable across thinks); seeds heavier
//     than the ant's carry capacity are refused.
//   - Range: no source beyond the heat-limited trip distance.
//   - Departures: a waiting forager (or a scout about to leave) leaves only with probability (1 - heatStress) x
//     lull x patrol gate per think; with the gate closed nobody leaves.

import { hash3i } from '@/core/math/noise';
import { rngFloat } from '@/core/rng';
import type { Ant, Behaviour, Colony, FoodSource, Sim } from '@/sim/types';
import { makeBehaviour } from '@/sim/ants/behaviours/outdoor/engine';
import { FORAGE, SCOUT, type Flavour } from '@/sim/ants/behaviours/outdoor/flavours';
import { K, PHASE } from '@/sim/ants/behaviours/outdoor/keys';
import { distFromHome, thinkIn } from '@/sim/ants/behaviours/outdoor/common';
import { THINK_WAIT_TICKS } from '@/sim/balance/foraging';
import { SEED_LOOKS_PER_VISIT } from '@/sim/balance/species-harvester';
import { TICKS_PER_DAY } from '@/sim/time';
import { granaryParams, nutrientsPerSeedLoad, type GranaryParams } from './params';
import { departureFactor, heatOf } from './rhythm';

/** The ant whose think is running (set by the wrappers; the flavour filter has no other way to see it). */
const ctx: { sim: Sim | null; ant: Ant | null; allow: boolean } = { sim: null, ant: null, allow: true };

function crackLimit(g: GranaryParams, ant: Ant): number {
  return ant.caste === 'major' ? g.crackLimitMajor : ant.caste === 'media' ? g.crackLimitMedia : g.crackLimitMinor;
}

/** Acceptance probability of a seed node for this ant (GDD 07 §6.3.2). */
export function seedAcceptP(sim: Sim, ant: Ant, s: FoodSource, g: GranaryParams): number {
  if (s.unitBulk > ant.carryCap) return 0;
  const per = nutrientsPerSeedLoad(g);
  const loads = (s.c + s.p) / (per.c + per.p);
  const sizeFit = Math.min(1, loads / Math.max(1e-6, ant.carryCap));
  const hardFit = 1 - g.hardnessPenalty * Math.max(0, s.hardness - crackLimit(g, ant));
  const distBu = distFromHome(sim, ant, s.pos) / sim.world.bu;
  return Math.max(0, Math.min(1, (sizeFit * hardFit) / (1 + distBu / g.acceptDistBu)));
}

/** Probability that one visit to the node finds a seed this ant takes (SEED_LOOKS_PER_VISIT seeds looked at). */
export function seedVisitP(sim: Sim, ant: Ant, s: FoodSource, g: GranaryParams): number {
  const p = seedAcceptP(sim, ant, s, g);
  return p <= 0 ? 0 : 1 - Math.pow(1 - p, SEED_LOOKS_PER_VISIT);
}

/** Whether the species eats this kind of food at all (diet preference above 0; GDD 07 §5.3.5: no honeydew). */
export function inDiet(sim: Sim, col: Colony, s: FoodSource): boolean {
  const def = sim.getSpecies(col.species);
  const f = def?.diet.foods[s.kind as keyof typeof def.diet.foods];
  return !!f && f.pref > 0;
}

/** The ant's stable draw for a node today, 0..1. */
function draw(sim: Sim, ant: Ant, s: FoodSource): number {
  return hash3i(ant.id, s.id, Math.floor(sim.state.tick / TICKS_PER_DAY), 0x5eed);
}

function colonyAndParams(sim: Sim, ant: Ant): { col: Colony; g: GranaryParams } | null {
  const col = sim.stores.colonies.get(ant.colony);
  const g = col ? granaryParams(sim.getSpecies(col.species)) : null;
  return col && g ? { col, g } : null;
}

/** The harvester filter: departures allowed now, within the heat range, and (for seeds) accepted. */
export function harvesterAccepts(sim: Sim, ant: Ant, s: FoodSource, allow = true): boolean {
  const cg = colonyAndParams(sim, ant);
  if (!cg) return true;
  if (!allow && ant.nestId >= 0) return false;
  if (!inDiet(sim, cg.col, s)) return false;
  const heat = heatOf(sim, cg.col, cg.g);
  if (distFromHome(sim, ant, s.pos) > heat.tripMaxBu * sim.world.bu) return false;
  if (s.kind !== 'seed') return true;
  return draw(sim, ant, s) < seedVisitP(sim, ant, s, cg.g);
}

function accept(s: FoodSource): boolean {
  return ctx.sim && ctx.ant ? harvesterAccepts(ctx.sim, ctx.ant, s, ctx.allow) : true;
}

const HARVEST_FORAGE: Flavour = { ...FORAGE, accept };
function scoutAccept(s: FoodSource): boolean {
  const col = ctx.sim && ctx.ant ? ctx.sim.stores.colonies.get(ctx.ant.colony) : undefined;
  return ctx.sim && col ? inDiet(ctx.sim, col, s) : true;
}

const HARVEST_SCOUT: Flavour = { ...SCOUT, accept: scoutAccept };
const forageEngine = makeBehaviour(HARVEST_FORAGE);
const scoutEngine = makeBehaviour(HARVEST_SCOUT);

/** Draws whether this ant may leave on this think. */
function mayLeave(sim: Sim, ant: Ant): boolean {
  const cg = colonyAndParams(sim, ant);
  if (!cg) return true;
  const f = departureFactor(sim, cg.col, cg.g);
  if (f >= 1) return true;
  if (f <= 0) return false;
  return rngFloat(sim.stream('rng.behaviour')) < f;
}

function withCtx(sim: Sim, ant: Ant, allow: boolean, run: () => void): void {
  const prev = { sim: ctx.sim, ant: ctx.ant, allow: ctx.allow };
  ctx.sim = sim; ctx.ant = ant; ctx.allow = allow;
  try { run(); } finally { ctx.sim = prev.sim; ctx.ant = prev.ant; ctx.allow = prev.allow; }
}

export const harvesterForageBehaviour: Behaviour = {
  task: 'forage', species: ['messor-barbarus'],
  enter: (sim, ant) => withCtx(sim, ant, true, () => forageEngine.enter(sim, ant)),
  update(sim, ant) {
    const waiting = ant.nestId >= 0 && ant.bb[K.phase] === PHASE.wait;
    withCtx(sim, ant, waiting ? mayLeave(sim, ant) : true, () => forageEngine.update(sim, ant));
  },
  exit: (sim, ant) => forageEngine.exit(sim, ant),
  delivering: forageEngine.delivering,
};

export const harvesterScoutBehaviour: Behaviour = {
  task: 'scout', species: ['messor-barbarus'],
  enter: (sim, ant) => withCtx(sim, ant, true, () => scoutEngine.enter(sim, ant)),
  update(sim, ant) {
    if (ant.nestId >= 0 && ant.bb[K.phase] === PHASE.depart && !mayLeave(sim, ant)) {
      thinkIn(sim, ant, THINK_WAIT_TICKS);
      return;
    }
    withCtx(sim, ant, true, () => scoutEngine.update(sim, ant));
  },
  exit: (sim, ant) => scoutEngine.exit(sim, ant),
  delivering: scoutEngine.delivering,
};
