// Where things are in a nest, for the in-nest behaviours: the ant's nest, its chambers by role (food store,
// royal, rest, entrance chamber), pile points on chamber floors and the colony midden (GDD 02 §10.8). All pure
// reads of state and the static world.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Chamber, ChamberType, Colony, Entrance, Nest, Sim } from '@/sim/types';
import { nestFieldId } from '@/sim/types';
import { perTick } from './perTick';
import { MIDDEN_DIRECTIONS, MIDDEN_DIST_BU, PILE_RADIUS_BU, PILE_SPREAD, REACHABLE_ABOVE_BU } from '@/sim/balance/nestwork';

export function colonyOf(sim: Sim, ant: Ant): Colony | undefined {
  return sim.stores.colonies.get(ant.colony);
}

/** The nest the ant works in: the one it stands in, else its colony's main nest. */
export function homeNest(sim: Sim, ant: Ant): Nest | undefined {
  const n = ant.nestId >= 0 ? sim.stores.nests.get(ant.nestId) : undefined;
  if (n && n.colony === ant.colony) return n;
  const col = colonyOf(sim, ant);
  return col ? sim.stores.nests.get(col.nestIds[0]) : undefined;
}

export function chamberIn(nest: Nest, id: number): Chamber | undefined {
  for (const c of nest.chambers) if (c.id === id) return c;
  return undefined;
}

export function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Nearest chamber of one of the types to p (straight distance, ties by id), or undefined. */
export function nearestOfType(nest: Nest, types: readonly ChamberType[], p: Vec3): Chamber | undefined {
  let best: Chamber | undefined, bestD = Infinity;
  for (const c of nest.chambers) {
    if (!types.includes(c.type)) continue;
    const d = dist(c.center, p);
    if (d < bestD || (d === bestD && best && c.id < best.id)) { best = c; bestD = d; }
  }
  return best;
}

/** The chamber nearest the open entrances along the nest (smallest exit-field distance). */
export function entranceChamber(sim: Sim, nest: Nest): Chamber | undefined {
  return perTick(sim, `ec:${nest.id}`, () => computeEntranceChamber(sim, nest));
}

function computeEntranceChamber(sim: Sim, nest: Nest): Chamber | undefined {
  const exit = nestFieldId(nest.id, { kind: 'exit', id: -1 });
  const has = sim.nestNav.hasTarget(exit);
  let best: Chamber | undefined, bestD = Infinity;
  for (const c of nest.chambers) {
    const d = has ? sim.nestNav.distanceAt(exit, c.center) : c.depthMm;
    const dd = Number.isFinite(d) ? d : 1e12 + c.depthMm;
    if (dd < bestD || (dd === bestD && best && c.id < best.id)) { best = c; bestD = dd; }
  }
  return best;
}

/** Food store chamber nearest p: a `food` chamber, else `general`, else the entrance chamber (GDD 02 §5.3). */
export function foodChamber(sim: Sim, nest: Nest, p: Vec3): Chamber | undefined {
  return nearestOfType(nest, ['food'], p) ?? nearestOfType(nest, ['general'], p) ?? entranceChamber(sim, nest);
}

/** The queen's chamber: `royal`, else `founding`, else the deepest chamber. */
export function royalChamber(nest: Nest): Chamber | undefined {
  let best: Chamber | undefined;
  for (const c of nest.chambers) if (c.type === 'royal' && (!best || c.id < best.id)) best = c;
  if (best) return best;
  for (const c of nest.chambers) if (c.type === 'founding' && (!best || c.id < best.id)) best = c;
  if (best) return best;
  for (const c of nest.chambers) if (!best || c.depthMm > best.depthMm) best = c;
  return best;
}

/** Where idle and resting ants stay: a `rest` / `general` chamber near the royal chamber, else the entrance chamber. */
export function restChamber(sim: Sim, nest: Nest): Chamber | undefined {
  return perTick(sim, `rest:${nest.id}`, () => computeRestChamber(sim, nest));
}

function computeRestChamber(sim: Sim, nest: Nest): Chamber | undefined {
  const centre = royalChamber(nest)?.center ?? nest.origin;
  return nearestOfType(nest, ['rest'], centre) ?? nearestOfType(nest, ['general'], centre) ?? entranceChamber(sim, nest);
}

/** Height of a chamber's ellipsoid floor above (x, z), mm (its centre height outside the footprint). */
export function floorY(c: Chamber, x: number, z: number): number {
  const u = (x - c.center.x) / c.radii.x, w = (z - c.center.z) / c.radii.z;
  return c.center.y - c.radii.y * Math.sqrt(Math.max(0, 1 - u * u - w * w));
}

/** A floor point of a chamber at `frac` of its horizontal radii in direction angle (radians), into out. */
export function floorPoint(c: Chamber, frac: number, angle: number, out: Vec3): Vec3 {
  out.x = c.center.x + Math.cos(angle) * c.radii.x * frac;
  out.z = c.center.z + Math.sin(angle) * c.radii.z * frac;
  out.y = floorY(c, out.x, out.z);
  return out;
}

/** The golden angle, rad: successive items of a pile spread evenly around its point (sunflower spiral). */
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Pile point for brood put down in a chamber: a fixed spot per stage group so piles form (GDD 02 §10.4.1). */
export function pilePoint(c: Chamber, group: number, out: Vec3): Vec3 {
  return floorPoint(c, PILE_SPREAD, (group * 2 * Math.PI) / 3 + 0.5, out);
}

/**
 * The place of one item in a pile: around the pile point on a sunflower spiral by `k` (an id), within
 * PILE_RADIUS_BU, so the nurses of a pile can reach every item from some side.
 */
export function pileSlot(c: Chamber, group: number, k: number, bu: number, out: Vec3): Vec3 {
  pilePoint(c, group, out);
  const r = PILE_RADIUS_BU * bu * Math.sqrt(((k * 7) % 23) / 23), a = k * GOLDEN_ANGLE;
  out.x += Math.cos(a) * r;
  out.z += Math.sin(a) * r;
  out.y = floorY(c, out.x, out.z);
  return out;
}

/** Nearest open entrance of the nest to p. */
export function nearestOpenEntrance(nest: Nest, p: Vec3): Entrance | undefined {
  let best: Entrance | undefined, bestD = Infinity;
  for (const e of nest.entrances) {
    if (e.status !== 'open') continue;
    const d = dist(e.pos, p);
    if (d < bestD) { best = e; bestD = d; }
  }
  return best;
}

/**
 * The colony midden (GDD 02 §10.8): a `midden` chamber if the nest has one (its floor centre), else a surface
 * point MIDDEN_DIST_BU from the main entrance in the most downhill of MIDDEN_DIRECTIONS open directions. A pure
 * function of the static world and the entrance, so it never moves and is the same after a load. (The GDD's
 * "10 BU from any trail" clause is not applied: trails change, the midden must not.)
 */
export function middenPoint(sim: Sim, nest: Nest, out: Vec3): Vec3 | null {
  const p = perTick(sim, `mid:${nest.id}`, () => computeMidden(sim, nest, { x: 0, y: 0, z: 0 }));
  if (!p) return null;
  out.x = p.x; out.y = p.y; out.z = p.z;
  return out;
}

function computeMidden(sim: Sim, nest: Nest, out: Vec3): Vec3 | null {
  const room = nest.chambers.find((c) => c.type === 'midden');
  if (room) return floorPoint(room, 0, 0, out);
  // a surface midden needs an open entrance to reach it (the GDD's internal dump is not implemented: see haul.ts)
  const e = nest.entrances.find((x) => x.status === 'open');
  if (!e) return null;
  const r = MIDDEN_DIST_BU * sim.world.bu;
  let bestY = Infinity, found = false;
  for (let k = 0; k < MIDDEN_DIRECTIONS; k++) {
    const a = (k / MIDDEN_DIRECTIONS) * 2 * Math.PI;
    const x = e.pos.x + Math.cos(a) * r, z = e.pos.z + Math.sin(a) * r;
    if (x < 0 || z < 0 || x > sim.world.size || z > sim.world.size || sim.navGrid.blocked(x, z)) continue;
    const y = sim.field.height(x, z);
    if (y < bestY - 1e-9) { bestY = y; out.x = x; out.y = y; out.z = z; found = true; }
  }
  return found ? out : null;
}

/**
 * Can an ant standing on a surface reach a thing lying at p? False for things floating in a cavity (no solid
 * within REACHABLE_ABOVE_BU straight below): nothing walks there, so no job is made of them.
 */
export function onSurface(sim: Sim, p: Vec3): boolean {
  const max = REACHABLE_ABOVE_BU * sim.world.bu;
  return sim.field.sample(p) <= 0 || sim.field.sphereTrace(p, DOWN, max, 0) < max;
}

const DOWN: Vec3 = { x: 0, y: -1, z: 0 };
