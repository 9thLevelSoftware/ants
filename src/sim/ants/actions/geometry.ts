// Where targets are and whether an ant can reach them (GDD 01 §7.2): mandible point, reach, cone, target lookup.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Entrance, Nest, Sim, TargetRef } from '@/sim/types';
import {
  ANT_TARGET_RADIUS_L, BROOD_RADIUS_BU, ITEM_RADIUS_BU, MANDIBLE_FWD_L, REACH_CONE_DEG, REACH_L,
} from '@/sim/balance/actions';
import { ports } from './ports';

const DEG = Math.PI / 180;

/** Body length of the ant, mm. */
export function antLengthMm(sim: Sim, ant: Ant): number {
  return ant.lengthBu * sim.world.bu;
}

/** Mandible point: the head front of the ant, mm. */
export function mandiblePoint(sim: Sim, ant: Ant, out: Vec3): Vec3 {
  const d = MANDIBLE_FWD_L * antLengthMm(sim, ant);
  out.x = ant.pos.x + ant.fwd.x * d;
  out.y = ant.pos.y + ant.fwd.y * d;
  out.z = ant.pos.z + ant.fwd.z * d;
  return out;
}

/** Reach distance of an ant from its mandible point, mm (without the target radius). */
export function reachMm(sim: Sim, ant: Ant): number {
  return REACH_L * antLengthMm(sim, ant);
}

/** An entrance and its nest by entrance id. */
export function findEntrance(sim: Sim, entranceId: number): { nest: Nest; entrance: Entrance } | null {
  for (const nest of sim.stores.nests.list) {
    if (!nest.alive) continue;
    for (const e of nest.entrances) if (e.id === entranceId) return { nest, entrance: e };
  }
  return null;
}

/** A resolved target: its current centre and radius (mm). */
export interface TargetPlace {
  pos: Vec3;
  radius: number;
}

/**
 * Current position and radius of a target, or null if it no longer exists (dead, carried by someone else ...).
 * 'none' means the ant itself. Writes into `out.pos`.
 */
export function placeOf(sim: Sim, ant: Ant, t: TargetRef, out: TargetPlace): TargetPlace | null {
  const bu = sim.world.bu;
  const set = (p: Vec3, r: number): TargetPlace => {
    out.pos.x = p.x; out.pos.y = p.y; out.pos.z = p.z; out.radius = r;
    return out;
  };
  switch (t.kind) {
    case 'none':
      return set(ant.pos, 0);
    case 'surface':
    case 'point':
      return set(t.pos, 0);
    case 'ant': {
      const a = sim.stores.ants.get(t.id);
      return a ? set(a.pos, ANT_TARGET_RADIUS_L * a.lengthBu * bu) : null;
    }
    case 'brood': {
      const b = sim.stores.brood.get(t.id);
      if (!b || (b.carriedBy !== -1 && b.carriedBy !== ant.id)) return null;
      return set(b.carriedBy === ant.id ? ant.pos : b.pos, BROOD_RADIUS_BU[b.stage] * bu);
    }
    case 'item': {
      const it = sim.stores.items.get(t.id);
      if (!it) return null;
      const r = it.lengthMm > 0 ? it.lengthMm / 2 : ITEM_RADIUS_BU * bu * Math.cbrt(Math.max(it.bulk, 0.1));
      return set(it.carrierIds.includes(ant.id) ? ant.pos : it.pos, r);
    }
    case 'source': {
      const s = sim.stores.sources.get(t.id);
      return s ? set(s.pos, ports.sourceFootprintMm(s, bu)) : null;
    }
    case 'creature': {
      const c = sim.stores.creatures.get(t.id);
      return c ? set(c.pos, c.radius) : null;
    }
    case 'entrance': {
      const e = findEntrance(sim, t.id);
      return e ? set(e.entrance.pos, e.entrance.radius) : null;
    }
    default:
      return null;
  }
}

const scratchM = { x: 0, y: 0, z: 0 };

/** Distance from the mandible point to the target's surface, mm (0 when touching). */
export function contactDistance(sim: Sim, ant: Ant, place: TargetPlace): number {
  const m = mandiblePoint(sim, ant, scratchM);
  const d = Math.hypot(place.pos.x - m.x, place.pos.y - m.y, place.pos.z - m.z) - place.radius;
  return d > 0 ? d : 0;
}

/** Angle between the ant's forward and the direction from its body centre to p, degrees (0 if p is at the ant). */
export function bearingDeg(ant: Ant, p: Vec3): number {
  const dx = p.x - ant.pos.x, dy = p.y - ant.pos.y, dz = p.z - ant.pos.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return 0;
  const c = (dx * ant.fwd.x + dy * ant.fwd.y + dz * ant.fwd.z) / len;
  return Math.acos(Math.max(-1, Math.min(1, c))) / DEG;
}

/** Contact reach test: within REACH_L of the mandible point (plus target radius) and inside the cone. */
export function inReach(sim: Sim, ant: Ant, place: TargetPlace, rangeMm = reachMm(sim, ant), coneDeg = REACH_CONE_DEG): boolean {
  if (contactDistance(sim, ant, place) > rangeMm) return false;
  // A target that touches the mandibles is in the cone by definition (e.g. a larva right under the head).
  if (place.radius > 0 && Math.hypot(place.pos.x - ant.pos.x, place.pos.y - ant.pos.y, place.pos.z - ant.pos.z) <= place.radius) {
    return true;
  }
  return bearingDeg(ant, place.pos) <= coneDeg;
}

/** Ground point under the ant (its position minus the foot offset along up), into out. */
export function feetPoint(ant: Ant, out: Vec3): Vec3 {
  out.x = ant.pos.x - ant.up.x * ant.footOffset;
  out.y = ant.pos.y - ant.up.y * ant.footOffset;
  out.z = ant.pos.z - ant.up.z * ant.footOffset;
  return out;
}

/** Fresh TargetRef helpers (allocate). */
export function selfTarget(ant: Ant): TargetRef {
  return { kind: 'none', id: -1, pos: { x: ant.pos.x, y: ant.pos.y, z: ant.pos.z } };
}

export function entityTarget(kind: TargetRef['kind'], id: number, pos: Vec3): TargetRef {
  return { kind, id, pos: { x: pos.x, y: pos.y, z: pos.z } };
}
