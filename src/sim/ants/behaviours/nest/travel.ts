// Movement and primitives for the in-nest behaviours: travel() issues one locomotion request per state and target
// and reports its status; act() starts an action primitive and tracks it until it ends. Behaviours never move
// ants or change the world themselves (contracts guidance §5).

import type { ActionId, Ant, Sim, TargetKind, TargetRef } from '@/sim/types';
import { TARGET_KINDS } from '@/sim/types';
import { navStop, navToTarget, type NavOptions } from '@/sim/locomotion';
import { begin, canDo } from '@/sim/ants/actions';
import { B } from './fsm';
import { dist } from './places';
import { CEILING_UP_Y, TRAVEL_STALL_S, WALK_STALL_SPEED_BU } from '@/sim/balance/nestwork';
import { secondsToTicks } from '@/sim/time';

export type TravelStatus = 'arrived' | 'moving' | 'failed';

const kindIndex = (k: TargetKind): number => (TARGET_KINDS as readonly string[]).indexOf(k);

/**
 * Walks toward a target until within arriveMm (straight distance; a chamber target also counts as reached once the
 * ant stands in it within arriveMm of its centre). One request per state and target: call it every think.
 */
export function travel(sim: Sim, ant: Ant, t: TargetRef, arriveMm: number, opts?: NavOptions): TravelStatus {
  if (dist(ant.pos, t.pos) <= arriveMm) {
    if (ant.nav.status === 'moving') navStop(sim, ant);
    return 'arrived';
  }
  const k = kindIndex(t.kind);
  const issued = ant.bb[B.goKind] === k && ant.bb[B.goId] === t.id;
  if (issued) {
    const st = ant.nav.status;
    if (st === 'moving') {
      // stuck upside down on a ceiling with the target lower down: let go and drop (GDD 01 `let-go`), then on
      if (standingStill(sim, ant) && ant.up.y < CEILING_UP_Y && t.pos.y < ant.pos.y - sim.world.bu && canDo(sim, ant, 'let-go', null).ok) {
        act(sim, ant, 'let-go', null);
        ant.bb[B.began] = 0;
        ant.bb[B.goKind] = -1;
      }
      return 'moving';
    }
    if (st === 'arrived') return 'arrived';
    if (st === 'failed') return 'failed';
  }
  ant.bb[B.goKind] = k;
  ant.bb[B.goId] = t.id;
  ant.bb[B.travelStall] = -1;
  return navToTarget(sim, ant, t, arriveMm, opts) ? 'moving' : 'failed';
}

/**
 * The walk runs but the ant has stood still for TRAVEL_STALL_S (the walker can hold a request it makes no headway
 * on for seconds; its own recovery ladder handles most cases, not a ceiling over the goal). Uses B.travelStall.
 */
function standingStill(sim: Sim, ant: Ant): boolean {
  if (ant.speed > WALK_STALL_SPEED_BU * sim.world.bu) { ant.bb[B.travelStall] = -1; return false; }
  const t0 = ant.bb[B.travelStall] ?? -1;
  if (t0 < 0) { ant.bb[B.travelStall] = sim.state.tick; return false; }
  if (sim.state.tick - t0 < secondsToTicks(TRAVEL_STALL_S)) return false;
  ant.bb[B.travelStall] = -1;
  return true;
}

/** Forgets the travel request of the current state (the next travel() issues a new one). */
export function resetTravel(ant: Ant): void {
  ant.bb[B.goKind] = -1;
  ant.bb[B.goId] = -1;
}

/** Starts an action primitive (stopping the walk first); true if it started. */
export function act(sim: Sim, ant: Ant, id: ActionId, target: TargetRef | null): boolean {
  if (ant.nav.status === 'moving') navStop(sim, ant);
  const ok = begin(sim, ant, id, target);
  ant.bb[B.began] = ok ? 1 : 0;
  // a timed primitive: think again when it ends (nothing to decide meanwhile)
  const a = ant.action;
  if (ok && a && a.durationTicks > 0) ant.thinkTick = Math.max(ant.thinkTick, a.startTick + a.durationTicks);
  return ok;
}

/** Whether the primitive started with act() has ended (successfully or not: check the postcondition). */
export function actEnded(ant: Ant): boolean {
  return ant.bb[B.began] === 1 && ant.action === null;
}

/** An action primitive is running. */
export function busy(ant: Ant): boolean {
  return ant.action !== null;
}

export function entity(kind: TargetKind, id: number, pos: { x: number; y: number; z: number }): TargetRef {
  return { kind, id, pos: { x: pos.x, y: pos.y, z: pos.z } };
}
