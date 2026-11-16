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
//     they walk; at the dry place they wait (`flee.freeze`);
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
  FLEE_ARRIVE_BU, FLEE_CHECK_TICKS, FLEE_DRY_MARGIN_BU, FLEE_QUERY_PAD_BU, FLEE_RESUME_MARGIN_BU, FLEE_RETRY_S,
  FLEE_NURSE_MAX_SUB_S, FLEE_WATER_DEPTH_BU, FLOOD_ANT_SUB_KEY, FLOOD_SUBMERGE_DEPTH_BU,
} from '@/sim/balance/weather';
import { secondsToTicks } from '@/sim/time';
import { navStop, navTo } from '@/sim/locomotion';
import { cancel, interruptible } from '@/sim/ants/actions';
import { exitBehaviour } from '@/sim/ants/behaviourRunner';
import { depthOver, dryPlace, isDryAt, waterView, type WaterView } from '@/sim/nest/flood/dryPlace';
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

/** Starts a flight to `place` from the wet point `origin` (her task is left: claims released, walk stopped). */
function startFlee(sim: Sim, a: Ant, nest: Nest, place: Vec3, origin: Vec3, why: 'wet' | 'hold'): void {
  exitBehaviour(sim, a);
  if (a.action && interruptible(a)) cancel(sim, a, null);
  a.bb[FW.on] = 1;
  a.bb[FW.nest] = nest.id;
  a.bb[FW.since] = sim.state.tick;
  a.bb[FW.tx] = place.x; a.bb[FW.ty] = place.y; a.bb[FW.tz] = place.z;
  a.bb[FW.ox] = origin.x; a.bb[FW.oy] = origin.y; a.bb[FW.oz] = origin.z;
  a.bb[FW.phase] = why === 'hold' ? 1 : 0;
  const state = why === 'hold' ? WAIT : RUN;
  logDecision(sim, a, 'threat', state);
  a.state = state;
  a.stateTick = sim.state.tick;
  if (why === 'hold') navStop(sim, a);
  else navTo(sim, a, place, FLEE_ARRIVE_BU * sim.world.bu);
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

/** A new flight target for a fleeing ant whose dry place became wet (rising water), or null (none: stay). */
function retarget(sim: Sim, a: Ant, w: WaterView): void {
  const place = dryPlace(sim, w, a.pos, FLEE_DRY_MARGIN_BU * sim.world.bu);
  if (!place) return;
  a.bb[FW.tx] = place.pos.x; a.bb[FW.ty] = place.pos.y; a.bb[FW.tz] = place.pos.z;
  a.bb[FW.phase] = 0;
  a.state = RUN;
  a.stateTick = sim.state.tick;
  navTo(sim, a, place.pos, FLEE_ARRIVE_BU * sim.world.bu);
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
  if (wetHere && (a.bb[FW.phase] === 1 || !isDryAt(sim, w, target(a, tmp), FLEE_RESUME_MARGIN_BU * bu))) retarget(sim, a, w);
}

/** Is the walk's destination on a floor under water (an ant about to walk into the flooded part)? */
function walkingIntoWater(sim: Sim, a: Ant, w: WaterView): boolean {
  if (a.nav.status !== 'moving' || a.nestId === w.nest.id) return false;
  const d = a.nav.dest;
  if (sim.field.substrate(d) >= 0) return false; // a surface destination (the opening itself) is not the water
  return waterDepthOver(w.cache, sim.carve.voxel, d.x, d.y, d.z, w.level, -Infinity) > 0;
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
      if (place) startFlee(sim, a, w.nest, place.pos, { x: a.pos.x, y: feetY(a), z: a.pos.z }, 'wet');
    } else if (walkingIntoWater(sim, a, w)) {
      startFlee(sim, a, w.nest, a.pos, a.nav.dest, 'hold');
    }
  }
}

/** The per-tick walk of the fleeing ants (their behaviour held). */
function driveFleeing(sim: Sim, set: Set<number>): void {
  const tick = sim.state.tick, arrive = FLEE_ARRIVE_BU * sim.world.bu;
  for (const id of [...set].sort((x, y) => x - y)) {
    const a = sim.stores.ants.get(id);
    if (!a || !a.alive) { set.delete(id); continue; }
    if ((a.flags & AntFlag.POSSESSED) !== 0) { endFlee(sim, a); continue; }
    a.thinkTick = tick + HOLD_TICKS;
    if (a.bb[FW.phase] === 1) continue;
    const t = target(a, tmp);
    const there = Math.hypot(a.pos.x - t.x, a.pos.y - t.y, a.pos.z - t.z) <= arrive;
    if (there || a.nav.status === 'arrived' || a.nav.status === 'failed' || a.nav.status === 'idle') {
      // arrived, or the walk cannot get closer: wait here (the next check moves her on if the water comes)
      if (a.nav.status === 'moving') navStop(sim, a);
      a.bb[FW.phase] = 1;
      a.state = WAIT;
      a.stateTick = tick;
    }
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
