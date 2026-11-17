// Foraging and scouting for a granary species: the shared outdoor engine (src/sim/ants/behaviours/outdoor) with a
// harvester's source filter and departure gate (GDD 07 §5.3.7, §6.3.2).
//   - Diet: sources the species does not eat (preference 0 or none, e.g. honeydew) are ignored by scouts and foragers.
//   - Seed selection: a seed is taken with p = clamp(sizeFit x hardFit / (1 + dist / acceptDistBu), 0, 1); a visit
//     looks at SEED_LOOKS_PER_VISIT seeds, drawn once per ant, node and day (stable across thinks); seeds heavier
//     than the ant's carry capacity are refused.
//   - Scouts recruit only to seed nodes some worker of the colony can carry (no L seeds before majors).
//   - Granary call: while the granaries are short of target, a waiting forager with nowhere of her own to go takes
//     a lead to the nearest harvestable seed node the colony knows and leaves on her own (granaryCall).
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
import { moving, stop } from '@/sim/ants/behaviours/outdoor/nav';
import { THINK_WAIT_TICKS } from '@/sim/balance/foraging';
import { SEED_CALL_RATE_S, SEED_FORAGE_FRAC, SEED_LOOKS_PER_VISIT } from '@/sim/balance/species-harvester';
import { ACTIVATION_DEPART } from '@/sim/balance/colony';
import { TICKS_PER_DAY, TICKS_PER_SECOND } from '@/sim/time';
import { seedForageDemand } from './allocation';
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
const carryCache = new WeakMap<Sim, { tick: number; byColony: Map<number, number> }>();

/** Largest carry capacity among the colony's living workers (cached per tick), loads. */
export function colonyMaxCarry(sim: Sim, col: Colony): number {
  let c = carryCache.get(sim);
  if (!c || c.tick !== sim.state.tick) { c = { tick: sim.state.tick, byColony: new Map() }; carryCache.set(sim, c); }
  const hit = c.byColony.get(col.id);
  if (hit !== undefined) return hit;
  let m = 0;
  for (const a of sim.stores.ants.list) if (a.alive && a.colony === col.id && a.caste !== 'queen' && a.carryCap > m) m = a.carryCap;
  c.byColony.set(col.id, m);
  return m;
}

/**
 * The harvester scout's filter: food in the diet, and seed nodes only when some worker of the colony could carry
 * the seed (GDD 07 §6.3.1: L seeds need a major; a colony without one does not recruit to them).
 */
function scoutAccept(s: FoodSource): boolean {
  const sim = ctx.sim, col = sim && ctx.ant ? sim.stores.colonies.get(ctx.ant.colony) : undefined;
  if (!sim || !col) return true;
  if (!inDiet(sim, col, s)) return false;
  return s.kind !== 'seed' || s.unitBulk <= colonyMaxCarry(sim, col);
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

/** Whether the ant has somewhere of her own to go: a valid lead or a route to a live source. */
function hasOwnSource(sim: Sim, ant: Ant): boolean {
  if (ant.mem.lead.sourceId >= 0 && sim.stores.sources.has(ant.mem.lead.sourceId)) return true;
  for (const r of ant.mem.routes) if (r.sourceId >= 0 && sim.stores.sources.has(r.sourceId)) return true;
  return false;
}

/**
 * The granary's call on a waiting forager (GDD 07 §6.3.5, §5.3.7 trunk trails): while the granaries are short of
 * their target stock, a forager with nowhere of her own to go takes the trunk trail to the nearest seed node the
 * colony knows and she would harvest (a lead), and leaves on her own with SEED_CALL_RATE_S x shortfall per second
 * (the colony's departure rule follows the pool's need only, which a granary does not show).
 */
function granaryCall(sim: Sim, ant: Ant, dtTicks: number): void {
  const cg = colonyAndParams(sim, ant);
  if (!cg) return;
  const short = seedForageDemand(cg.col, cg.g, 1) / SEED_FORAGE_FRAC;
  if (short <= 0) return;
  if (!hasOwnSource(sim, ant)) {
    let best: FoodSource | undefined, bestD = Infinity;
    for (const id of cg.col.knownSourceIds) {
      const s = sim.stores.sources.get(id);
      if (!s || !s.alive || s.kind !== 'seed' || s.units <= 0 || !harvesterAccepts(sim, ant, s)) continue;
      const d = distFromHome(sim, ant, s.pos);
      if (d < bestD || (d === bestD && best && s.id < best.id)) { best = s; bestD = d; }
    }
    if (!best) return;
    ant.mem.lead = { sourceId: best.id, pos: { x: best.pos.x, y: best.pos.y, z: best.pos.z }, tick: sim.state.tick };
  }
  if (ant.activation < ACTIVATION_DEPART && rngFloat(sim.stream('rng.behaviour')) < SEED_CALL_RATE_S * short * (dtTicks / TICKS_PER_SECOND)) {
    ant.activation = ACTIVATION_DEPART;
  }
}

export const harvesterForageBehaviour: Behaviour = {
  task: 'forage', species: ['messor-barbarus'],
  enter: (sim, ant) => withCtx(sim, ant, true, () => forageEngine.enter(sim, ant)),
  update(sim, ant) {
    // the departure gate holds every forager inside the nest, a returner resuming her job as well as a waiting one
    const waiting = ant.nestId >= 0 && ant.bb[K.phase] === PHASE.wait;
    const allow = ant.nestId >= 0 ? mayLeave(sim, ant) : true;
    if (waiting && allow) granaryCall(sim, ant, THINK_WAIT_TICKS);
    withCtx(sim, ant, allow, () => forageEngine.update(sim, ant));
  },
  exit: (sim, ant) => forageEngine.exit(sim, ant),
  delivering: forageEngine.delivering,
};

export const harvesterScoutBehaviour: Behaviour = {
  task: 'scout', species: ['messor-barbarus'],
  enter: (sim, ant) => withCtx(sim, ant, true, () => scoutEngine.enter(sim, ant)),
  update(sim, ant) {
    const ph = ant.bb[K.phase];
    if (ant.nestId >= 0 && (ph === PHASE.depart || ph === PHASE.wait) && !mayLeave(sim, ant)) {
      // a scout already walking up the shaft stops there until the gate opens; the held time is not her depart time
      if (moving(ant)) stop(sim, ant);
      ant.bb[K.phase0] = sim.state.tick;
      thinkIn(sim, ant, THINK_WAIT_TICKS);
      return;
    }
    withCtx(sim, ant, true, () => scoutEngine.update(sim, ant));
  },
  exit: (sim, ant) => scoutEngine.exit(sim, ant),
  delivering: scoutEngine.delivering,
};
