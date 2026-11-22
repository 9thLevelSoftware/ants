// Fleeing water (GDD 03 §11.3: "flee water along D_exit until dry"; "everything flooded: ants gather at the highest
// non-flooded voxels, including the throat and the mound surface"; task nest-fix3 item 2). A reactive override of
// every task, like the outdoor flee (GDD 02 §6.1):
//   - every FLEE_CHECK_TICKS, for each wet nest (its flood state and spill cache), the ants around its basin (the
//     spatial index, not a scan of all ants): one standing in water at least FLEE_WATER_DEPTH_BU over her feet (below
//     the 0.5 BU drowning depth) leaves her task and walks to the nearest dry place (flood/dryPlace.ts: along the
//     exit field, inside if the route passes one, else out through the opening; with every entrance closed the
//     nearest high floor). An ant on the surface walking into the wet part of a nest stops where she is instead
//     (GDD 03 §11.3 via the task: "workers on the surface do not walk into a flooded nest unless carrying brood out");
//   - every tick, the fleeing ants only: their behaviour is held (thinkTick in the future; the runner skips them) and
//     they walk: up the exit field itself to a dry place inside (no point goal: a point in a tunnel is not a place
//     to stand, and the walk would end below it), else to the point (outside the opening, a high floor of a closed
//     nest). On a flight to a place inside she stops and waits (`flee.freeze`) where her own feet stand
//     FLEE_DRY_MARGIN clear of the water; on a flight out she goes all the way to the surface place (the throat is
//     no place to crowd). Never a wait in water: a walk that ends with her still in it (arrived short, failed) is
//     planned again at the next check;
//   - she resumes her task (the runner enters it afresh) once the place she fled from is dry again, the nest is dry,
//     or after FLEE_RETRY_S; if her task leads back into the water she flees again.
// Never moved by this rule: the possessed ant (she gets the water alert instead, flood/diagnostics.ts), a founding
// queen (the founding module's), ants in the air, nurses in shallow water, and a nurse carrying or fetching brood to
// evacuate until her submersion clock nears the drowning grace (GDD 03 §11.3 nurses evacuate; carried brood never
// drowns).
// State is in ant.bb (persisted); the list of fleeing ants is a runtime index rebuilt from it after a load.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Nest, Sim, System } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import {
  FLEE_ARRIVE_BU, FLEE_CHECK_TICKS, FLEE_DRY_MARGIN_BU, FLEE_HOLD_MAX_GD, FLEE_QUERY_PAD_BU, FLEE_RESUME_MARGIN_BU, FLEE_RETRY_S,
  FLEE_NURSE_MAX_SUB_S, FLEE_WATER_DEPTH_BU, FLOOD_ANT_SUB_KEY, FLOOD_SUBMERGE_DEPTH_BU,
} from '@/sim/balance/weather';
import { secondsToTicks, TICKS_PER_DAY } from '@/sim/time';
import { switchTask } from '@/sim/colony/allocation/assign';
import { navFollowField, navStop, navTo } from '@/sim/locomotion';
import { cancel, interruptible } from '@/sim/ants/actions';
import { exitBehaviour } from '@/sim/ants/behaviourRunner';
import { depthOver, dryPlace, isDryAt, outsidePlace, waterView, type DryPlace, type WaterView } from '@/sim/nest/flood/dryPlace';
import { waterDepthOver } from '@/sim/nest/flood/spill';
import { claimFresh, isCarryJob } from './board';
import { B, logDecision } from './fsm';
import { isFoundingQueen } from './queen';

/** ant.bb keys (numbers; persisted). */
export const FW = {
  /** 1 while fleeing water. */
  on: 'fw.on',
  /** 0 walking to the dry place, 1 waiting there. */
  phase: 'fw.ph',
  /** Tick the flight began. */
  since: 'fw.t0',
  /** Dry place, mm. */
  tx: 'fw.tx', ty: 'fw.ty', tz: 'fw.tz',
  /** The wet place she left (resume once it is dry), mm. */
  ox: 'fw.ox', oy: 'fw.oy', oz: 'fw.oz',
  /** Nest whose water she flees. */
  nest: 'fw.n',
  /** How she walks: 1 up the exit field, 0 to the point. */
  route: 'fw.r',
  /** 1: the dry place is outside the nest (she goes all the way out), 0: inside (she stops where her feet are dry). */
  out: 'fw.x',
} as const;

const RUN = 'flee.run', WAIT = 'flee.freeze';
/** Ticks the held behaviour's next think is pushed ahead each tick (any value > 0 keeps the runner off her). */
const HOLD_TICKS = 2;

interface Runtime { ids: Set<number> | null }
const RUNTIMES = new WeakMap<Sim, Runtime>();

/** The fleeing ants (rebuilt from ant.bb the first time after a load or a new sim). */
function fleeing(sim: Sim): Set<number> {
  let rt = RUNTIMES.get(sim);
  if (!rt) { rt = { ids: null }; RUNTIMES.set(sim, rt); }
  if (!rt.ids) {
    rt.ids = new Set();
    for (const a of sim.stores.ants.list) if (a.alive && a.bb[FW.on] === 1) rt.ids.add(a.id);
  }
  return rt.ids;
}

/** Is the ant fleeing water now? */
export function isFleeingWater(ant: Ant): boolean {
  return ant.bb[FW.on] === 1;
}

const tmp: Vec3 = { x: 0, y: 0, z: 0 };

function feetY(a: Ant): number {
  return a.pos.y - a.up.y * a.footOffset;
}

function target(a: Ant, out: Vec3): Vec3 {
  out.x = a.bb[FW.tx]; out.y = a.bb[FW.ty]; out.z = a.bb[FW.tz];
  return out;
}

/**
 * Never moved by this rule (see the header). `depth`: the water over her feet now, mm. Nurses work on in shallow
 * water (below the drowning depth: the brood is what they are there for), and a nurse fetching or carrying brood out
 * goes on in deeper water too until her submersion clock reaches FLEE_NURSE_MAX_SUB_S, well inside the 50 s grace.
 */
function exempt(sim: Sim, a: Ant, depth: number): boolean {
  if (!a.alive || (a.flags & AntFlag.POSSESSED) !== 0 || a.medium === 'air' || isFoundingQueen(a)) return true;
  const rescuing = a.carry.kind === 'brood' || (a.task === 'nurse' && claimFresh(sim, a) && isCarryJob(a.bb[B.jobKind] ?? -1));
  if (rescuing) return (a.bb[FLOOD_ANT_SUB_KEY] ?? 0) < FLEE_NURSE_MAX_SUB_S;
  return a.task === 'nurse' && depth < FLOOD_SUBMERGE_DEPTH_BU * sim.world.bu;
}

const EXIT = { kind: 'exit', id: -1 } as const;

/** Sets off toward a dry place: up the exit field (route 'exit'), else to the point. */
function walkTo(sim: Sim, a: Ant, nest: Nest, place: DryPlace): void {
  a.bb[FW.tx] = place.pos.x; a.bb[FW.ty] = place.pos.y; a.bb[FW.tz] = place.pos.z;
  a.bb[FW.route] = place.route === 'exit' ? 1 : 0;
  a.bb[FW.out] = place.outside ? 1 : 0;
  a.bb[FW.phase] = 0;
  const arrive = FLEE_ARRIVE_BU * sim.world.bu;
  if (place.route === 'exit' && navFollowField(sim, a, nest.id, EXIT, arrive)) return;
  a.bb[FW.route] = 0;
  navTo(sim, a, place.pos, arrive);
}

/**
 * Starts a flight from the wet point `origin` (her task is left: claims released, walk stopped): toward `place`, or
 * (why 'hold': an ant outside about to walk into the water) standing where she is.
 */
function startFlee(sim: Sim, a: Ant, nest: Nest, place: DryPlace | null, origin: Vec3, why: 'wet' | 'hold'): void {
  exitBehaviour(sim, a);
  if (a.action && interruptible(a)) cancel(sim, a, null);
  a.bb[FW.on] = 1;
  a.bb[FW.nest] = nest.id;
  a.bb[FW.since] = sim.state.tick;
  a.bb[FW.ox] = origin.x; a.bb[FW.oy] = origin.y; a.bb[FW.oz] = origin.z;
  const state = why === 'hold' ? WAIT : RUN;
  logDecision(sim, a, 'threat', state);
  a.state = state;
  a.stateTick = sim.state.tick;
  if (why === 'hold' || !place) {
    a.bb[FW.tx] = a.pos.x; a.bb[FW.ty] = a.pos.y; a.bb[FW.tz] = a.pos.z;
    a.bb[FW.route] = 0;
    a.bb[FW.out] = 0;
    a.bb[FW.phase] = 1;
    navStop(sim, a);
  } else walkTo(sim, a, nest, place);
  a.thinkTick = sim.state.tick + HOLD_TICKS;
  fleeing(sim).add(a.id);
}

/** Ends the flight: the behaviour runner enters her task afresh on its next pass (this tick). */
function endFlee(sim: Sim, a: Ant): void {
  for (const k of Object.values(FW)) delete a.bb[k];
  fleeing(sim).delete(a.id);
  if (!a.alive) return;
  if (a.nav.status === 'moving') navStop(sim, a);
  a.thinkTick = sim.state.tick;
}

/** A new flight for a fleeing ant in water again (rising water, a walk that ended short), if a dry place remains. */
function retarget(sim: Sim, a: Ant, w: WaterView): void {
  const place = dryPlace(sim, w, a.pos, FLEE_DRY_MARGIN_BU * sim.world.bu);
  if (!place) return;
  a.state = RUN;
  a.stateTick = sim.state.tick;
  walkTo(sim, a, w.nest, place);
}

/** Her own feet stand at least FLEE_DRY_MARGIN clear of the water (or off its basin): she may stop here. */
function feetDry(sim: Sim, w: WaterView, a: Ant): boolean {
  return depthOver(sim, w, a.pos, feetY(a)) <= -FLEE_DRY_MARGIN_BU * sim.world.bu;
}

/** The place she fled from is dry again (by the resume margin), or the nest is dry. */
function originDry(sim: Sim, a: Ant, w: WaterView | null): boolean {
  if (!w) return true;
  tmp.x = a.bb[FW.ox]; tmp.y = a.bb[FW.oy]; tmp.z = a.bb[FW.oz];
  return depthOver(sim, w, tmp, -Infinity) <= -FLEE_RESUME_MARGIN_BU * sim.world.bu;
}

/** One check of a fleeing ant (every FLEE_CHECK_TICKS). */
function checkFleeing(sim: Sim, a: Ant, w: WaterView | null): void {
  const bu = sim.world.bu;
  const late = sim.state.tick - (a.bb[FW.since] ?? 0) >= secondsToTicks(FLEE_RETRY_S);
  if (originDry(sim, a, w) || late) {
    // still standing in water when the retry is due: no rest, a new dry place instead of the task
    if (late && w && depthOver(sim, w, a.pos, feetY(a)) >= FLEE_WATER_DEPTH_BU * bu) { a.bb[FW.since] = sim.state.tick; retarget(sim, a, w); return; }
    endFlee(sim, a);
    return;
  }
  if (!w) return;
  const wetHere = depthOver(sim, w, a.pos, feetY(a)) >= FLEE_WATER_DEPTH_BU * bu;
  if (!wetHere) return;
  // waiting in water again, walking toward a place the water took, or a walk that ended before she was dry
  const stalled = a.bb[FW.phase] === 0 && a.nav.status !== 'moving';
  if (a.bb[FW.phase] === 1 || stalled || !isDryAt(sim, w, target(a, tmp), FLEE_RESUME_MARGIN_BU * bu)) retarget(sim, a, w);
}

/**
 * Is the walk's destination on a floor under water deep enough to flee from (an ant about to walk into the flooded
 * part)? The depth is the one at which an ant inside leaves (FLEE_WATER_DEPTH_BU): round 12's trace on cpv #2 held its
 * hauler outside 65 times in 6 gd for a destination in the brood chamber with 0.01-0.17 BU of water on the floor
 * (median 0.05, 1-10 % of the chamber wet), where the nurses inside worked on; the rule asked for any water (> 0).
 */
function walkingIntoWater(sim: Sim, a: Ant, w: WaterView): boolean {
  if (a.nav.status !== 'moving' || a.nestId === w.nest.id) return false;
  const d = a.nav.dest;
  if (sim.field.substrate(d) >= 0) return false; // a surface destination (the opening itself) is not the water
  return waterDepthOver(w.cache, sim.carve.voxel, d.x, d.y, d.z, w.level, -Infinity) >= FLEE_WATER_DEPTH_BU * sim.world.bu;
}

/** ant.bb keys of the hold limit (kept across holds, unlike FW): first and last tick of a run of holds. */
const HOLD0 = 'fw.h0', HOLDLAST = 'fw.hl';

/**
 * Direction 26 item 4a: a hold never outlasts FLEE_HOLD_MAX_GD over a run of holds (one hold, its FLEE_RETRY_S
 * re-plan into the task, held again...). Past that her task is handed back to the allocator: she goes idle where she
 * is and the task's target is refilled by whoever the allocator picks. Returns true when the task was handed back.
 */
function holdExpired(sim: Sim, a: Ant): boolean {
  const tick = sim.state.tick;
  const last = a.bb[HOLDLAST];
  if (last === undefined || tick - last > 2 * secondsToTicks(FLEE_RETRY_S) + FLEE_CHECK_TICKS) a.bb[HOLD0] = tick;
  a.bb[HOLDLAST] = tick;
  if (tick - (a.bb[HOLD0] ?? tick) < FLEE_HOLD_MAX_GD * TICKS_PER_DAY) return false;
  delete a.bb[HOLD0]; delete a.bb[HOLDLAST];
  const col = sim.stores.colonies.get(a.colony);
  exitBehaviour(sim, a);
  if (a.action && interruptible(a)) cancel(sim, a, null);
  navStop(sim, a);
  if (col) switchTask(sim, col, a, 'idle', 'threat');
  a.thinkTick = tick;
  return true;
}

const ids: number[] = [];
const centre: Vec3 = { x: 0, y: 0, z: 0 };

/** The ants around a wet nest's basin, in id order. */
function antsAround(sim: Sim, w: WaterView): number[] {
  const b = w.cache.box, v = sim.carve.voxel;
  centre.x = ((b.i0 + b.i1) / 2) * v; centre.y = ((b.j0 + b.j1) / 2) * v; centre.z = ((b.k0 + b.k1) / 2) * v;
  const r = (Math.hypot(b.i1 - b.i0, b.j1 - b.j0, b.k1 - b.k0) / 2 + 1) * v + FLEE_QUERY_PAD_BU * sim.world.bu;
  ids.length = 0;
  sim.index.queryAnts(centre, r, ids);
  return ids.sort((x, y) => x - y);
}

/** The flood check of one wet nest: ants in its water start fleeing; ants walking into it stop. */
function checkNest(sim: Sim, w: WaterView, set: Set<number>): void {
  const bu = sim.world.bu;
  for (const id of antsAround(sim, w)) {
    if (set.has(id)) continue;
    const a = sim.stores.ants.get(id);
    if (!a || !a.alive) continue;
    const depth = depthOver(sim, w, a.pos, feetY(a));
    if (exempt(sim, a, depth)) continue;
    if (depth >= FLEE_WATER_DEPTH_BU * bu) {
      const place = dryPlace(sim, w, a.pos, FLEE_DRY_MARGIN_BU * bu);
      // no dry place anywhere (a full sump with no way out): she stays, and the water decides (no cheating)
      if (place) startFlee(sim, a, w.nest, place, { x: a.pos.x, y: feetY(a), z: a.pos.z }, 'wet');
    } else if (walkingIntoWater(sim, a, w)) {
      if (!holdExpired(sim, a)) startFlee(sim, a, w.nest, null, a.nav.dest, 'hold');
    }
  }
}

/** Stops her walk and waits where she stands. */
function waitHere(sim: Sim, a: Ant, tick: number): void {
  if (a.nav.status === 'moving') navStop(sim, a);
  a.bb[FW.phase] = 1;
  a.state = WAIT;
  a.stateTick = tick;
}

/**
 * The per-tick walk of the fleeing ants (their behaviour held). A flight to a dry place inside ends where her own
 * feet stand dry; a flight out of the nest goes up the exit field and on to the surface place beyond the rim (the
 * dry-place search found nothing dry inside on the way, so the throat is no place to crowd). Any other end of the
 * walk with her still in water leaves her walking for the next check to plan again: never a wait in water.
 */
function driveFleeing(sim: Sim, set: Set<number>): void {
  const tick = sim.state.tick;
  for (const id of [...set].sort((x, y) => x - y)) {
    const a = sim.stores.ants.get(id);
    if (!a || !a.alive) { set.delete(id); continue; }
    if ((a.flags & AntFlag.POSSESSED) !== 0) { endFlee(sim, a); continue; }
    a.thinkTick = tick + HOLD_TICKS;
    if (a.bb[FW.phase] === 1) continue;
    const nest = sim.stores.nests.get(a.bb[FW.nest] ?? -1);
    const w = nest ? waterView(sim, nest) : null;
    if (!w) { waitHere(sim, a, tick); continue; }
    const out = a.bb[FW.out] === 1, dry = feetDry(sim, w, a);
    if (dry && !out) { waitHere(sim, a, tick); continue; }
    if (a.nav.status === 'moving') continue;
    if (a.bb[FW.route] === 1 && a.nav.status === 'arrived') {
      // at the top of the exit field: on out through the opening
      const place = outsidePlace(sim, w.nest, a.pos);
      if (place) { walkTo(sim, a, w.nest, place); continue; }
    }
    if (dry) { waitHere(sim, a, tick); continue; }
    // the walk ended with her in water: no wait here; checkFleeing plans a new walk at its next pass
    if (a.nav.status !== 'idle') navStop(sim, a);
  }
}

function runFleeWater(sim: Sim): void {
  const set = fleeing(sim);
  if (sim.state.tick % FLEE_CHECK_TICKS === 1) {
    for (const id of [...set].sort((x, y) => x - y)) {
      const a = sim.stores.ants.get(id);
      if (!a || !a.alive) { set.delete(id); continue; }
      const nest = sim.stores.nests.get(a.bb[FW.nest] ?? -1);
      checkFleeing(sim, a, nest ? waterView(sim, nest) : null);
    }
    for (const nest of sim.stores.nests.list) {
      const w = waterView(sim, nest);
      if (w) checkNest(sim, w, set);
    }
  }
  if (set.size > 0) driveFleeing(sim, set);
}

/**
 * Fleeing water: in the perception phase, before the behaviour runner, so a held ant's behaviour never runs; the
 * check one tick after each flood step (which runs in the last phase) reads that step's level.
 */
export const fleeWaterSystem: System = { name: 'flee-water', phase: 'perception', run: runFleeWater };
