// Submersion (GDD 03 §11.3, GDD 06 §3.10): an ant over a wet nest's basin with the water standing at least
// FLOOD_SUBMERGE_DEPTH_BU (0.5 BU, 00-index water row) deep over it, or deep in a puddle (>= 0.5 BU; not while it
// carries a float-able leaf fragment), keeps its health for SUBMERGE_GRACE_S continuous seconds, then loses 1 % of
// max hp per second (death `drowning` at 150 s); brood (lying on the floor) whose centre is under water dies after
// BROOD_DROWN_S continuous seconds (`brood-drowned`). Carried brood and ants in the air are never submerged.
// Depth (task weather-fix2 and its review): the water level minus the higher of the feet (the brood's floor point)
// and the bottom of the spill layer of the column's floor (spill.ts waterDepthOver). The flooded set is the prefix
// of the spill order whose volume is W (GDD 03 E22), so the first samples of a partly filled layer count as flooded
// as soon as any water enters it; deciding by "is my sample flooded" let a film of a few mm^3 on a cell floor drown
// a resting queen, and deciding by "level above my feet" reads a level quantised to sample layers (a film in the
// lowest layer reads 0.5 BU over the feet of an ant on a floor beside it). The column depth is a function of the
// level alone. Counters are persisted (ant.bb FLOOD_ANT_SUB_KEY, Brood.submergedS) and reset as soon as the ant or
// brood is dry, so "continuous" survives save / load.

import type { Ant, Sim } from '@/sim/types';
import {
  FLOOD_ANT_SUB_KEY, FLOOD_BROOD_DROWN_S, FLOOD_STEP_TICKS, FLOOD_SUBMERGE_DEPTH_BU, FLOOD_SUBMERGE_GRACE_S, FLOOD_SUBMERGE_HP_PER_S,
  WX_FLOAT_ITEM_KINDS, WX_PUDDLE_AVOID_BU, WX_PUDDLE_UNIT_MM,
} from '@/sim/balance/weather';
import { BROOD_RADIUS_BU } from '@/sim/balance/actions';
import { killAnt, killBrood } from '@/sim/entities';
import { TICKS_PER_SECOND } from '@/sim/time';
import { floodRuntime, spillPeek } from './runtime';
import { waterDepthOver, type SpillCache } from './spill';

const NONE: ReadonlySet<number> = new Set();

/** A wet nest of this step: its cache, flooded count and water level (mm, world y). */
export interface WetNest {
  nestId: number;
  cache: SpillCache;
  nFlooded: number;
  level: number;
}

function puddleDepthAt(sim: Sim, x: number, z: number): number {
  const m = sim.state.env.moisture;
  if (m.nx <= 0) return 0;
  const ix = Math.min(m.nx - 1, Math.max(0, Math.floor(x / m.cell)));
  const iz = Math.min(m.nz - 1, Math.max(0, Math.floor(z / m.cell)));
  return m.puddle[iz * m.nx + ix] * WX_PUDDLE_UNIT_MM;
}

/** True if any puddle cell is deep enough to submerge an ant. */
function anyDeepPuddle(sim: Sim): boolean {
  const units = Math.ceil((WX_PUDDLE_AVOID_BU * sim.world.bu) / WX_PUDDLE_UNIT_MM);
  const p = sim.state.env.moisture.puddle;
  for (let i = 0; i < p.length; i++) if (p[i] >= units) return true;
  return false;
}

const FLOATS: ReadonlySet<string> = new Set(WX_FLOAT_ITEM_KINDS);

/** The ant carries a float-able leaf: puddles do not submerge it (GDD 06 §3.10). */
function afloat(sim: Sim, ant: Ant): boolean {
  if (ant.carry.kind !== 'item') return false;
  const it = sim.stores.items.get(ant.carry.id);
  return it !== undefined && FLOATS.has(it.kind);
}

/** Water over a body of a wet nest at least `need` mm deep (spill.ts waterDepthOver, from `baseY` or the column floor). */
function deepEnough(sim: Sim, w: { cache: SpillCache; level: number }, x: number, y: number, z: number, baseY: number, need: number): boolean {
  return w.level - baseY >= need && waterDepthOver(w.cache, sim.carve.voxel, x, y, z, w.level, baseY) >= need;
}

/**
 * Is a body at (x, y, z) with its feet at height `feetY` under water: over a wet nest's basin with the water at least
 * FLOOD_SUBMERGE_DEPTH_BU above its feet and above its column's floor, or in a deep puddle?
 */
function submerged(sim: Sim, wet: readonly WetNest[], x: number, y: number, z: number, feetY: number, floats = false): boolean {
  const v = sim.carve.voxel, need = FLOOD_SUBMERGE_DEPTH_BU * sim.world.bu;
  for (const w of wet) if (deepEnough(sim, w, x, y, z, feetY, need)) return true;
  if (floats) return false;
  const depth = puddleDepthAt(sim, x, z);
  if (depth < WX_PUDDLE_AVOID_BU * sim.world.bu) return false;
  const ground = sim.field.height(x, z);
  return y >= ground - v && y < ground + depth;
}

/** Statistics of a submersion pass. */
export interface DrownStep {
  antsSubmerged: number;
  antsDrowned: number;
  broodSubmerged: number;
  broodDrowned: number;
}

/**
 * One submersion pass (every flood step) over ants and uncarried brood. Ants and brood inside a nest whose flood
 * geometry is frozen this step (`frozen`, nest ids) keep their counters unchanged: the step is deferred, not dry.
 */
export function drownStep(sim: Sim, wet: readonly WetNest[], frozen: ReadonlySet<number> = NONE): DrownStep {
  const out: DrownStep = { antsSubmerged: 0, antsDrowned: 0, broodSubmerged: 0, broodDrowned: 0 };
  const rt = floodRuntime(sim);
  const puddles = anyDeepPuddle(sim);
  if (wet.length === 0 && frozen.size === 0 && !puddles && !rt.counters) return out;
  const dt = FLOOD_STEP_TICKS / TICKS_PER_SECOND;
  let counters = false;
  for (const ant of sim.stores.ants.list) {
    if (!ant.alive) continue;
    const had = ant.bb[FLOOD_ANT_SUB_KEY] ?? 0;
    if (frozen.size > 0 && frozen.has(ant.nestId)) {
      if (had > 0) counters = true;
      continue;
    }
    const under = ant.medium !== 'air' && submerged(sim, wet, ant.pos.x, ant.pos.y, ant.pos.z, ant.pos.y - ant.up.y * ant.footOffset, afloat(sim, ant));
    if (!under) {
      if (had > 0) delete ant.bb[FLOOD_ANT_SUB_KEY];
      continue;
    }
    counters = true;
    out.antsSubmerged++;
    const s = had + dt;
    ant.bb[FLOOD_ANT_SUB_KEY] = s;
    if (had === 0) sim.emit({ type: 'ant-submerged', id: ant.id, pos: { x: ant.pos.x, y: ant.pos.y, z: ant.pos.z } });
    if (s > FLOOD_SUBMERGE_GRACE_S) {
      ant.hp -= FLOOD_SUBMERGE_HP_PER_S * ant.maxHp * dt;
      if (ant.hp <= 1e-9) {
        killAnt(sim, ant.id, 'drowning');
        out.antsDrowned++;
      }
    }
  }
  for (const b of sim.stores.brood.list) {
    if (!b.alive) continue;
    const had = b.submergedS ?? 0;
    if (frozen.size > 0 && frozen.has(b.nestId)) {
      if (had > 0) counters = true;
      continue;
    }
    const r = BROOD_RADIUS_BU[b.stage] * sim.world.bu;
    const under = b.carriedBy < 0 && wet.length > 0 && wet.some((w) => deepEnough(sim, w, b.pos.x, b.pos.y + r, b.pos.z, b.pos.y, r));
    if (!under) {
      if (had > 0) delete b.submergedS;
      continue;
    }
    counters = true;
    out.broodSubmerged++;
    const s = had + dt;
    b.submergedS = s;
    if (s >= FLOOD_BROOD_DROWN_S) {
      sim.emit({ type: 'brood-drowned', id: b.id, pos: { x: b.pos.x, y: b.pos.y, z: b.pos.z } });
      killBrood(sim, b.id, 'flooding');
      out.broodDrowned++;
      const nest = sim.stores.nests.get(b.nestId);
      if (nest && nest.flood.floodingSinceTick >= 0) nest.flood.broodDrowned = true;
    }
  }
  rt.counters = counters;
  return out;
}

/**
 * Is p under water by the submersion rule (feet `footOffset` mm below p): in a flooded voxel of a nest (as of the
 * last flood step's cache) with the water at least FLOOD_SUBMERGE_DEPTH_BU above the feet, or in a puddle at least
 * 0.5 BU deep below its surface? For locomotion (walker medium `water`, speed x 0.3) and behaviours (flee water).
 */
export function isUnderWater(sim: Sim, p: { x: number; y: number; z: number }, footOffset = 0): boolean {
  const need = FLOOD_SUBMERGE_DEPTH_BU * sim.world.bu, feetY = p.y - footOffset;
  for (const nest of sim.stores.nests.list) {
    if (!nest.alive || nest.flood.water <= 0 || nest.flood.level - feetY < need) continue;
    const c = spillPeek(sim, nest.id);
    if (c && deepEnough(sim, { cache: c, level: nest.flood.level }, p.x, p.y, p.z, feetY, need)) return true;
  }
  return submerged(sim, [], p.x, p.y, p.z, p.y - footOffset);
}
