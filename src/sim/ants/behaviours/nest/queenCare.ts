// `queen-care` (GDD 02 §10.5): attendants stay by the queen and groom her, load a ration (mix §5.4.2) and feed it
// to her until her gut reaches the retinue target, feed her from their own reserve from starvation S2 on when the
// pool cannot fill a feed (§5.7), collect the eggs she lays and carry them to the best egg pile (§10.4.1), and
// escort her when she relocates.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Behaviour, Brood, Chamber, Nest, Sim } from '@/sim/types';
import { reserveFeedAllowed } from '@/sim/ants/actions';
import { queenWantsFood, requestTask } from '@/sim/colony';
import { QUEEN_TARGET_GUT_C } from '@/sim/balance/colony';
import {
  BROOD_DROP_ARRIVE_BU, CARER_KEEP_RESERVE, EGG_COLLECT_BU, EGG_PILE_OFFSET, EGG_PILE_RADIUS_BU, QUEEN_ATTEND_BU,
  QUEEN_FEED_LOADS, QUEEN_GROOM_EVERY_S, ROOM_ARRIVE_FRAC,
} from '@/sim/balance/nestwork';
import { secondsToTicks } from '@/sim/time';
import { claim, freeFor, Job, sortOf } from './board';
import { approach, endCycle, primitiveDone, reachAndAct, recover, releaseAll, think, carryingLoad } from './common';
import { B, bbv, setState, waitThink } from './fsm';
import { chamberIn, floorPoint, floorY, foodChamber, GOLDEN_ANGLE, homeNest, pileSlot } from './places';
import { isFleeingWater } from './fleeWater';
import { isFoundingQueen } from './queen';
import { bestChamberId } from './sorting';
import { act, actResult, entity, resetTravel, travel, tryAct } from './travel';

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

/** Starvation S2 or later (GDD 02 §5.7) and the pool cannot fill one feed: carers give from their own reserve. */
function reserveTime(sim: Sim, ant: Ant): boolean {
  const col = sim.stores.colonies.get(ant.colony);
  return reserveFeedAllowed(col) && col!.stores.c + col!.stores.p < QUEEN_FEED_LOADS;
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

/**
 * Where a collected egg would be put down: the egg pile of the best chamber for eggs (its own chamber when the
 * sorting has none). Null when the colony has no such chamber.
 */
function eggDropPoint(sim: Sim, ant: Ant, nest: Nest, b: Brood, out: Vec3): Vec3 | null {
  const ctx = sortOf(sim, ant.colony, nest.id);
  const room = chamberIn(nest, ctx ? bestChamberId(ctx, 0) : -1) ?? chamberIn(nest, b.chamberId);
  return room ? eggPile(sim, ant, room, b.id, out) : null;
}

/**
 * The lowest-id free egg lying within EGG_COLLECT_BU of the queen that is worth collecting: its drop point lies
 * beyond EGG_COLLECT_BU of her. In a chamber too small for that (a founding chamber of 2 BU radius, where the pile
 * opposite her is still within reach of her) a carer would put the egg down where she picks it up again, for ever,
 * and the egg could not be tended meanwhile (colony-life round 1): such eggs stay where the queen laid them.
 */
function eggNearQueen(sim: Sim, ant: Ant, q: Ant, nest: Nest): Brood | null {
  const r = EGG_COLLECT_BU * sim.world.bu;
  let best: Brood | null = null;
  near.length = 0;
  sim.index.queryBrood(q.pos, r, near);
  for (const id of near) {
    const b = sim.stores.brood.get(id);
    if (!b || !b.alive || b.colony !== ant.colony || b.stage !== 'egg' || b.carriedBy >= 0) continue;
    if (dist3(b.pos, q.pos) > r || !freeFor(sim, ant, b.id)) continue;
    if (best && b.id >= best.id) continue;
    const drop = eggDropPoint(sim, ant, nest, b, pile);
    if (!drop || dist3(drop, q.pos) <= r) continue;
    best = b;
  }
  return best;
}

function dist3(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function attend(sim: Sim, ant: Ant): void {
  const q = queenOf(sim, ant);
  if (!q) { requestTask(sim, ant, 'idle', 'surplus'); return; }
  if (q.state === 'queen.relocate') { setState(sim, ant, 'queen-care.escort', 'marker:move-queen'); return; }
  // her retinue follows her out of rising water (GDD 03 §11.3 "escorted by queen-care")
  if (isFleeingWater(q)) { setState(sim, ant, 'queen-care.escort', 'threat'); return; }
  const home = homeNest(sim, ant);
  const egg = home ? eggNearQueen(sim, ant, q, home) : null;
  if (egg) { claim(sim, ant, Job.collectEggs, egg.id); setState(sim, ant, 'queen-care.collect-eggs', 'job:collect-eggs'); return; }
  const reserve = reserveTime(sim, ant) && ant.cropC + ant.cropP < QUEEN_FEED_LOADS;
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
  if (primitiveDone(ant)) { ant.bb[B.began] = 0; loaded(sim, ant, actResult(ant)); return; }
  const nest = homeNest(sim, ant);
  const room = nest ? foodChamber(sim, nest, ant.pos) : undefined;
  if (!room) { recover(sim, ant, ENTRY, 'job:load'); return; }
  const inside = ant.chamberId === room.id;
  const st = inside ? 'arrived' : travel(sim, ant, entity('chamber', room.id, room.center), ROOM_ARRIVE_FRAC * Math.min(room.radii.x, room.radii.z));
  if (st === 'failed') { recover(sim, ant, ENTRY, 'stuck', true); return; }
  if (st !== 'arrived') return;
  // the `load-crop` primitive fills the crop to QUEEN_RATION_BASE with the queen's ration mix (GDD 02 §5.4.2)
  const why = tryAct(sim, ant, 'load-crop', null);
  if (why === 'crop-full') setState(sim, ant, 'queen-care.feed');
  else if (why === 'no-reserve') loaded(sim, ant, 0);
  else if (why) recover(sim, ant, ENTRY, 'job:load');
}

/** After loading: feed her; with nothing in the pool (S2) from the own reserve instead (GDD 02 §5.7). */
function loaded(sim: Sim, ant: Ant, got: number): void {
  if (got <= 1e-6 && ant.cropC + ant.cropP < QUEEN_FEED_LOADS) {
    const allowed = reserveFeedAllowed(sim.stores.colonies.get(ant.colony));
    ant.bb[RESERVE] = allowed && ant.energy > CARER_KEEP_RESERVE ? 1 : 0;
    if (ant.bb[RESERVE] === 0) { endCycle(sim, ant, ENTRY, 'hungry'); return; }
  }
  setState(sim, ant, 'queen-care.feed');
}

/** queen-care.feed: `feed-queen` (0.1 load per 4 s) until her gut target or an empty crop; S2: from the reserve. */
function feed(sim: Sim, ant: Ant): void {
  if (primitiveDone(ant)) {
    ant.bb[B.began] = 0;
    ant.bb[B.n] = 0;
    resetTravel(ant);
    if (actResult(ant) <= 1e-9) { endCycle(sim, ant, ENTRY); return; }
  }
  const q = queenOf(sim, ant);
  if (!q) { endCycle(sim, ant, ENTRY); return; }
  const fromReserve = bbv(ant, RESERVE, 0) === 1;
  // the own reserve is carbohydrate only: it is given while the queen lacks C, never for her missing protein
  const wants = fromReserve ? q.queen!.gut.c < QUEEN_TARGET_GUT_C : queenWantsFood(q);
  if (!wants || (fromReserve ? ant.energy <= CARER_KEEP_RESERVE : ant.cropC + ant.cropP < QUEEN_FEED_LOADS * 0.5)) {
    endCycle(sim, ant, ENTRY);
    return;
  }
  const st = reachAndAct(sim, ant, entity('ant', q.id, q.pos), 'feed-queen', undefined, fromReserve ? RESERVE_FEED : undefined);
  if (st === 'failed') recover(sim, ant, ENTRY, 'stuck', ant.nav.status === 'failed');
}

const RESERVE_FEED = { secondary: true } as const;

function collectEggs(sim: Sim, ant: Ant): void {
  const b = sim.stores.brood.get(bbv(ant, B.jobId));
  const nest = homeNest(sim, ant);
  if (!b || !nest) { recover(sim, ant, ENTRY, 'job:collect-eggs'); return; }
  if (b.carriedBy === ant.id) {
    if (!eggDropPoint(sim, ant, nest, b, pile)) { recover(sim, ant, ENTRY, 'job:collect-eggs'); return; }
    ant.bb[PICKED] = 2;
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
  if (!q || (q.state !== 'queen.relocate' && !isFleeingWater(q))) { setState(sim, ant, ENTRY); return; }
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

export const queenCareBehaviour: Behaviour = {
  task: 'queen-care',
  enter: (sim, ant) => setState(sim, ant, ENTRY),
  update: (sim, ant) => think(sim, ant, ENTRY, step),
  exit: (sim, ant) => releaseAll(sim, ant),
  delivering: carryingLoad,
};
