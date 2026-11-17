// dig-bite, seal-entrance, unseal-entrance (GDD 01 §7.3; effects owned by the nest module, GDD 03 §1.2, §4).

import type { Vec3 } from '@/core/math/vec3';
import type { ActionFailReason, Ant, Entrance, Sim, TargetRef } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import {
  DIG_ADVANCE_L, DIG_BITE_DEPTH_BU, DIG_BITE_S, DIG_FLOOR_AHEAD_BU, DIG_MIN_SPEED, DIG_PELLET_DROP_BEHIND_L, DIG_POWER,
  DIG_POWER_NANITIC,
  ACTION_MIN_TICKS, DIG_SLOPE_DEFAULT_DEG, DIG_SLOPE_MAX_DEG, DIG_SLOPE_MIN_DEG, PELLET_BULK_PER_BU3, PLUG_DIG_FACTOR, SEAL_ENTRANCE_S,
  SEAL_THROAT_BU, UNSEAL_PELLET_VOLUME_BU3,
} from '@/sim/balance/actions';
import { PLUG_AHEAD_BU, PLUG_RADIUS_BU } from '@/sim/balance/nest';
import { removeItem, spawnItem } from '@/sim/entities';
import { TICKS_PER_SECOND } from '@/sim/time';
import { carriedItem, releaseCarried, takeItem } from '../carry';
import { antLengthMm, feetPoint, findEntrance, mandiblePoint, reachMm } from '../geometry';
import { ports } from '../ports';
import type { ActionDef } from '../types';
import { speciesIdOf } from '../workRate';

const DEG = Math.PI / 180;

/** Plug material in the mandibles: a soil pellet, or chewed wood fibre (frass) in a wood nest (GDD 06 §5.9). Additive (species-carpenter). */
export function isPlugPellet(it: { kind: string } | undefined | null): boolean {
  return !!it && (it.kind === 'soil-pellet' || it.kind === 'frass');
}

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

/**
 * Optional species rules for a bite (additive, species-carpenter: the wood-nesting module sets them at load, GDD 07
 * §6.2.3): the bite time in seconds at the sample point inside the solid (null = the default rule), and a refusal.
 */
export const digBiteRules: {
  seconds: ((sim: Sim, ant: Ant, sample: Vec3) => number | null) | null;
  refuse: ((sim: Sim, ant: Ant, sample: Vec3) => ActionFailReason | null) | null;
} = { seconds: null, refuse: null };

/**
 * digSpeed at the bite (GDD 03 §2.1, §2.2): the nest module's substrate rule at the sample point inside the
 * solid, which includes moisture, LOOSE fill and mound piles, and crusts (the bare field diggability does not).
 */
export function digSpeedAt(sim: Sim, ant: Ant, contact: Vec3): number {
  return ports.nestDigSpeedAt(sim, speciesIdOf(sim, ant), digSamplePoint(sim, contact, sp));
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
  const refused = digBiteRules.refuse?.(sim, ant, digSamplePoint(sim, c, sp)) ?? null;
  if (refused) return refused;
  return ports.canDigAt(sim, ant, c) ? null : 'not-allowed-here';
}

/** Drops a carried pellet behind the ant before the next bite (GDD 03 §1.2: inside the same bite duration). */
function dropPelletBehind(sim: Sim, ant: Ant): void {
  if (ant.carry.kind !== 'item') return;
  const f = feetPoint(ant, sp);
  const d = DIG_PELLET_DROP_BEHIND_L * antLengthMm(sim, ant);
  f.x -= ant.fwd.x * d; f.y -= ant.fwd.y * d; f.z -= ant.fwd.z * d;
  releaseCarried(sim, ant, f);
}

const heading = { x: 0, y: 0, z: 0 };
const feet = { x: 0, y: 0, z: 0 };

export const digBiteDef: ActionDef = {
  id: 'dig-bite', kind: 'timed', targets: ['none', 'surface', 'point'], cancellable: true, repeatable: true,
  pose: 'dig', cue: 'dig-bite',
  // The face straight ahead within DIG_ADVANCE_L (the ant steps up to it: auto-advance), else the floor ahead.
  autoTarget: (sim, ant) => {
    const c = digContact(sim, ant, DIG_ADVANCE_L * antLengthMm(sim, ant), contact);
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
  durationS: (sim, ant, t) => {
    const c = contactFor(sim, ant, t);
    return digBiteRules.seconds?.(sim, ant, digSamplePoint(sim, c, sp)) ?? DIG_BITE_S / Math.max(1e-6, digSpeedAt(sim, ant, c) * digPower(ant));
  },
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

/**
 * Entrance of the ant's colony whose throat the ant is in: inside the throat sphere the nest judges sealing by
 * (SEAL_THROAT_BU beyond the opening's radius, so a wide or long hole patch is reached from all of it; viab-founding),
 * not outside above the opening. Nearest opening first.
 */
export function entranceAtThroat(sim: Sim, ant: Ant, filter: (e: Entrance) => boolean): Entrance | null {
  let best: Entrance | null = null;
  let bestD = Infinity;
  for (const nest of sim.stores.nests.list) {
    if (!nest.alive || nest.colony !== ant.colony) continue;
    for (const e of nest.entrances) {
      if (!filter(e) || !inThroat(sim, ant, e)) continue;
      const d = Math.hypot(ant.pos.x - e.pos.x, ant.pos.y - e.pos.y, ant.pos.z - e.pos.z);
      if (d < bestD || (d === bestD && best && e.id < best.id)) { best = e; bestD = d; }
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

// GDD 03 §4.2: `reopening` is "plug being dug", so its plug voxels are unseal-entrance targets too
const isPlugged = (e: Entrance): boolean => e.status === 'sealed' || e.status === 'sealing' || e.status === 'reopening';

/**
 * The founding queen in the opening's `seal` phase (GDD 06 §5.9 "Hold E to close the entrance"): her press of E is a
 * request to the founding seal guide (src/sim/colony/founding/sealGuide.ts), which walks her to the leak and plugs
 * it with this same primitive. Read from state (the action library may not import the colony module).
 */
function foundingSealPhase(sim: Sim, ant: Ant): boolean {
  return ant.caste === 'queen' && (ant.flags & AntFlag.FOUNDING) !== 0 && sim.state.player.opening?.phase === 'seal';
}

/** The nearest entrance of the ant's colony that is not sealed (any distance), or null. */
function nearestUnsealed(sim: Sim, ant: Ant): Entrance | null {
  let best: Entrance | null = null, bestD = Infinity;
  for (const nest of sim.stores.nests.list) {
    if (!nest.alive || nest.colony !== ant.colony) continue;
    for (const e of nest.entrances) {
      if (e.status === 'sealed') continue;
      const d = Math.hypot(ant.pos.x - e.pos.x, ant.pos.y - e.pos.y, ant.pos.z - e.pos.z);
      if (d < bestD) { best = e; bestD = d; }
    }
  }
  return best;
}

/**
 * A founding press that cannot plug from here (no soil in the mandibles, or not in the throat): instead of a
 * `no-target` / `out-of-reach` refusal the primitive runs for one tick and places nothing, and the founding guide,
 * which hears the press, takes the queen to the leak (viab-founding: no refusal reaches the player in phase seal).
 */
function deferredToGuide(sim: Sim, ant: Ant, t: TargetRef): boolean {
  if (!foundingSealPhase(sim, ant)) return false;
  const it = carriedItem(sim, ant);
  const e = findEntrance(sim, t.id);
  if (!isPlugPellet(it) || !e || e.entrance.status === 'sealed') return true;
  return !inThroat(sim, ant, e.entrance) && !aimedInReach(sim, ant, t, e.entrance);
}

/**
 * An aimed plug (the target carries a point other than the opening, viab-founding) reaches by its aim: the aim lies
 * in the throat sphere the nest judges sealing by, and within the ant's plug reach (PLUG_AHEAD + PLUG_RADIUS beyond
 * the head, whichever way she faces; the nest's plugAim uses the same reach). Where the soil goes is what counts,
 * not where her body stands (a queen stalled just below the throat on a steep wall can still close it).
 */
function aimedInReach(sim: Sim, ant: Ant, t: TargetRef, e: Entrance): boolean {
  const bu = sim.world.bu, p = t.pos;
  if (Math.hypot(p.x - e.pos.x, p.y - e.pos.y, p.z - e.pos.z) < sim.carve.voxel) return false; // not aimed
  // in the throat sphere; the founding queen also further down her shaft (a back-fill from inside the cell's side:
  // with the nest's founding pocket rule a throat that leads to no chamber reads sealed)
  if (!foundingSealPhase(sim, ant) && Math.hypot(p.x - e.pos.x, p.y - e.pos.y, p.z - e.pos.z) > SEAL_THROAT_BU * bu + e.radius) return false;
  const reach = (PLUG_AHEAD_BU + PLUG_RADIUS_BU) * bu + 0.5 * antLengthMm(sim, ant);
  return Math.hypot(p.x - ant.pos.x, p.y - ant.pos.y, p.z - ant.pos.z) <= reach;
}

/** ant.bb key: the running seal-entrance was deferred to the founding guide (1) or is a real plug (0). */
export const SEAL_DEFERRED_KEY = 'act.sealDefer';

export const sealEntranceDef: ActionDef = {
  id: 'seal-entrance', kind: 'timed', targets: ['entrance'], cancellable: true, pose: 'tamp', cue: 'seal-tamp',
  autoTarget: (sim, ant) => {
    const e = entranceAtThroat(sim, ant, (x) => x.status !== 'sealed') ?? (foundingSealPhase(sim, ant) ? nearestUnsealed(sim, ant) : null);
    return e ? { kind: 'entrance', id: e.id, pos: { ...e.pos } } : null;
  },
  reachable: (sim, ant, t) => {
    if (throatReachable(sim, ant, t) || deferredToGuide(sim, ant, t)) return true;
    const e = findEntrance(sim, t.id);
    return e !== null && aimedInReach(sim, ant, t, e.entrance);
  },
  check(sim, ant, t) {
    if (deferredToGuide(sim, ant, t)) return null;
    const it = carriedItem(sim, ant);
    if (!it || !isPlugPellet(it)) return 'no-target';
    const e = findEntrance(sim, t.id);
    return !e ? 'no-target' : e.entrance.status === 'sealed' ? 'blocked' : null;
  },
  durationS: (sim, ant, t) => (deferredToGuide(sim, ant, t) ? ACTION_MIN_TICKS / TICKS_PER_SECOND : SEAL_ENTRANCE_S),
  onBegin(sim, ant, t) {
    ant.bb[SEAL_DEFERRED_KEY] = deferredToGuide(sim, ant, t) ? 1 : 0;
  },
  effect(sim, ant, t) {
    if (ant.bb[SEAL_DEFERRED_KEY] === 1) return 0; // the founding guide takes it from here
    const it = carriedItem(sim, ant);
    if (!it || !isPlugPellet(it)) return 'no-target';
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
    if (ant.carry.kind === 'brood' || (it && !isPlugPellet(it))) return 'hands-full';
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
