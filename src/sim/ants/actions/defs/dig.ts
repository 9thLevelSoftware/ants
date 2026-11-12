// dig-bite, seal-entrance, unseal-entrance (GDD 01 §7.3; effects owned by the nest module, GDD 03 §1.2, §4).

import type { Vec3 } from '@/core/math/vec3';
import type { ActionFailReason, Ant, Entrance, Sim, TargetRef } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import {
  DIG_ADVANCE_L, DIG_BITE_DEPTH_BU, DIG_BITE_S, DIG_FLOOR_AHEAD_BU, DIG_MIN_SPEED, DIG_POWER, DIG_POWER_NANITIC,
  DIG_SLOPE_DEFAULT_DEG, DIG_SLOPE_MAX_DEG, DIG_SLOPE_MIN_DEG, PELLET_BULK_PER_BU3, PLUG_DIG_FACTOR, SEAL_ENTRANCE_S,
  SEAL_THROAT_BU, UNSEAL_PELLET_VOLUME_BU3,
} from '@/sim/balance/actions';
import { removeItem, spawnItem } from '@/sim/entities';
import { carriedItem, releaseCarried, takeItem } from '../carry';
import { antLengthMm, feetPoint, findEntrance, mandiblePoint, reachMm } from '../geometry';
import { ports } from '../ports';
import type { ActionDef } from '../types';

const DEG = Math.PI / 180;

/** Dig power of the ant's caste; 0 = it cannot dig (established queens, alates, minims). */
export function digPower(ant: Ant): number {
  if (ant.caste === 'queen' && (ant.flags & AntFlag.FOUNDING) === 0) return 0;
  const p = DIG_POWER[ant.caste] ?? 0;
  return ant.caste === 'worker' && (ant.flags & AntFlag.NANITIC) !== 0 ? DIG_POWER_NANITIC : p;
}

const mp = { x: 0, y: 0, z: 0 };
const n = { x: 0, y: 0, z: 0 };

/**
 * Where the next bite lands: the face hit straight ahead from the mandible point within `maxMm`, else the walking
 * surface DIG_FLOOR_AHEAD_BU ahead of the head (GDD 03 §1.2 "the ant digs the floor it stands on"). Into out.
 */
export function digContact(sim: Sim, ant: Ant, maxMm: number, out: Vec3): Vec3 {
  mandiblePoint(sim, ant, mp);
  const t = sim.field.sphereTrace(mp, ant.fwd, maxMm, 0);
  if (t < maxMm) {
    out.x = mp.x + ant.fwd.x * t; out.y = mp.y + ant.fwd.y * t; out.z = mp.z + ant.fwd.z * t;
    return out;
  }
  const a = DIG_FLOOR_AHEAD_BU * sim.world.bu;
  out.x = mp.x + ant.fwd.x * a - ant.up.x * ant.footOffset;
  out.y = mp.y + ant.fwd.y * a - ant.up.y * ant.footOffset;
  out.z = mp.z + ant.fwd.z * a - ant.up.z * ant.footOffset;
  return out;
}

/** The point inside the solid whose material decides the dig speed, into out. */
function digSamplePoint(sim: Sim, contact: Vec3, out: Vec3): Vec3 {
  sim.field.normal(contact, n);
  const d = DIG_BITE_DEPTH_BU * sim.world.bu;
  out.x = contact.x - n.x * d; out.y = contact.y - n.y * d; out.z = contact.z - n.z * d;
  return out;
}

const sp = { x: 0, y: 0, z: 0 };

/** digSpeed(material, moisture) at the bite: the field's species diggability there. */
export function digSpeedAt(sim: Sim, ant: Ant, contact: Vec3): number {
  const colony = sim.stores.colonies.get(ant.colony);
  const species = (colony ? sim.getSpecies(colony.species)?.id : undefined) ?? sim.species.id;
  return sim.field.diggability(digSamplePoint(sim, contact, sp), species);
}

/** Horizontal unit heading for the ramp brush; on a wall facing up or down, into the wall. */
export function digHeading(ant: Ant, out: Vec3): Vec3 {
  let x = ant.fwd.x, z = ant.fwd.z;
  if (x * x + z * z < 0.09) { x = -ant.up.x; z = -ant.up.z; }
  const len = Math.hypot(x, z);
  if (len < 1e-6) { out.x = 1; out.y = 0; out.z = 0; return out; }
  out.x = x / len; out.y = 0; out.z = z / len;
  return out;
}

/** Ramp slope, degrees below the horizontal: aimed by a 'point' target (look up / down), else the default. */
export function digSlopeDeg(ant: Ant, t: TargetRef): number {
  if (t.kind !== 'point') return DIG_SLOPE_DEFAULT_DEG;
  const f = feetPoint(ant, sp);
  const dx = t.pos.x - f.x, dz = t.pos.z - f.z;
  const s = Math.atan2(f.y - t.pos.y, Math.hypot(dx, dz)) / DEG;
  return Math.max(DIG_SLOPE_MIN_DEG, Math.min(DIG_SLOPE_MAX_DEG, s));
}

const contact = { x: 0, y: 0, z: 0 };

function contactFor(sim: Sim, ant: Ant, t: TargetRef): Vec3 {
  return t.kind === 'surface' ? t.pos : digContact(sim, ant, reachMm(sim, ant), contact);
}

function digCheck(sim: Sim, ant: Ant, t: TargetRef): ActionFailReason | null {
  const power = digPower(ant);
  if (power <= 0) return 'caste';
  const it = carriedItem(sim, ant);
  if (ant.carry.kind === 'brood' || (it && it.kind !== 'soil-pellet' && it.kind !== 'frass')) return 'hands-full';
  const c = contactFor(sim, ant, t);
  const speed = digSpeedAt(sim, ant, c);
  if (speed * power < DIG_MIN_SPEED) return 'not-diggable';
  return ports.canDigAt(sim, ant, c) ? null : 'not-allowed-here';
}

/** Drops a carried pellet behind the ant before the next bite (GDD 03 §1.2: inside the same bite duration). */
function dropPelletBehind(sim: Sim, ant: Ant): void {
  if (ant.carry.kind !== 'item') return;
  const f = feetPoint(ant, sp);
  const d = 0.5 * antLengthMm(sim, ant);
  f.x -= ant.fwd.x * d; f.y -= ant.fwd.y * d; f.z -= ant.fwd.z * d;
  releaseCarried(sim, ant, f);
}

const heading = { x: 0, y: 0, z: 0 };
const feet = { x: 0, y: 0, z: 0 };

export const digBiteDef: ActionDef = {
  id: 'dig-bite', kind: 'timed', targets: ['none', 'surface', 'point'], cancellable: true, repeatable: true,
  pose: 'dig', cue: 'dig-bite',
  autoTarget: (sim, ant) => {
    const c = digContact(sim, ant, reachMm(sim, ant), contact);
    return { kind: 'surface', id: -1, pos: { x: c.x, y: c.y, z: c.z } };
  },
  // A face beyond reach but within DIG_ADVANCE_L straight ahead counts: the ant steps forward first (auto-advance).
  reachable: (sim, ant, t) => {
    if (t.kind !== 'surface') return true;
    mandiblePoint(sim, ant, mp);
    const d = Math.hypot(t.pos.x - mp.x, t.pos.y - mp.y, t.pos.z - mp.z);
    return d <= Math.max(reachMm(sim, ant), DIG_ADVANCE_L * antLengthMm(sim, ant));
  },
  check: digCheck,
  durationS: (sim, ant, t) => DIG_BITE_S / Math.max(1e-6, digSpeedAt(sim, ant, contactFor(sim, ant, t)) * digPower(ant)),
  onBegin(sim, ant, t) {
    dropPelletBehind(sim, ant);
    if (t.kind !== 'surface') return;
    mandiblePoint(sim, ant, mp);
    const r = reachMm(sim, ant);
    if (Math.hypot(t.pos.x - mp.x, t.pos.y - mp.y, t.pos.z - mp.z) > r) ports.navTo(sim, ant, t.pos, r);
  },
  effect(sim, ant, t) {
    const res = ports.digBite(sim, ant, feetPoint(ant, feet), digHeading(ant, heading), digSlopeDeg(ant, t));
    if (!res.ok) return res.reason ?? 'no-target';
    const pellet = res.pelletId >= 0 ? sim.stores.items.get(res.pelletId) : undefined;
    if (pellet && ant.carry.kind === 'none' && pellet.carrierIds.length === 0) takeItem(ant, pellet);
    return res.voxels;
  },
};

/** Entrance of the ant's colony whose throat the ant is in (within SEAL_THROAT_BU of the opening, not outside). */
export function entranceAtThroat(sim: Sim, ant: Ant, filter: (e: Entrance) => boolean): Entrance | null {
  const max = SEAL_THROAT_BU * sim.world.bu;
  let best: Entrance | null = null;
  let bestD = Infinity;
  for (const nest of sim.stores.nests.list) {
    if (!nest.alive || nest.colony !== ant.colony) continue;
    for (const e of nest.entrances) {
      if (!filter(e) || !inThroat(sim, ant, e)) continue;
      const d = Math.hypot(ant.pos.x - e.pos.x, ant.pos.y - e.pos.y, ant.pos.z - e.pos.z);
      if (d <= max && (d < bestD || (d === bestD && best && e.id < best.id))) { best = e; bestD = d; }
    }
  }
  return best;
}

function inThroat(sim: Sim, ant: Ant, e: Entrance): boolean {
  const dx = ant.pos.x - e.pos.x, dy = ant.pos.y - e.pos.y, dz = ant.pos.z - e.pos.z;
  if (Math.hypot(dx, dy, dz) > SEAL_THROAT_BU * sim.world.bu + e.radius) return false;
  return dx * e.dir.x + dy * e.dir.y + dz * e.dir.z <= e.radius;
}

function throatReachable(sim: Sim, ant: Ant, t: TargetRef): boolean {
  const e = findEntrance(sim, t.id);
  return e !== null && inThroat(sim, ant, e.entrance);
}

const isPlugged = (e: Entrance): boolean => e.status === 'sealed' || e.status === 'sealing';

export const sealEntranceDef: ActionDef = {
  id: 'seal-entrance', kind: 'timed', targets: ['entrance'], cancellable: true, pose: 'tamp', cue: 'seal-tamp',
  autoTarget: (sim, ant) => {
    const e = entranceAtThroat(sim, ant, (x) => x.status !== 'sealed');
    return e ? { kind: 'entrance', id: e.id, pos: { ...e.pos } } : null;
  },
  reachable: throatReachable,
  check(sim, ant, t) {
    const it = carriedItem(sim, ant);
    if (!it || it.kind !== 'soil-pellet') return 'no-target';
    const e = findEntrance(sim, t.id);
    return !e ? 'no-target' : e.entrance.status === 'sealed' ? 'blocked' : null;
  },
  durationS: () => SEAL_ENTRANCE_S,
  effect(sim, ant, t) {
    const it = carriedItem(sim, ant);
    if (!it || it.kind !== 'soil-pellet') return 'no-target';
    const sealed = ports.sealEntrance(sim, t.id, ant.id);
    if (sim.stores.items.has(it.id)) removeItem(sim, it.id, 'plug');
    ant.carry = { kind: 'none', id: -1 };
    return sealed ? 1 : 0;
  },
};

export const unsealEntranceDef: ActionDef = {
  id: 'unseal-entrance', kind: 'timed', targets: ['entrance'], cancellable: true, repeatable: true,
  pose: 'dig', cue: 'dig-bite',
  autoTarget: (sim, ant) => {
    const e = entranceAtThroat(sim, ant, isPlugged);
    return e ? { kind: 'entrance', id: e.id, pos: { ...e.pos } } : null;
  },
  reachable: throatReachable,
  check(sim, ant, t) {
    if (digPower(ant) <= 0) return 'caste';
    const it = carriedItem(sim, ant);
    if (ant.carry.kind === 'brood' || (it && it.kind !== 'soil-pellet')) return 'hands-full';
    const e = findEntrance(sim, t.id);
    return e && isPlugged(e.entrance) ? null : 'no-target';
  },
  durationS: (_sim, ant) => (DIG_BITE_S * PLUG_DIG_FACTOR) / Math.max(1e-6, digPower(ant)),
  onBegin: (sim, ant) => dropPelletBehind(sim, ant),
  effect(sim, ant, t) {
    const e = findEntrance(sim, t.id);
    if (!e || !isPlugged(e.entrance)) return 'no-target';
    const opened = ports.unsealEntrance(sim, t.id, ant.id);
    const volume = UNSEAL_PELLET_VOLUME_BU3;
    const material = sim.field.materialAt(e.entrance.pos);
    const pellet = spawnItem(sim, {
      kind: 'soil-pellet', pos: ant.pos,
      init: { volume, material, bulk: PELLET_BULK_PER_BU3 * volume, nestId: e.nest.id, colony: ant.colony },
    });
    takeItem(ant, pellet);
    sim.emit({ type: 'pellet-created', antId: ant.id, itemId: pellet.id, volume, material, pos: { ...ant.pos } });
    return opened ? 1 : 0;
  },
};
