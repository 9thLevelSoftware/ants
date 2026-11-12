// `queen-care` (GDD 02 §10.5): attendants stay by the queen and groom her, load a ration (mix §5.4.2) and feed it
// to her until her gut reaches the retinue target, feed her from their own reserve in starvation S2 (§5.7),
// collect the eggs she lays and carry them to the best egg pile (§10.4.1), and escort her when she relocates.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Behaviour, Brood, Chamber, Sim } from '@/sim/types';
import { queenWantsFood, requestTask } from '@/sim/colony';
import { QUEEN_RATION_BASE, QUEEN_TARGET_GUT_C } from '@/sim/balance/colony';
import {
  BROOD_DROP_ARRIVE_BU, CARER_KEEP_RESERVE, EGG_COLLECT_BU, EGG_PILE_OFFSET, EGG_PILE_RADIUS_BU, QUEEN_ATTEND_BU,
  QUEEN_FEED_ARRIVE_BU, QUEEN_FEED_LOADS, QUEEN_GROOM_EVERY_S, ROOM_ARRIVE_FRAC,
} from '@/sim/balance/nestwork';
import { secondsToTicks } from '@/sim/time';
import { claim, freeFor, Job, sortOf } from './board';
import { CareOp, startCare } from './careActs';
import { approach, endCycle, primitiveDone, reachAndAct, recover, releaseAll, think } from './common';
import { B, bbv, setState, waitThink } from './fsm';
import { chamberIn, floorPoint, floorY, foodChamber, GOLDEN_ANGLE, homeNest, pileSlot } from './places';
import { isFoundingQueen } from './queen';
import { bestChamberId } from './sorting';
import { act, entity, resetTravel, travel } from './travel';

const ENTRY = 'queen-care.attend';
/** bb: 1 = feeding the queen from the carer's own reserve (S2). */
const RESERVE = 'bn.res';
const PICKED = 'bn.pk';
const pile = { x: 0, y: 0, z: 0 };
const near: number[] = [];

function queenOf(sim: Sim, ant: Ant): Ant | undefined {
  const col = sim.stores.colonies.get(ant.colony);
  const q = col ? sim.stores.ants.get(col.queenId) : undefined;
  return q && q.alive && q.queen && !isFoundingQueen(q) ? q : undefined;
}

function poolEmpty(sim: Sim, ant: Ant): boolean {
  const col = sim.stores.colonies.get(ant.colony);
  return !col || col.stores.c + col.stores.p < QUEEN_FEED_LOADS;
}

/**
 * The egg pile of a chamber: the stage-group pile point, or, in the queen's own chamber, the point opposite her
 * (EGG_PILE_OFFSET of the radius), so collected eggs never lie within EGG_COLLECT_BU of her again.
 */
function eggPile(sim: Sim, ant: Ant, room: Chamber, k: number, out: Vec3): Vec3 {
  const q = queenOf(sim, ant);
  if (!q || q.chamberId !== room.id) return pileSlot(room, 0, k, sim.world.bu, out);
  floorPoint(room, EGG_PILE_OFFSET, Math.atan2(q.pos.z - room.center.z, q.pos.x - room.center.x) + Math.PI, out);
  const a = k * GOLDEN_ANGLE, r = EGG_PILE_RADIUS_BU * sim.world.bu * Math.sqrt(((k * 7) % 23) / 23);
  out.x += Math.cos(a) * r;
  out.z += Math.sin(a) * r;
  out.y = floorY(room, out.x, out.z);
  return out;
}

function eggNearQueen(sim: Sim, ant: Ant, q: Ant): Brood | null {
  const r = EGG_COLLECT_BU * sim.world.bu;
  let best: Brood | null = null;
  near.length = 0;
  sim.index.queryBrood(q.pos, r, near);
  for (const id of near) {
    const b = sim.stores.brood.get(id);
    if (!b || !b.alive || b.colony !== ant.colony || b.stage !== 'egg' || b.carriedBy >= 0) continue;
    if (Math.hypot(b.pos.x - q.pos.x, b.pos.y - q.pos.y, b.pos.z - q.pos.z) > r || !freeFor(sim, ant, b.id)) continue;
    if (!best || b.id < best.id) best = b;
  }
  return best;
}

function attend(sim: Sim, ant: Ant): void {
  const q = queenOf(sim, ant);
  if (!q) { requestTask(sim, ant, 'idle', 'surplus'); return; }
  if (q.state === 'queen.relocate') { setState(sim, ant, 'queen-care.escort', 'marker:move-queen'); return; }
  const egg = eggNearQueen(sim, ant, q);
  if (egg) { claim(sim, ant, Job.collectEggs, egg.id); setState(sim, ant, 'queen-care.collect-eggs', 'job:collect-eggs'); return; }
  const reserve = poolEmpty(sim, ant) && ant.cropC + ant.cropP < QUEEN_FEED_LOADS;
  if ((reserve ? q.queen!.gut.c < QUEEN_TARGET_GUT_C : queenWantsFood(q)) && ant.carry.kind === 'none') {
    ant.bb[RESERVE] = reserve && ant.energy > CARER_KEEP_RESERVE ? 1 : 0;
    if (reserve && ant.energy <= CARER_KEEP_RESERVE) { endCycle(sim, ant, ENTRY, 'hungry'); return; }
    setState(sim, ant, reserve || ant.cropC + ant.cropP >= QUEEN_FEED_LOADS ? 'queen-care.feed' : 'queen-care.load', 'hungry');
    return;
  }
  const st = travel(sim, ant, entity('ant', q.id, q.pos), QUEEN_ATTEND_BU * sim.world.bu);
  if (st === 'failed') { recover(sim, ant, ENTRY, 'stuck', true); return; }
  if (st !== 'arrived') return;
  if (primitiveDone(ant)) { ant.bb[B.began] = 0; ant.bb[B.groomTick] = sim.state.tick; ant.bb[B.n] = 0; resetTravel(ant); }
  if (sim.state.tick - bbv(ant, B.groomTick, -1e9) > secondsToTicks(QUEEN_GROOM_EVERY_S)) {
    if (reachAndAct(sim, ant, entity('ant', q.id, q.pos), 'groom') === 'failed') ant.bb[B.groomTick] = sim.state.tick;
    return;
  }
  // a quiet carer is re-stamped so the state times out only when she is really stuck
  if (sim.state.tick - ant.stateTick > secondsToTicks(QUEEN_GROOM_EVERY_S)) setState(sim, ant, ENTRY);
  else waitThink(sim, ant);
}

function load(sim: Sim, ant: Ant): void {
  const nest = homeNest(sim, ant);
  const room = nest ? foodChamber(sim, nest, ant.pos) : undefined;
  if (!room) { recover(sim, ant, ENTRY, 'job:load'); return; }
  const st = ant.chamberId === room.id ? 'arrived' : travel(sim, ant, entity('chamber', room.id, room.center), ROOM_ARRIVE_FRAC * Math.min(room.radii.x, room.radii.z));
  if (st === 'failed') { recover(sim, ant, ENTRY, 'stuck', true); return; }
  if (st === 'arrived') startCare(sim, ant, CareOp.loadRation, -1, Math.max(0, QUEEN_RATION_BASE - ant.cropC - ant.cropP));
}

function feed(sim: Sim, ant: Ant): void {
  const q = queenOf(sim, ant);
  if (!q) { endCycle(sim, ant, ENTRY); return; }
  const fromReserve = bbv(ant, RESERVE, 0) === 1;
  // the own reserve is carbohydrate only: it is given while the queen lacks C, never for her missing protein
  const wants = fromReserve ? q.queen!.gut.c < QUEEN_TARGET_GUT_C : queenWantsFood(q);
  if (!wants || (fromReserve ? ant.energy <= CARER_KEEP_RESERVE : ant.cropC + ant.cropP < QUEEN_FEED_LOADS * 0.5)) {
    endCycle(sim, ant, ENTRY);
    return;
  }
  const st = approach(sim, ant, entity('ant', q.id, q.pos), QUEEN_FEED_ARRIVE_BU * sim.world.bu, true);
  if (st === 'failed') { recover(sim, ant, ENTRY, 'stuck', true); return; }
  if (st === 'arrived') startCare(sim, ant, fromReserve ? CareOp.feedQueenReserve : CareOp.feedQueen, q.id,
    fromReserve ? Math.min(QUEEN_FEED_LOADS, ant.energy - CARER_KEEP_RESERVE) : QUEEN_FEED_LOADS);
}

function collectEggs(sim: Sim, ant: Ant): void {
  const b = sim.stores.brood.get(bbv(ant, B.jobId));
  const nest = homeNest(sim, ant);
  if (!b || !nest) { recover(sim, ant, ENTRY, 'job:collect-eggs'); return; }
  if (b.carriedBy === ant.id) {
    const ctx = sortOf(sim, ant.colony, nest.id);
    const room = chamberIn(nest, ctx ? bestChamberId(ctx, 0) : -1) ?? chamberIn(nest, b.chamberId);
    if (!room) { recover(sim, ant, ENTRY, 'job:collect-eggs'); return; }
    ant.bb[PICKED] = 2;
    eggPile(sim, ant, room, b.id, pile);
    const st = approach(sim, ant, entity('point', -1, pile), BROOD_DROP_ARRIVE_BU * sim.world.bu, true);
    if (st === 'failed') { recover(sim, ant, ENTRY, 'stuck', true); return; }
    if (st === 'arrived') act(sim, ant, 'put-down', null);
    return;
  }
  if (primitiveDone(ant) && ant.carry.kind === 'none' && bbv(ant, PICKED, 0) === 2) {
    ant.bb[PICKED] = 0;
    endCycle(sim, ant, ENTRY);
    return;
  }
  if (b.carriedBy >= 0) { endCycle(sim, ant, ENTRY); return; }
  if (primitiveDone(ant)) { ant.bb[B.began] = 0; ant.bb[B.n] = bbv(ant, B.n, 0) + 1; }
  ant.bb[PICKED] = 0;
  if (reachAndAct(sim, ant, entity('brood', b.id, b.pos), 'pick-up') === 'failed') recover(sim, ant, ENTRY, 'job:collect-eggs', ant.nav.status === 'failed');
}

function escort(sim: Sim, ant: Ant): void {
  const q = queenOf(sim, ant);
  if (!q || q.state !== 'queen.relocate') { setState(sim, ant, ENTRY); return; }
  if (travel(sim, ant, entity('ant', q.id, q.pos), QUEEN_ATTEND_BU * sim.world.bu) === 'arrived') resetTravel(ant);
}

function step(sim: Sim, ant: Ant): void {
  switch (ant.state) {
    case 'queen-care.load': return load(sim, ant);
    case 'queen-care.feed': return feed(sim, ant);
    case 'queen-care.collect-eggs': return collectEggs(sim, ant);
    case 'queen-care.escort': return escort(sim, ant);
    default:
      if (ant.state !== ENTRY) { setState(sim, ant, ENTRY); return; }
      return attend(sim, ant);
  }
}

function onCare(sim: Sim, ant: Ant, got: number): void {
  if (ant.state === 'queen-care.load') {
    if (got <= 1e-6 && ant.cropC + ant.cropP < QUEEN_FEED_LOADS) {
      // nothing in the pool (S2): feed her from the own reserve instead (GDD 02 §5.7)
      ant.bb[RESERVE] = ant.energy > CARER_KEEP_RESERVE ? 1 : 0;
      if (ant.bb[RESERVE] === 0) { endCycle(sim, ant, ENTRY, 'hungry'); return; }
    }
    setState(sim, ant, 'queen-care.feed');
    return;
  }
  // a feed of 0.1 was given; keep feeding (feed() ends the round when she is full or the crop is empty)
  if (got <= 1e-9) endCycle(sim, ant, ENTRY);
}

export const queenCareBehaviour: Behaviour = {
  task: 'queen-care',
  enter: (sim, ant) => setState(sim, ant, ENTRY),
  update: (sim, ant) => think(sim, ant, ENTRY, step, onCare),
  exit: (sim, ant) => releaseAll(sim, ant),
};
