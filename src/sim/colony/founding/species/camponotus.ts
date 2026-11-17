// Camponotus founding in wood (GDD 07 §5.2.3 `claustral-wood`, GDD 03 §13.1 "CP 3 into wood"): which wood is a
// founding site, the site read-out's moisture, and the automatic founding's cell chewed into a log or stump (the
// `cheat.completeFounding` path, auto.ts). The player's own founding uses the same rules through the bite (dig-bite
// in wood, src/sim/species/modules/wood/biteRule.ts) and the readiness depth (nestDepthRule, the wood module).
// Registered by one import line in ../index.ts.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Nest, Primitive, Sim, WoodState } from '@/sim/types';
import { FOUNDING_TEMPLATE } from '@/sim/balance/nest';
import {
  FOUND_SOUND_MIN_MC_PCT, FOUND_WOOD_MIN_THICK_BU, FOUND_WOOD_SEARCH_BU, MC_WORD_DAMP_PCT, MC_WORD_WET_PCT,
} from '@/sim/balance/species-carpenter';
import { carveCapsule } from '@/sim/nest/carveOps';
import { primDistance } from '@/sim/species/modules/wood/primGeom';
import { woodParamsOf } from '@/sim/species/modules/wood/params';
import { ensureWoodStates, primOf, woodClimateAt } from '@/sim/species/modules/wood/woodState';
import { autoFoundingRules } from '../auto';
import { speciesOf } from '../access';

/** A wood founding site: the primitive, the entry point on its side, the outward direction there (horizontal). */
export interface WoodSite { prim: Primitive; wood: WoodState; entry: Vec3; out: Vec3; score: number }

/** Moisture word of the antennation read-out (GDD 07 §5.2.3 "dry / damp / wet"). */
export function moistureWord(mcPct: number): 'dry' | 'damp' | 'wet' {
  return mcPct < MC_WORD_DAMP_PCT ? 'dry' : mcPct >= MC_WORD_WET_PCT ? 'wet' : 'damp';
}

/**
 * Is this wood a founding site (GDD 07 §5.2.3): at least 10 BU thick; decayed wood of class 1-3, or sound wood
 * with mc >= 18 %; and moist enough that the brood can live (mc above the zero-survival moisture, 8 %).
 */
export function isFoundingWood(sim: Sim, w: WoodState): boolean {
  const p = woodParamsOf(sim.species);
  if (!p || (w.thicknessBu ?? 0) < FOUND_WOOD_MIN_THICK_BU) return false;
  const prim = primOf(sim, w.primId);
  if (!prim) return false;
  if (w.moisture <= p.mcZeroSurvivalPct) return false;
  if (prim.material === 'wood-sound') return w.moisture >= FOUND_SOUND_MIN_MC_PCT;
  return w.decay >= 1 && w.decay <= 3;
}

/** Suitability 0..1 of founding wood by moisture: 1 inside the young-brood band, falling to 0 at 8 % [EST]. */
function moistureScore(sim: Sim, mc: number): number {
  const p = woodParamsOf(sim.species)!;
  if (mc < p.mcFullSurvivalPct) return Math.max(0, (mc - p.mcZeroSurvivalPct) / (p.mcFullSurvivalPct - p.mcZeroSurvivalPct));
  if (mc > p.mcMouldPct) return Math.max(0, 1 - (mc - p.mcMouldPct) * p.hazardMouldPerPct * 10);
  return 1;
}

const tmp = { x: 0, y: 0, z: 0 };

/** Entry point on the primitive's side facing `from`, at a walkable height, with the outward horizontal direction. */
function entryOf(sim: Sim, prim: Primitive, w: WoodState, from: Vec3): { entry: Vec3; out: Vec3 } | null {
  const bu = sim.world.bu, a = w.grainAxis ?? { x: 0, y: 1, z: 0 };
  const half = ((w.lengthBu ?? 0) * bu) / 2, margin = 6 * bu;
  const vx = from.x - prim.pos.x, vy = from.y - prim.pos.y, vz = from.z - prim.pos.z;
  let t = vx * a.x + vy * a.y + vz * a.z;
  t = Math.max(-half + margin, Math.min(half - margin, t));
  if (half < margin) t = 0;
  // a point on the axis above the ground (vertical wood: low on the trunk, where a queen walks up to it)
  const p0 = { x: prim.pos.x + a.x * t, y: prim.pos.y + a.y * t, z: prim.pos.z + a.z * t };
  const ground = sim.field.height(p0.x, p0.z);
  if (Math.abs(a.y) > 0.7) p0.y = Math.max(p0.y, ground + 3 * bu);
  if (p0.y < ground + bu || primDistance(prim, p0) >= 0) return null;
  let sx = from.x - p0.x, sz = from.z - p0.z;
  // horizontal, perpendicular to a horizontal grain
  if (Math.abs(a.y) < 0.7) { const d = sx * a.x + sz * a.z; sx -= d * a.x; sz -= d * a.z; }
  const sl = Math.hypot(sx, sz);
  if (sl < 1e-6) { sx = -a.z; sz = a.x; } else { sx /= sl; sz /= sl; }
  // march out to the surface, then bisect
  let lo = 0, hi = bu;
  for (let n = 0; n < 400; n++) {
    tmp.x = p0.x + sx * hi; tmp.y = p0.y; tmp.z = p0.z + sz * hi;
    if (primDistance(prim, tmp) >= 0) break;
    lo = hi; hi += bu;
  }
  for (let n = 0; n < 20; n++) {
    const m = (lo + hi) / 2;
    tmp.x = p0.x + sx * m; tmp.y = p0.y; tmp.z = p0.z + sz * m;
    if (primDistance(prim, tmp) < 0) lo = m; else hi = m;
  }
  const entry = { x: p0.x + sx * hi, y: p0.y, z: p0.z + sz * hi };
  // the entry must be free air on the outside (not buried in soil, not inside another solid)
  if (sim.field.substrateXYZ(entry.x + sx * bu, entry.y, entry.z + sz * bu) <= 0) return null;
  return { entry, out: { x: sx, y: 0, z: sz } };
}

/** The best founding wood within FOUND_WOOD_SEARCH_BU of p (moisture first, then distance; ties by primitive id). */
export function bestWoodSite(sim: Sim, p: Vec3): WoodSite | null {
  const bu = sim.world.bu, reach = FOUND_WOOD_SEARCH_BU * bu;
  let best: WoodSite | null = null;
  for (const w of ensureWoodStates(sim)) {
    if (!isFoundingWood(sim, w)) continue;
    const prim = primOf(sim, w.primId);
    if (!prim) continue;
    const d = Math.hypot(prim.pos.x - p.x, prim.pos.z - p.z);
    if (d > reach) continue;
    const e = entryOf(sim, prim, w, p);
    if (!e) continue;
    const score = moistureScore(sim, w.moisture) - d / reach;
    if (!best || score > best.score) best = { prim, wood: w, entry: e.entry, out: e.out, score };
  }
  return best;
}

/**
 * The automatic founding's carve in wood: a horizontal tunnel of the template's diameter chewed in from the side,
 * and the cell (W x H x L, long along a horizontal grain) at its end, clipped to the wood by the species' dig rule.
 * The queen is moved to the entry. False (the soil template runs) when the species does not found in wood.
 */
export function carveWoodTemplate(sim: Sim, q: Ant, nest: Nest): boolean {
  const def = speciesOf(sim);
  if (def.opening.mode !== 'claustral-wood') return false;
  const site = bestWoodSite(sim, q.pos);
  if (!site) return false;
  const bu = sim.world.bu, t = FOUNDING_TEMPLATE['camponotus-pennsylvanicus'];
  const { entry, out, wood } = site;
  const radius = ((wood.thicknessBu ?? 0) / 2) * bu;
  // cell centre as deep as the template asks, but never past the middle of the wood
  const depth = Math.min(radius, (t.shaftDepth + t.cell.w / 2) * bu);
  const c = { x: entry.x - out.x * depth, y: entry.y, z: entry.z - out.z * depth };
  const a = wood.grainAxis ?? { x: 0, y: 1, z: 0 };
  // the cell's long axis: the grain when it is horizontal, else across the tunnel
  let gx = a.x, gz = a.z;
  if (Math.abs(a.y) > 0.7 || Math.hypot(gx, gz) < 1e-6) { gx = -out.z; gz = out.x; }
  const gl = Math.hypot(gx, gz); gx /= gl; gz /= gl;
  const sx = -gz, sz = gx; // horizontal, across the cell
  const r = (t.cell.h / 2) * bu, along = (t.cell.l / 2) * bu - r, side = (t.cell.w / 2) * bu - r;
  for (const k of [-1, 0, 1]) {
    const ox = sx * side * k, oz = sz * side * k;
    carveCapsule(sim, { x: c.x + ox - gx * along, y: c.y, z: c.z + oz - gz * along }, { x: c.x + ox + gx * along, y: c.y, z: c.z + oz + gz * along }, r);
  }
  const mouth = { x: entry.x + out.x * 1.5 * bu, y: entry.y, z: entry.z + out.z * 1.5 * bu };
  carveCapsule(sim, mouth, c, (t.shaftD / 2) * bu);
  const stand = { x: entry.x + out.x * 0.6 * bu, y: entry.y, z: entry.z + out.z * 0.6 * bu };
  sim.enqueue({ type: 'cheat.teleport', antId: q.id, pos: stand });
  if (nest.founding && nest.founding.state === 'site-search') nest.founding.state = 'digging';
  nest.origin = { ...entry };
  nest.substrate = site.prim.material;
  if (nest.founding) nest.founding.cavitySeed = { ...c };
  return true;
}

/**
 * Wood moisture at the queen for the opening's read-out (`opening.woodMoisture`, %): the wood she stands on or
 * faces within 1 BU, -1 when she is not at wood.
 */
export function woodMoistureAtQueen(sim: Sim, q: Ant): number {
  const hit = woodClimateAt(sim, q.pos, sim.world.bu);
  return hit ? hit.mc : -1;
}

autoFoundingRules.carve = carveWoodTemplate;
