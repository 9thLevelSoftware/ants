// move, let-go, grip, pick-up, put-down, drop, drag (GDD 01 §7.3).

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Sim, TargetRef } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import {
  COOP_MAX_ANTS, FLOOR_NORMAL_MIN, LET_GO_PUSH_MM_S, MANDIBLE_FWD_L, PICK_UP_S, PUT_DOWN_S, SOLO_DRAG_MAX,
} from '@/sim/balance/actions';
import { removeItem, spawnItem } from '@/sim/entities';
import { carriedItem, handsFree, releaseCarried, takeBrood, takeItem } from '../carry';
import { antLengthMm, feetPoint } from '../geometry';
import { ports } from '../ports';
import { isFoodItem, isLiquidSource, isPickableSource } from '../sourceKinds';
import type { ActionDef } from '../types';

/** Floor point just in front of the head, where things are put down, into out. */
export function floorAhead(sim: Sim, ant: Ant, out: Vec3): Vec3 {
  feetPoint(ant, out);
  const d = MANDIBLE_FWD_L * antLengthMm(sim, ant);
  out.x += ant.fwd.x * d; out.y += ant.fwd.y * d; out.z += ant.fwd.z * d;
  return out;
}

function isFoundingQueen(ant: Ant): boolean {
  return ant.caste === 'queen' && (ant.flags & AntFlag.FOUNDING) !== 0;
}

export const move: ActionDef = {
  id: 'move', kind: 'instant', targets: ['none'], concurrent: true, cancellable: false, pose: 'walk', cue: null,
  // Movement itself is locomotion's; this only answers "may it walk now?" (not during a non-moving primitive).
  check: (_sim, ant) => (ant.action && ant.action.id !== 'grip' && ant.action.id !== 'drag' ? 'blocked' : null),
  durationS: () => 0,
  effect: () => 0,
};

export const letGo: ActionDef = {
  id: 'let-go', kind: 'instant', targets: ['none'], preempts: true, cancellable: false, pose: 'fall', cue: null,
  check: (_sim, ant) => {
    if (ant.medium === 'air') return 'conditions';
    if (ant.action?.id === 'grip') return 'blocked';
    return ant.up.y >= FLOOR_NORMAL_MIN ? 'not-allowed-here' : null;
  },
  durationS: () => 0,
  // Leaves the surface; locomotion integrates the ballistic fall while medium is 'air'. The load stays held.
  effect: (_sim, ant) => {
    ant.medium = 'air';
    ant.vel = { x: ant.up.x * LET_GO_PUSH_MM_S, y: ant.up.y * LET_GO_PUSH_MM_S, z: ant.up.z * LET_GO_PUSH_MM_S };
    return 0;
  },
};

export const grip: ActionDef = {
  id: 'grip', kind: 'continuous', targets: ['none'], cancellable: false, ignoresDamage: true, repeatable: false,
  scalesWithWork: false, pose: 'grip', cue: null,
  check: (_sim, ant) => (ant.medium === 'air' || ant.medium === 'water' ? 'conditions' : null),
  durationS: () => 0,
  tick: (_sim, ant) => (ant.medium === 'air' ? 'done' : 'continue'),
};

export const pickUp: ActionDef = {
  id: 'pick-up', kind: 'timed', targets: ['brood', 'item', 'source'], cancellable: true, pose: 'pick', cue: 'pick-up',
  check(sim, ant, t) {
    if (!handsFree(ant)) return 'hands-full';
    const queen = ant.caste === 'queen';
    if (queen && !isFoundingQueen(ant)) return 'caste';
    if (t.kind === 'brood') return null;
    if (t.kind === 'item') {
      const it = sim.stores.items.get(t.id);
      if (!it) return 'no-target';
      if (it.carrierIds.length > 0 && !it.carrierIds.includes(ant.id)) return 'blocked';
      if (it.reservedBy !== -1 && it.reservedBy !== ant.id && sim.stores.ants.has(it.reservedBy)) return 'blocked';
      if (queen) return it.kind === 'soil-pellet' ? null : 'caste';
      return it.bulk > ant.carryCap ? 'too-heavy' : null;
    }
    if (queen) return 'caste';
    const s = sim.stores.sources.get(t.id);
    if (!s || s.units <= 0) return 'no-target';
    if (!isPickableSource(s, ant.carryCap)) return isLiquidSource(s) ? 'not-allowed-here' : 'too-heavy';
    return null;
  },
  durationS: () => PICK_UP_S,
  effect(sim, ant, t) {
    if (!handsFree(ant)) return 'hands-full';
    if (t.kind === 'brood') {
      const b = sim.stores.brood.get(t.id);
      return b && b.carriedBy === -1 ? takeBrood(sim, ant, b) : 'no-target';
    }
    if (t.kind === 'item') {
      const it = sim.stores.items.get(t.id);
      if (!it || (it.carrierIds.length > 0 && !it.carrierIds.includes(ant.id))) return 'no-target';
      takeItem(ant, it);
      return 1;
    }
    return pickFromSource(sim, ant, t);
  },
};

/** Takes one whole unit (crumb, seed, granule) from a source into the mandibles. */
function pickFromSource(sim: Sim, ant: Ant, t: TargetRef): number | 'no-target' {
  const s = sim.stores.sources.get(t.id);
  if (!s) return 'no-target';
  const got = ports.harvest(sim, ant, s.id, 1);
  if (got.c + got.p <= 0) return 'no-target';
  const it = spawnItem(sim, {
    kind: s.kind === 'seed' ? 'seed' : 'food-piece', pos: ant.pos,
    init: { c: got.c, p: got.p, bulk: s.unitBulk, foodKind: s.kind, variant: s.variant, hardness: s.hardness },
  });
  takeItem(ant, it);
  ant.mem.knownSourceId = s.id;
  return got.c + got.p;
}

const scratch = { x: 0, y: 0, z: 0 };

export const putDown: ActionDef = {
  id: 'put-down', kind: 'timed', targets: ['none', 'surface', 'point', 'brood', 'item', 'entrance'],
  // An in-progress put-down finishes even when possession starts (GDD 01 §3.3 step 3).
  cancellable: false, pose: 'place', cue: 'drop',
  check: (_sim, ant) => (ant.carry.kind === 'none' ? 'no-target' : null),
  durationS: () => PUT_DOWN_S,
  effect(sim, ant, t) {
    if (ant.carry.kind === 'none') return 'no-target';
    const at = t.kind === 'surface' || t.kind === 'point' ? t.pos : floorAhead(sim, ant, scratch);
    if (deliverFood(sim, ant, at)) return 1;
    return releaseCarried(sim, ant, at);
  },
};

/**
 * A food item put down inside a chamber is a solid delivery: the colony ledger takes what it accepts (GDD 02
 * §5.3); a remainder stays as a smaller item. Returns true when the item was consumed by the store.
 */
function deliverFood(sim: Sim, ant: Ant, at: Vec3): boolean {
  const it = carriedItem(sim, ant);
  if (!it || !isFoodItem(it) || ant.nestId < 0 || !ports.findChamberAt(sim, at)) return false;
  const got = ports.depositFood(sim, ant.colony, it.c, it.p, it.toxin);
  it.c = Math.max(0, it.c - got.c);
  it.p = Math.max(0, it.p - got.p);
  if (it.c + it.p > 1e-9) return false;
  removeItem(sim, it.id, 'stored');
  ant.carry = { kind: 'none', id: -1 };
  return true;
}

export const drop: ActionDef = {
  id: 'drop', kind: 'instant', targets: ['none'], preempts: true, cancellable: false, pose: 'release', cue: 'drop',
  check: (_sim, ant) => (ant.carry.kind === 'none' ? 'no-target' : null),
  durationS: () => 0,
  effect: (sim, ant) => releaseCarried(sim, ant, feetPoint(ant, scratch)),
};

export const drag: ActionDef = {
  id: 'drag', kind: 'continuous', targets: ['item'], cancellable: true, scalesWithWork: false, pose: 'drag', cue: null,
  check(sim, ant, t) {
    const it = sim.stores.items.get(t.id);
    if (!it) return 'no-target';
    if (!handsFree(ant)) return 'hands-full';
    if (it.bulk <= ant.carryCap) return 'not-allowed-here';
    if (it.carrierIds.length >= COOP_MAX_ANTS) return 'blocked';
    if (it.carrierIds.length === 0 && it.bulk > ant.carryCap * SOLO_DRAG_MAX) return 'too-heavy';
    return null;
  },
  durationS: () => 0,
  onBegin(sim, ant, t) {
    const it = sim.stores.items.get(t.id);
    if (it) takeItem(ant, it);
  },
  // Pulling is locomotion's (item speed from the summed carry capacity); this keeps the grip on the item.
  tick: (sim, ant, t) => (sim.stores.items.has(t.id) && ant.carry.kind === 'item' && ant.carry.id === t.id ? 'continue' : 'done'),
  onEnd(sim, ant, t) {
    const it = sim.stores.items.get(t.id);
    if (it) it.carrierIds = it.carrierIds.filter((id) => id !== ant.id);
    if (ant.carry.kind === 'item' && ant.carry.id === t.id) ant.carry = { kind: 'none', id: -1 };
  },
};
