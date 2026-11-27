// `dig` (GDD 02 §10.7, GDD 03 §7.5-7.7 digger): claim a free slot of an active plan (the nest module's frontier
// API), walk to it, bite with the `dig-bite` primitive aimed by the plan (planDigAim: heading and ramp slope),
// then stow the pellet on the plan's spoil pile while it has room and the colony has haulers, else carry it out
// to the dump point beside the nearest open entrance. Claims are released on every failure and on task change.
// A `reopening` entrance's plug (GDD 03 §4.2 "plug being dug", §13 "nanitics dig it") comes first: up to
// UNPLUG_DIGGERS_MAX diggers stand in the throat and run `unseal-entrance` until it is open (each new bite drops the
// pellet carried from the last one behind the digger; haulers take them out).

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Behaviour, DigPlan, DigSlot, Entrance, Nest, Sim } from '@/sim/types';
import { navTo, navStop } from '@/sim/locomotion';
import { claimDigSite, entranceToUnplug, planDigAim, releaseDigSite, unplugStandPoint } from '@/sim/nest';
import { SEAL_THROAT_BU } from '@/sim/balance/actions';
import { canDo, cancel, interruptible } from '@/sim/ants/actions';
import { taskHeadcount } from '@/sim/colony';
import {
  DIG_AIM_BU, DIG_BITE_CHECK_TICKS, DIG_BITE_FAILS_MAX, DIG_CLAIM_TRIES, DIG_FACE_CONE_DEG, DIG_RETRY_S, DIG_TURN_ARRIVE_BU, DIG_TURN_BU,
  DIG_TURN_S, DROP_ARRIVE_BU, REACH_NEAR_BU, SLOT_ARRIVE_BU, SHORT_HOP_SPEED_MULT, SLOT_HOLD_BU, SLOT_STALL_ACCEPT_BU,
  SPOIL_PILE_RADIUS_BU, UNPLUG_DIGGERS_MAX, UNPLUG_RETRY_S, UNPLUG_STAND_BU,
} from '@/sim/balance/nestwork';
import { SPOIL_PILE_MAX } from '@/sim/balance/nest';
import { secondsToTicks } from '@/sim/time';
import { carryTo, hasWayOut } from './carry';
import { approach, endCycle, primitiveDone, recover, releaseAll, think, carryingLoad } from './common';
import { B, bbv, setState, waitThink } from './fsm';
import { act, entity, resetTravel, travel } from './travel';
import { dist } from './places';

const ENTRY = 'dig.claim';
/** bb: failed bites at the slot; turning now; turned for this aim; force a step toward the face. */
const FAILS = 'bn.df', TURN = 'bn.tn', TURNED = 'bn.td', FORCE = 'bn.fo';
/** bb: the current turning walk is a step toward the face after a missed bite (1), not a turn (0). */
const STEP = 'bn.dsp';
/** bb: tick before which this digger does not try unplugging again; failed unplug attempts in the state. */
const UNPLUG_UNTIL = 'bn.uu', UNPLUG_FAILS = 'bn.uf';
/** bb: this digger walks to the throat-axis stand point (1) because the plug's free face lay out of her walk's reach. */
const UNPLUG_AXIS = 'bn.ua';
const UNPLUG = 'dig.unplug';
const feet: Vec3 = { x: 0, y: 0, z: 0 };
const heading: Vec3 = { x: 0, y: 0, z: 0 };
const ids: number[] = [];

interface SlotRef { nest: Nest; plan: DigPlan; slot: DigSlot }

/** The ant's claimed slot (nest module claim keys bb.planId / bb.slotIdx), or null. */
function slotOf(sim: Sim, ant: Ant): SlotRef | null {
  const planId = ant.bb.planId ?? -1, idx = ant.bb.slotIdx ?? -1;
  if (planId < 0 || idx < 0) return null;
  for (const nest of sim.stores.nests.list) {
    if (!nest.alive || nest.colony !== ant.colony) continue;
    const plan = nest.digPlans.find((p) => p.id === planId);
    const slot = plan?.slots[idx];
    if (plan && slot && slot.antId === ant.id) return { nest, plan, slot };
  }
  return null;
}

/** The entrance this digger should unplug now (its nest's `reopening` plug, room in the throat), or null. */
function unplugTarget(sim: Sim, ant: Ant): Entrance | null {
  if (ant.nestId < 0 || sim.state.tick < bbv(ant, UNPLUG_UNTIL, 0)) return null;
  const e = entranceToUnplug(sim, ant.nestId);
  if (!e) return null;
  let n = 0;
  for (const a of sim.stores.ants.list) if (a.alive && a.colony === ant.colony && a.id !== ant.id && a.state === UNPLUG) n++;
  return n < UNPLUG_DIGGERS_MAX ? e : null;
}

function claimStep(sim: Sim, ant: Ant): void {
  if (ant.carry.kind === 'item') { setState(sim, ant, 'dig.stow'); return; }
  if (!slotOf(sim, ant) && unplugTarget(sim, ant)) { ant.bb[UNPLUG_FAILS] = 0; ant.bb[UNPLUG_AXIS] = 0; setState(sim, ant, UNPLUG, 'job:dig'); return; }
  if (slotOf(sim, ant) || claimDigSite(sim, ant)) { setState(sim, ant, 'dig.travel', 'deficit:dig'); return; }
  // no free slot: wait DIG_RETRY_S and try again; after DIG_CLAIM_TRIES give the task back to the allocator
  const tries = Math.floor((sim.state.tick - ant.stateTick) / secondsToTicks(DIG_RETRY_S));
  if (tries >= DIG_CLAIM_TRIES) endCycle(sim, ant, ENTRY);
  else waitThink(sim, ant);
}

function travelStep(sim: Sim, ant: Ant): void {
  const ref = slotOf(sim, ant);
  if (!ref) { setState(sim, ant, ENTRY); return; }
  // the plan's own field (D_plan) to the frontier, then the slot itself
  const far = Math.hypot(ant.pos.x - ref.slot.pos.x, ant.pos.y - ref.slot.pos.y, ant.pos.z - ref.slot.pos.z) > SLOT_HOLD_BU * sim.world.bu;
  const t = far && bbv(ant, B.n, 0) === 0 ? entity('plan', ref.plan.id, ref.slot.pos) : entity('point', -1, ref.slot.pos);
  // a stalled walk counts as arrived only within reach of the face (SLOT_STALL_ACCEPT_BU, inside SLOT_HOLD_BU)
  let st = approach(sim, ant, t, SLOT_ARRIVE_BU * sim.world.bu, true, (t.kind === 'plan' ? REACH_NEAR_BU : SLOT_STALL_ACCEPT_BU) * sim.world.bu);
  if (st === 'arrived' && t.kind === 'plan') { ant.bb[B.n] = 1; st = 'moving'; }
  if (st === 'arrived') { ant.bb[FAILS] = 0; setState(sim, ant, 'dig.bite'); }
  else if (st === 'failed') recover(sim, ant, ENTRY, 'stuck', true);
}

function feetOf(ant: Ant): Vec3 {
  feet.x = ant.pos.x - ant.up.x * ant.footOffset;
  feet.y = ant.pos.y - ant.up.y * ant.footOffset;
  feet.z = ant.pos.z - ant.up.z * ant.footOffset;
  return feet;
}

const faceCos = (): number => Math.cos((DIG_FACE_CONE_DEG * Math.PI) / 180);

/** Cosine between the ant's horizontal heading and the aim heading. */
function facing(ant: Ant): number {
  const l = Math.hypot(ant.fwd.x, ant.fwd.z);
  return l < 1e-6 ? 0 : (ant.fwd.x * heading.x + ant.fwd.z * heading.z) / l;
}

function giveUpSlot(sim: Sim, ant: Ant): void {
  releaseDigSite(sim, ant);
  setState(sim, ant, ENTRY, 'job:dig');
}

function biteStep(sim: Sim, ant: Ant): void {
  const ref = slotOf(sim, ant);
  if (!ref) { setState(sim, ant, ENTRY); return; }
  const bu = sim.world.bu;
  if (primitiveDone(ant)) {
    ant.bb[B.began] = 0;
    if (ant.carry.kind === 'item') { setState(sim, ant, 'dig.stow', 'item-collected'); return; }
    ant.bb[FAILS] = bbv(ant, FAILS, 0) + 1;
    if (ant.bb[FAILS] >= DIG_BITE_FAILS_MAX) { giveUpSlot(sim, ant); return; }
    ant.bb[FORCE] = 1;
  }
  // turning toward the face (or stepping up to it after a missed bite): a short walk along the aim
  if (bbv(ant, TURN, 0) === 1) {
    // a turn (not a step after a miss) ends as soon as the ant faces the aim: walking on would carry it off the slot
    const faced = bbv(ant, STEP, 0) === 0 && planDigAim(sim, ant, feetOf(ant), heading) !== null && facing(ant) >= faceCos();
    if (!faced && ant.nav.status === 'moving' && sim.state.tick - bbv(ant, B.until, 0) < secondsToTicks(DIG_TURN_S)) {
      ant.thinkTick = sim.state.tick + 1;
      return;
    }
    navStop(sim, ant);
    ant.bb[TURN] = 0;
  }
  if (Math.hypot(ant.pos.x - ref.slot.pos.x, ant.pos.y - ref.slot.pos.y, ant.pos.z - ref.slot.pos.z) > SLOT_HOLD_BU * bu) {
    setState(sim, ant, 'dig.travel');
    return;
  }
  const slope = planDigAim(sim, ant, feetOf(ant), heading);
  if (slope === null) { giveUpSlot(sim, ant); return; }
  if ((facing(ant) < faceCos() || bbv(ant, FORCE, 0) === 1) && bbv(ant, TURNED, 0) === 0) {
    ant.bb[STEP] = bbv(ant, FORCE, 0);
    ant.bb[TURN] = 1; ant.bb[TURNED] = 1; ant.bb[FORCE] = 0;
    ant.bb[B.until] = sim.state.tick;
    navTo(sim, ant, { x: feet.x + heading.x * DIG_TURN_BU * bu, y: feet.y, z: feet.z + heading.z * DIG_TURN_BU * bu }, DIG_TURN_ARRIVE_BU * bu,
      { speedMult: SHORT_HOP_SPEED_MULT });
    ant.thinkTick = sim.state.tick + 1;
    return;
  }
  ant.bb[TURNED] = 0;
  const h = DIG_AIM_BU * bu, drop = Math.tan((slope * Math.PI) / 180) * h;
  const aim = { x: feet.x + heading.x * h, y: feet.y - drop, z: feet.z + heading.z * h };
  if (act(sim, ant, 'dig-bite', { kind: 'point', id: -1, pos: aim })) { ant.thinkTick = sim.state.tick + DIG_BITE_CHECK_TICKS; return; }
  ant.bb[FAILS] = bbv(ant, FAILS, 0) + 1;
  ant.bb[FORCE] = 1;
  if (ant.bb[FAILS] >= DIG_BITE_FAILS_MAX) giveUpSlot(sim, ant);
}

const stand: Vec3 = { x: 0, y: 0, z: 0 };

/** dig.unplug: walk into the throat of the `reopening` entrance and bite its plug (`unseal-entrance`) until open. */
function unplugStep(sim: Sim, ant: Ant): void {
  const e = ant.nestId >= 0 ? entranceToUnplug(sim, ant.nestId) : null;
  if (primitiveDone(ant)) ant.bb[B.began] = 0;
  if (!e) { setState(sim, ant, ant.carry.kind === 'item' ? 'dig.stow' : ENTRY); return; }
  const bu = sim.world.bu;
  if (act(sim, ant, 'unseal-entrance', { kind: 'entrance', id: e.id, pos: e.pos })) return;
  // winter-sugar A3: stand at the plug's free face on her side (below its lowest solid samples for a digger from the
  // cell), inside the unseal primitive's throat test with the walk's stall tolerance to spare; the old point a fixed
  // depth down the throat axis only when the plug shows no free face in reach (it lay in the plug of a wide mouth)
  const reach = SEAL_THROAT_BU * bu + e.radius - SLOT_STALL_ACCEPT_BU * bu;
  const face = bbv(ant, UNPLUG_AXIS, 0) === 0 && unplugStandPoint(sim, e, ant.pos, reach, stand);
  if (!face) {
    const inside = e.radius + UNPLUG_STAND_BU * bu;
    stand.x = e.pos.x - e.dir.x * inside; stand.y = e.pos.y - e.dir.y * inside; stand.z = e.pos.z - e.dir.z * inside;
  }
  const st = approach(sim, ant, entity('point', -1, stand), SLOT_ARRIVE_BU * bu, true, SLOT_STALL_ACCEPT_BU * bu);
  if (st === 'moving') return;
  // integrator ruling 1: the free face can lie where no walk reaches (suburban-garden #1's hand-over: a crack beside
  // the plug; the walker stopped at the nearest cell it reached, 3 BU lower and outside the bite's throat test, and
  // the digger was barred after DIG_BITE_FAILS_MAX thinks). A walk that ends out of bite reach of the face point
  // costs her nothing: she walks to the axis point instead, and only that walk counts against her.
  if (face && canDo(sim, ant, 'unseal-entrance', { kind: 'entrance', id: e.id, pos: e.pos }).reason === 'out-of-reach') {
    ant.bb[UNPLUG_AXIS] = 1;
    resetTravel(ant);
    waitThink(sim, ant);
    return;
  }
  // at the stand point (or as near as the walk gets) and still no bite: count it, give up after DIG_BITE_FAILS_MAX
  ant.bb[UNPLUG_FAILS] = bbv(ant, UNPLUG_FAILS, 0) + 1;
  // a walk that failed against the plug itself (she stands at its face, or the point lies in plug soil) bars her
  // from nothing: she bites from there next think; only a walk that cannot reach the plug sets UNPLUG_RETRY_S
  const againstPlug = st === 'failed' && (dist(ant.pos, stand) <= SLOT_STALL_ACCEPT_BU * bu || sim.field.sample(stand) <= 0);
  if ((st === 'failed' && !againstPlug) || ant.bb[UNPLUG_FAILS] >= DIG_BITE_FAILS_MAX) {
    ant.bb[UNPLUG_UNTIL] = sim.state.tick + secondsToTicks(UNPLUG_RETRY_S);
    setState(sim, ant, ant.carry.kind === 'item' ? 'dig.stow' : ENTRY, 'stuck');
    return;
  }
  waitThink(sim, ant);
}

/** Pellets lying on the plan's spoil pile. */
function spoilPileCount(sim: Sim, plan: DigPlan): number {
  ids.length = 0;
  sim.index.queryItems(plan.spoilPoint, SPOIL_PILE_RADIUS_BU * sim.world.bu, ids);
  let n = 0;
  for (const id of ids) {
    const it = sim.stores.items.get(id);
    if (it && it.spoilPlanId === plan.id && it.carrierIds.length === 0) n++;
  }
  return n;
}

/** Pellet drop = end of a task cycle (GDD 02 §6.5); back to the slot if it is still held. */
function stowDone(sim: Sim, ant: Ant): void {
  endCycle(sim, ant, slotOf(sim, ant) ? 'dig.travel' : ENTRY);
}

/** dig.stow: B.n = 0 undecided, 1 onto the spoil pile, 2 carry out (GDD 03 §7.7 deposit / carry-out). */
function stowStep(sim: Sim, ant: Ant): void {
  const ref = slotOf(sim, ant);
  let mode = bbv(ant, B.n, 0);
  if (mode === 0) {
    if (ant.carry.kind !== 'item') { stowDone(sim, ant); return; }
    // an oversized pellet (bulk above the digger's own carry capacity: no hauler could pick it up again) goes out
    const it = sim.stores.items.get(ant.carry.id);
    const liftable = !!it && it.bulk <= ant.carryCap;
    // in a closed nest the pile is the only place (a trip out would end at the closure, in the diggers' way)
    const pile = !!ref && (!hasWayOut(sim, ant) || (spoilPileCount(sim, ref.plan) < SPOIL_PILE_MAX && taskHeadcount(sim, ant.colony, 'haul') > 0));
    mode = liftable && pile ? 1 : 2;
    ant.bb[B.n] = mode;
  }
  if (mode === 1) {
    if (primitiveDone(ant)) {
      ant.bb[B.began] = 0;
      if (ant.carry.kind === 'none') stowDone(sim, ant); else ant.bb[B.n] = 2;
      return;
    }
    if (!ref || ant.carry.kind !== 'item') { ant.bb[B.n] = ant.carry.kind === 'item' ? 2 : 0; return; }
    const st = approach(sim, ant, entity('point', -1, ref.plan.spoilPoint), DROP_ARRIVE_BU * sim.world.bu, true);
    if (st === 'arrived') act(sim, ant, 'put-down', null);
    else if (st === 'failed') ant.bb[B.n] = 2;
    return;
  }
  const st = carryTo(sim, ant, 'mound');
  if (st === 'dropped') stowDone(sim, ant);
  else if (st === 'failed') recover(sim, ant, ENTRY, 'stuck', true);
}

function step(sim: Sim, ant: Ant): void {
  switch (ant.state) {
    case 'dig.travel': return travelStep(sim, ant);
    case 'dig.bite': return biteStep(sim, ant);
    case 'dig.stow': return stowStep(sim, ant);
    case UNPLUG: return unplugStep(sim, ant);
    default:
      if (ant.state !== ENTRY) { setState(sim, ant, ENTRY); return; }
      return claimStep(sim, ant);
  }
}

export const digBehaviour: Behaviour = {
  task: 'dig',
  enter: (sim, ant) => setState(sim, ant, ENTRY),
  update: (sim, ant) => {
    if (biteOrphaned(sim, ant)) return;
    think(sim, ant, ENTRY, step);
  },
  exit: (sim, ant) => releaseAll(sim, ant),
  delivering: carryingLoad,
};

/**
 * A bite whose slot is gone (plan cancelled or completed, slot timed out) is stopped before it lands: a cancelled
 * plan's volume must not change any more (GDD 03 App. E 16). The digger looks every DIG_BITE_CHECK_TICKS.
 */
function biteOrphaned(sim: Sim, ant: Ant): boolean {
  if (ant.action?.id !== 'dig-bite') return false;
  if (slotOf(sim, ant)) { ant.thinkTick = sim.state.tick + DIG_BITE_CHECK_TICKS; return true; }
  if (interruptible(ant)) cancel(sim, ant, null);
  ant.bb[B.began] = 0;
  setState(sim, ant, ENTRY, 'job:dig');
  return true;
}
