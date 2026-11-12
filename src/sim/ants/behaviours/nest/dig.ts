// `dig` (GDD 02 §10.7, GDD 03 §7.5-7.7 digger): claim a free slot of an active plan (the nest module's frontier
// API), walk to it, bite with the `dig-bite` primitive aimed by the plan (planDigAim: heading and ramp slope),
// then stow the pellet on the plan's spoil pile while it has room and the colony has haulers, else carry it out
// to the dump point beside the nearest open entrance. Claims are released on every failure and on task change.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Behaviour, DigPlan, DigSlot, Nest, Sim } from '@/sim/types';
import { navTo, navStop } from '@/sim/locomotion';
import { claimDigSite, planDigAim, releaseDigSite } from '@/sim/nest';
import { taskHeadcount } from '@/sim/colony';
import {
  DIG_BITE_FAILS_MAX, DIG_CLAIM_TRIES, DIG_RETRY_S, DIG_TURN_BU, DIG_TURN_S, DROP_ARRIVE_BU, SLOT_ARRIVE_BU, SLOT_HOLD_BU,
  SPOIL_STOW_MAX,
} from '@/sim/balance/nestwork';
import { secondsToTicks } from '@/sim/time';
import { carryTo } from './carry';
import { approach, endCycle, primitiveDone, recover, releaseAll, think } from './common';
import { B, bbv, setState, waitThink } from './fsm';
import { act, entity, travel } from './travel';

const ENTRY = 'dig.claim';
/** bb: failed bites at the slot; turning now; turned for this aim; force a step toward the face. */
const FAILS = 'bn.df', TURN = 'bn.tn', TURNED = 'bn.td', FORCE = 'bn.fo';
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

function claimStep(sim: Sim, ant: Ant): void {
  if (ant.carry.kind === 'item') { setState(sim, ant, 'dig.stow'); return; }
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
  let st = approach(sim, ant, t, SLOT_ARRIVE_BU * sim.world.bu, true);
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
    if (ant.nav.status === 'moving' && sim.state.tick - bbv(ant, B.until, 0) < secondsToTicks(DIG_TURN_S)) return;
    navStop(sim, ant);
    ant.bb[TURN] = 0;
  }
  if (Math.hypot(ant.pos.x - ref.slot.pos.x, ant.pos.y - ref.slot.pos.y, ant.pos.z - ref.slot.pos.z) > SLOT_HOLD_BU * bu) {
    setState(sim, ant, 'dig.travel');
    return;
  }
  const slope = planDigAim(sim, ant, feetOf(ant), heading);
  if (slope === null) { giveUpSlot(sim, ant); return; }
  if ((facing(ant) < Math.cos(Math.PI / 4) || bbv(ant, FORCE, 0) === 1) && bbv(ant, TURNED, 0) === 0) {
    ant.bb[TURN] = 1; ant.bb[TURNED] = 1; ant.bb[FORCE] = 0;
    ant.bb[B.until] = sim.state.tick;
    navTo(sim, ant, { x: feet.x + heading.x * DIG_TURN_BU * bu, y: feet.y, z: feet.z + heading.z * DIG_TURN_BU * bu }, 0.2 * bu);
    return;
  }
  ant.bb[TURNED] = 0;
  const h = 2 * bu, drop = Math.tan((slope * Math.PI) / 180) * h;
  const aim = { x: feet.x + heading.x * h, y: feet.y - drop, z: feet.z + heading.z * h };
  if (act(sim, ant, 'dig-bite', { kind: 'point', id: -1, pos: aim })) return;
  ant.bb[FAILS] = bbv(ant, FAILS, 0) + 1;
  ant.bb[FORCE] = 1;
  if (ant.bb[FAILS] >= DIG_BITE_FAILS_MAX) giveUpSlot(sim, ant);
}

/** Pellets lying on the plan's spoil pile. */
function spoilPileCount(sim: Sim, plan: DigPlan): number {
  ids.length = 0;
  sim.index.queryItems(plan.spoilPoint, 2 * sim.world.bu, ids);
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
    mode = liftable && ref && spoilPileCount(sim, ref.plan) < SPOIL_STOW_MAX && taskHeadcount(sim, ant.colony, 'haul') > 0 ? 1 : 2;
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
    default:
      if (ant.state !== ENTRY) { setState(sim, ant, ENTRY); return; }
      return claimStep(sim, ant);
  }
}

export const digBehaviour: Behaviour = {
  task: 'dig',
  enter: (sim, ant) => setState(sim, ant, ENTRY),
  update: (sim, ant) => think(sim, ant, ENTRY, step),
  exit: (sim, ant) => releaseAll(sim, ant),
};
