// Movement and primitives for the in-nest behaviours: travel() issues one locomotion request per state and target
// and reports its status; act() starts an action primitive and tracks it until it ends. Behaviours never move
// ants or change the world themselves (contracts guidance §5).

import type { ActionFailReason, ActionId, Ant, Sim, TargetKind, TargetRef } from '@/sim/types';
import { TARGET_KINDS } from '@/sim/types';
import { navStop, navToTarget, type NavOptions } from '@/sim/locomotion';
import { begin, canDo, type BeginOptions } from '@/sim/ants/actions';
import { B } from './fsm';
import { dist } from './places';

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
    if (st === 'moving') return 'moving';
    if (st === 'arrived') return 'arrived';
    if (st === 'failed') return 'failed';
  }
  ant.bb[B.goKind] = k;
  ant.bb[B.goId] = t.id;
  return navToTarget(sim, ant, t, arriveMm, opts) ? 'moving' : 'failed';
}

/** Forgets the travel request of the current state (the next travel() issues a new one). */
export function resetTravel(ant: Ant): void {
  ant.bb[B.goKind] = -1;
  ant.bb[B.goId] = -1;
}

/** Starts an action primitive (stopping the walk first); true if it started. */
export function act(sim: Sim, ant: Ant, id: ActionId, target: TargetRef | null, opts?: BeginOptions): boolean {
  if (ant.nav.status === 'moving') navStop(sim, ant);
  const ok = begin(sim, ant, id, target, opts);
  ant.bb[B.began] = ok ? 1 : 0;
  // a timed primitive: think again when it ends (nothing to decide meanwhile)
  const a = ant.action;
  if (ok && a && a.durationTicks > 0) ant.thinkTick = Math.max(ant.thinkTick, a.startTick + a.durationTicks);
  return ok;
}

/** Starts the primitive if it can start now (act); else returns why not without touching the walk. */
export function tryAct(sim: Sim, ant: Ant, id: ActionId, target: TargetRef | null, opts?: BeginOptions): ActionFailReason | null {
  const c = canDo(sim, ant, id, target, opts);
  if (!c.ok) return c.reason ?? 'conditions';
  return act(sim, ant, id, target, opts) ? null : 'conditions';
}

/** The result number of the last timed primitive's effect (loads moved, 1 / 0 ...); 0 if it failed. */
export function actResult(ant: Ant): number {
  return ant.bb['act.result'] ?? 0;
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
