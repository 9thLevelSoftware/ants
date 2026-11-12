// Plan validation (GDD 03 §7.3): a pure function of state and the request, in the GDD's check order. Player
// plans get warnings for `undermines`, `too-close`, `foreign-nest`; architect / worldgen / rival plans are refused.

import type { Vec3 } from '@/core/math/vec3';
import type { Nest, PlanSource, PlanSpec, PlanValidation, PlanValidationCode, Sim } from '@/sim/types';
import {
  ANCHOR_CONNECTION_BU, ANCHOR_SNAP_BU, BOUNDS_MARGIN_BU, COVER_SCAN_BU, ENTRANCE_KEEPOUT_BU, ENTRANCE_KEEPOUT_DEPTH_BU,
  FLOOR_MIN_BU, PILLAR_D_BU, PILLAR_MAX, PLANNABLE_TYPES, PLAN_CAP_PLAYER, PLAN_NON_DIGGABLE_MAX, ROOF_MIN_BU,
  digFactor, maxEntrancesFor, nestTemplate,
} from '@/sim/balance/nest';
import { OPEN_MIN } from '../carve/keys';
import { nestComponents } from '../entrances';
import { moistureAt, sMax, wallMin } from '../substrate';
import { packSample } from '../voxelKey';
import { buildGeometry, planG, type PlanGeometry } from './geometry';
import { draftPlan, nearestNestOpen, resolvePlan, type ResolvedPlan } from './resolve';
import { forPlanSamples, planCache, planSpecies, sampleDiggable, sampleInOpenAir } from './targets';

export interface ValidationResult extends PlanValidation {
  /** Resolved record parts and geometry when the request could be built. */
  resolved: ResolvedPlan | null;
  geometry: PlanGeometry | null;
  pillars: number;
  /** Diggable target samples (open or diggable) and closed non-diggable ones of the volume (packed), for the plan cache. */
  samples?: { targets: number[]; hard: number[] };
}

const TERMINAL = new Set(['complete', 'cancelled']);

function fail(code: PlanValidationCode, r: Partial<ValidationResult> = {}): ValidationResult {
  return { ok: false, codes: [code], warnings: [], targetVolume: 0, resolved: null, geometry: null, pillars: 0, ...r };
}

function adultWorkers(sim: Sim, colony: number): number {
  let n = 0;
  for (const a of sim.stores.ants.list) if (a.alive && a.colony === colony && a.caste !== 'queen' && a.caste !== 'gyne' && a.caste !== 'male') n++;
  return n;
}

/** Pillar count fixing an unstable span (GDD 03 §7.3), or -1 when no layout can. */
function pillarsFor(w: number, l: number, smax: number): number {
  if (w <= smax) return 0;
  if ((w - PILLAR_D_BU) / 2 > smax) return -1;
  const count = Math.floor(l / (smax + PILLAR_D_BU));
  return count >= 1 && count <= PILLAR_MAX ? count : -1;
}

export function validatePlanImpl(sim: Sim, spec: PlanSpec, source: PlanSource): ValidationResult {
  const nest = sim.stores.nests.get(spec.nestId);
  if (!nest || !spec.anchor) return fail('anchor-not-in-nest');
  const bu = sim.world.bu, v = sim.carve.voxel, species = planSpecies(sim, nest), t = nestTemplate(species);
  const strict = source !== 'player';
  // anchor-not-in-nest
  if (spec.kind !== 'entrance' && spec.kind !== 'seal' && spec.kind !== 'reopen' && !nearestNestOpen(sim, nest, spec.anchor.pos, ANCHOR_SNAP_BU * bu)) {
    return fail('anchor-not-in-nest');
  }
  const resolved = resolvePlan(sim, nest, spec);
  if (!resolved) return fail('anchor-not-in-nest');
  // type-not-allowed
  if (spec.kind === 'chamber') {
    const type = spec.chamberType ?? 'general';
    const allowed = PLANNABLE_TYPES[species] ?? [];
    if (!allowed.includes(type) && !(strict && type === 'royal')) return fail('type-not-allowed', { resolved });
  }
  // geometry; a chamber that needs pillars is rebuilt with them below
  const draft = draftPlan(nest, spec, resolved);
  let geometry = buildGeometry(draft, species, bu);
  if (!geometry) return fail('too-large', { resolved }); // the species does not build that size
  // out-of-bounds
  const size = sim.world.size, margin = BOUNDS_MARGIN_BU * bu;
  if (geometry.min.x < margin || geometry.min.z < margin || geometry.max.x > size - margin || geometry.max.z > size - margin
    || geometry.min.y < sim.field.height(geometry.min.x, geometry.min.z) - t.maxDepth * bu
    || Math.hypot((geometry.min.x + geometry.max.x) / 2 - nest.origin.x, (geometry.min.z + geometry.max.z) / 2 - nest.origin.z) > t.footprintR * bu) {
    return fail('out-of-bounds', { resolved, geometry });
  }
  // unstable (chambers): the span rule at the ceiling material and moisture; pillars where they fix it. The pillar
  // layout changes the target volume, so it is decided here; `unstable` itself is reported in the GDD's order,
  // after too-large.
  let pillars = 0, unstable = false;
  if (spec.kind === 'chamber' && geometry.ellipsoid) {
    const e = geometry.ellipsoid;
    const top = { x: e.c.x, y: e.c.y + e.hh + v, z: e.c.z };
    const ceiling = sim.field.materialAt(top);
    if (digFactor(species, ceiling) > 0) {
      const w = (2 * e.hw) / bu, l = (2 * e.hl) / bu;
      pillars = pillarsFor(w, l, sMax(ceiling, moistureAt(sim, top)));
      if (pillars < 0) { unstable = true; pillars = 0; }
      if (pillars > 0) {
        draft.geom.length = pillars;
        resolved.geom.length = pillars;
        geometry = buildGeometry(draft, species, bu) as PlanGeometry;
      }
    }
  }
  const codes: PlanValidationCode[] = [], warnings: PlanValidationCode[] = [];
  const soft = (c: PlanValidationCode) => { const list = strict ? codes : warnings; if (!list.includes(c)) list.push(c); };
  // target samples: water, non-diggable share, target volume
  let notOpen = 0, nonDig = 0;
  const target = new Set<number>();
  const cols = new Map<number, [number, number, number, number]>(); // column -> i, k, top j, bottom j
  const diggable: number[] = [], hard: number[] = [];
  forPlanSamples(sim, geometry, (i, j, k) => {
    if (sampleInOpenAir(sim, i, j, k)) return; // nothing to dig (a shaft overshooting the surface)
    const key = packSample(i, j, k);
    target.add(key);
    const col = packSample(i, 0, k), c = cols.get(col);
    if (!c) cols.set(col, [i, k, j, j]); else { c[2] = Math.max(c[2], j); c[3] = Math.min(c[3], j); }
    if (sim.carve.sampleAt(i, j, k) >= OPEN_MIN) { diggable.push(key); return; }
    notOpen++;
    if (sampleDiggable(sim, species, i, j, k)) diggable.push(key);
    else { nonDig++; hard.push(key); }
  });
  if (inWater(sim, nest, geometry)) return fail('water', { resolved, geometry });
  if (notOpen > 0 && nonDig / notOpen > PLAN_NON_DIGGABLE_MAX) return fail('non-diggable', { resolved, geometry });
  const targetVolume = (notOpen - nonDig) * (v / bu) ** 3;
  // overlaps-plan
  for (const p of nest.digPlans) {
    if (TERMINAL.has(p.status) || p.kind === 'seal' || p.kind === 'reopen') continue;
    const other = planCache(sim, nest, p)?.geometry;
    if (!other || !boxesOverlap(other, geometry)) continue;
    let hit = false;
    forPlanSamples(sim, geometry, (i, j, k) => { if (!hit && planG(other, i * v, j * v, k * v) > 0) hit = true; });
    if (hit) return fail('overlaps-plan', { resolved, geometry });
  }
  // too-large: entrance cap, volume cap, player plan cap
  if (spec.kind === 'entrance') {
    const open = nest.entrances.filter((e) => e.status === 'open' || e.status === 'sealing').length;
    if (open >= maxEntrancesFor(species, adultWorkers(sim, nest.colony))) codes.push('too-large');
  }
  if (nest.volumeOpen + targetVolume > t.volumeCap) codes.push('too-large');
  if (source === 'player' && nest.digPlans.filter((p) => p.source === 'player' && !TERMINAL.has(p.status)).length >= PLAN_CAP_PLAYER) {
    if (!codes.includes('too-large')) codes.push('too-large');
  }
  if (unstable) return { ...fail('unstable', { resolved, geometry }), codes: [...codes, 'unstable'], targetVolume };
  // undermines: roof, floor below, entrance keep-out
  const anchor = resolved.anchor.pos, connection = ANCHOR_CONNECTION_BU * bu;
  const nearAnchor = (x: number, y: number, z: number) => Math.hypot(x - anchor.x, y - anchor.y, z - anchor.z) <= connection;
  const reachesSurface = spec.kind === 'entrance' || (spec.kind === 'shaft' && (resolved.geom.end?.y ?? 0) > anchor.y);
  let n = 0;
  for (const [i, k, top, bottom] of cols.values()) {
    if (n++ % 2 === 1) continue;
    const x = i * v, z = k * v;
    if (!reachesSurface && !nearAnchor(x, top * v, z) && roofBelowMin(sim, x, top * v, z, target, i, k)) { soft('undermines'); break; }
    for (let j = bottom - 1; j >= bottom - Math.ceil((FLOOR_MIN_BU * bu) / v); j--) {
      if (sim.carve.sampleAt(i, j, k) >= OPEN_MIN && !nearAnchor(x, j * v, z)) { soft('undermines'); break; }
    }
  }
  for (const e of nest.entrances) {
    if (reachesSurface) break;
    for (const [i, k, top] of cols.values()) {
      const x = i * v, z = k * v;
      if (Math.hypot(x - e.pos.x, z - e.pos.z) > ENTRANCE_KEEPOUT_BU * bu || nearAnchor(x, top * v, z)) continue;
      if (e.pos.y - top * v < ENTRANCE_KEEPOUT_DEPTH_BU * bu) { soft('undermines'); break; }
    }
  }
  // too-close / foreign-nest: soil between the new volume and other cavities
  const material = sim.field.materialAt(centreOf(geometry));
  const wm = wallMin(material) * bu;
  const own = nestComponents(sim, nest);
  for (let k = Math.floor((geometry.min.z - wm) / v); k <= Math.ceil((geometry.max.z + wm) / v); k++)
    for (let j = Math.floor((geometry.min.y - wm) / v); j <= Math.ceil((geometry.max.y + wm) / v); j++)
      for (let i = Math.floor((geometry.min.x - wm) / v); i <= Math.ceil((geometry.max.x + wm) / v); i++) {
        if (sim.carve.sampleAt(i, j, k) < OPEN_MIN) continue;
        const x = i * v, y = j * v, z = k * v;
        const g = planG(geometry, x, y, z);
        if (g > 0 || g <= -wm || nearAnchor(x, y, z) || sim.field.substrateXYZ(x, y, z) > 0) continue;
        const c = sim.nestNav.componentAt({ x, y, z });
        if (c >= 0 && !own.has(c) && foreignComponent(sim, nest, c)) soft('foreign-nest');
        else soft('too-close');
      }
  return { ok: codes.length === 0, codes, warnings, targetVolume, resolved, geometry, pillars, samples: { targets: diggable, hard } };
}

/** Soil roof above a column top thinner than ROOF_MIN with no non-diggable cover within COVER_SCAN? */
function roofBelowMin(sim: Sim, x: number, yTop: number, z: number, target: Set<number>, i: number, k: number): boolean {
  const v = sim.carve.voxel, bu = sim.world.bu;
  const need = ROOF_MIN_BU * bu;
  for (let y = yTop + v; y - yTop <= COVER_SCAN_BU * bu; y += 0.5 * v) {
    if (sim.field.hardXYZ(x, y, z) <= 0) return false; // a stone or slab roof
    if (y - yTop <= need && sim.field.sampleXYZ(x, y, z) > 0 && !target.has(packSample(i, Math.round(y / v), k))) return true;
    if (y - yTop > need) return false;
  }
  return false;
}

function centreOf(g: PlanGeometry): Vec3 {
  if (g.ellipsoid) return g.ellipsoid.c;
  return { x: (g.min.x + g.max.x) / 2, y: (g.min.y + g.max.y) / 2, z: (g.min.z + g.max.z) / 2 };
}

function boxesOverlap(a: PlanGeometry, b: PlanGeometry): boolean {
  return a.min.x <= b.max.x && a.max.x >= b.min.x && a.min.y <= b.max.y && a.max.y >= b.min.y && a.min.z <= b.max.z && a.max.z >= b.min.z;
}

function inWater(sim: Sim, nest: Nest, g: PlanGeometry): boolean {
  if (nest.flood.water > 0 && g.min.y < nest.flood.level) return true;
  for (const w of sim.world.waterBodies) {
    const dx = Math.max(g.min.x - w.pos.x, 0, w.pos.x - g.max.x), dz = Math.max(g.min.z - w.pos.z, 0, w.pos.z - g.max.z);
    if (Math.hypot(dx, dz) <= w.radius && g.min.y < w.pos.y + (sim.state.worldDelta.waterLevels[w.id] ?? w.levelMm)) return true;
  }
  return false;
}

function foreignComponent(sim: Sim, nest: Nest, c: number): boolean {
  for (const other of sim.stores.nests.list) {
    if (!other.alive || other.colony === nest.colony) continue;
    if (nestComponents(sim, other).has(c)) return true;
  }
  return false;
}
