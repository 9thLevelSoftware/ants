// Wood state per wood primitive (GDD 07 §6.2.1, App. A.4): which primitives are nest wood for a species, the
// derived record (placement, grain, thickness, segments) created on first use, and lookups by primitive or point.
// Records live in state.worldDelta.wood in primitive-id order; the id -> index map is a derived cache.

import type { Vec3 } from '@/core/math/vec3';
import type { Primitive, Sim, SpeciesId, WoodPlacement, WoodState } from '@/sim/types';
import { PrimFlag } from '@/sim/types';
import { digFactor } from '@/sim/balance/nest';
import {
  MC_FENCE_TOP_PCT, MC_LOG_UPPER_DROP_PCT, MC_PLACE_PCT, SUN_EXPOSURE_OPEN, SUN_EXPOSURE_SHELTERED, WOOD_NEST_MIN_THICK_BU,
  WOOD_SEGMENT_MIN_BU, WOOD_SEGMENTS_MAX,
} from '@/sim/balance/species-carpenter';
import { isInteriorAt } from '@/sim/environment/ground';
import { alongGrain, grainAxisOf, lengthMm, primDistance, thicknessMm } from './primGeom';

const WOOD_MATERIALS: ReadonlySet<string> = new Set(['wood-sound', 'wood-decayed']);

/** Placement of the wood of a world object template (GDD 04 placements, GDD 07 §6.2.1); others by position. */
const TEMPLATE_PLACEMENT: Readonly<Record<string, WoodPlacement>> = {
  log: 'log-on-soil', 'repair-log': 'log-on-soil', 'fallen-branch': 'log-on-soil', stump: 'stump',
  'standing-tree': 'living-tree-wound', fence: 'fence-post', 'raised-bed-board': 'fence-post', 'sand-edging': 'fence-post',
  'back-door': 'door-frame-ext', firewood: 'firewood', 'window-sill': 'window-sill',
};

/** Is this primitive wood the species can nest in: diggable wood thick enough for a gallery with walls. */
export function isNestWood(prim: Primitive, species: SpeciesId, bu: number): boolean {
  if (!WOOD_MATERIALS.has(prim.material) || (prim.flags & PrimFlag.DIGGABLE) === 0) return false;
  if (digFactor(species, prim.material) <= 0) return false;
  return thicknessMm(prim) >= WOOD_NEST_MIN_THICK_BU * bu;
}

const indexCache = new WeakMap<WoodState[], Map<number, number>>();

function indexOf(list: WoodState[]): Map<number, number> {
  let m = indexCache.get(list);
  if (!m || m.size !== list.length) {
    m = new Map();
    list.forEach((w, i) => m!.set(w.primId, i));
    indexCache.set(list, m);
  }
  return m;
}

/** The world primitive of a wood record (static or dynamic), or undefined. */
export function primOf(sim: Sim, primId: number): Primitive | undefined {
  const s = sim.world.prims[primId];
  if (s && s.id === primId) return s;
  return sim.world.prims.find((p) => p.id === primId) ?? sim.state.worldDelta.dynPrims.find((p) => p.id === primId);
}

function placementOf(sim: Sim, prim: Primitive, interior: boolean): WoodPlacement {
  const obj = prim.objectId >= 0 ? sim.world.objects.find((o) => o.id === prim.objectId) : undefined;
  const tagged = obj ? TEMPLATE_PLACEMENT[obj.templateId] : undefined;
  const ground = sim.field.height(prim.pos.x, prim.pos.z);
  // roots and the buried parts of logs (centre below the ground) are buried wood
  if (prim.pos.y < ground && !interior) return 'buried-log';
  if (tagged) return tagged;
  return interior ? 'structural-dry' : 'log-on-soil';
}

/** Is the column above the top of the primitive sheltered (another solid within 200 BU straight above)? */
function sheltered(sim: Sim, prim: Primitive): boolean {
  const top = { x: prim.pos.x, y: prim.pos.y + thicknessMm(prim), z: prim.pos.z };
  return sim.field.sphereTrace(top, { x: 0, y: 1, z: 0 }, 200 * sim.world.bu, 0) < 200 * sim.world.bu;
}

/** Starting moisture of segment i (centre `c`) of a fresh record (§6.2.2 MC_PLACE with the per-placement splits). */
function segmentStartMc(sim: Sim, prim: Primitive, placement: WoodPlacement, c: Vec3, frac: number): number {
  const base = MC_PLACE_PCT[placement];
  if (placement === 'fence-post') return base + (MC_FENCE_TOP_PCT - base) * frac;
  if (placement === 'log-on-soil') {
    const ground = sim.field.height(c.x, c.z);
    return c.y - ground > 0.5 * thicknessMm(prim) ? base - MC_LOG_UPPER_DROP_PCT : base;
  }
  return base;
}

/** A fresh wood record for a nest-wood primitive (decayed material starts at decay class 2, sound at 0) [EST]. */
export function createWoodState(sim: Sim, prim: Primitive): WoodState {
  const bu = sim.world.bu;
  const interior = isInteriorAt(sim.world, prim.pos.x, prim.pos.z);
  const placement = placementOf(sim, prim, interior);
  const axis = grainAxisOf(prim);
  // a vertical piece runs bottom (segment 0) to top: point the axis up
  if (axis.y < 0) { axis.x = -axis.x; axis.y = -axis.y; axis.z = -axis.z; }
  const len = lengthMm(prim);
  const n = Math.max(1, Math.min(WOOD_SEGMENTS_MAX, Math.floor(len / (WOOD_SEGMENT_MIN_BU * bu))));
  const decay = prim.material === 'wood-decayed' ? 2 : 0;
  const segments: NonNullable<WoodState['segments']> = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n - 0.5;
    const c = { x: prim.pos.x + axis.x * t * len, y: prim.pos.y + axis.y * t * len, z: prim.pos.z + axis.z * t * len };
    const base = segmentStartMc(sim, prim, placement, c, n === 1 ? 0 : i / (n - 1));
    segments.push({ mc: base, decay, decayGd: 0, base });
  }
  const sun = interior ? 0 : sheltered(sim, prim) ? SUN_EXPOSURE_SHELTERED : SUN_EXPOSURE_OPEN;
  return {
    primId: prim.id, moisture: segments[0].mc, decay, placement, grainAxis: axis, thicknessBu: thicknessMm(prim) / bu,
    lengthBu: len / bu, carvedFrac: 0, sunExposure: sun, windowCount: 0, interior, segments, lastRainTick: -1,
  };
}

/**
 * Makes sure every nest-wood primitive of the played species has a record (first call after a new game or a load
 * of an older save). Cheap after the first call: the list is complete once its length matches.
 */
export function ensureWoodStates(sim: Sim): WoodState[] {
  const list = sim.state.worldDelta.wood;
  const species = sim.species.id as SpeciesId;
  const bu = sim.world.bu;
  const key = `${sim.world.prims.length}:${sim.state.worldDelta.dynPrims.length}`;
  if (ensured.get(list) === key) return list;
  const have = indexOf(list);
  let added = false;
  for (const p of sim.world.prims) {
    if (!have.has(p.id) && isNestWood(p, species, bu)) { list.push(createWoodState(sim, p)); added = true; }
  }
  if (added) list.sort((a, b) => a.primId - b.primId);
  ensured.set(list, key);
  return list;
}
const ensured = new WeakMap<WoodState[], string>();

/** The wood record of a primitive, creating it if the primitive is nest wood; undefined otherwise. */
export function woodOf(sim: Sim, primId: number): WoodState | undefined {
  const list = ensureWoodStates(sim);
  const i = indexOf(list).get(primId);
  return i === undefined ? undefined : list[i];
}

/** The nest-wood primitive at (or within `maxDist` of) p, with its record; null outside wood. */
export function woodAt(sim: Sim, p: Vec3, maxDist = 0): { prim: Primitive; wood: WoodState } | null {
  const prim = sim.field.primAt(p, maxDist);
  if (!prim) return null;
  const wood = woodOf(sim, prim.id);
  return wood ? { prim, wood } : null;
}

/** Segment index of p in a wood record (along the grain from segment 0). */
export function segmentIndexAt(prim: Primitive, wood: WoodState, p: Vec3): number {
  const n = wood.segments?.length ?? 1;
  const axis = wood.grainAxis ?? grainAxisOf(prim);
  return Math.min(n - 1, Math.floor(alongGrain(prim, axis, p) * n));
}

/** Moisture %, and decay class, of the wood at p (segment value), or null outside nest wood. */
export function woodClimateAt(sim: Sim, p: Vec3, maxDist = 0): { mc: number; decay: number; primId: number } | null {
  const hit = woodAt(sim, p, maxDist);
  if (!hit) return null;
  const seg = hit.wood.segments?.[segmentIndexAt(hit.prim, hit.wood, p)];
  return { mc: seg?.mc ?? hit.wood.moisture, decay: seg?.decay ?? hit.wood.decay, primId: hit.prim.id };
}

/** Depth of p inside the wood primitive (distance to its surface), mm; 0 outside. */
export function depthInWood(prim: Primitive, p: Vec3): number {
  return Math.max(0, -primDistance(prim, p));
}
