// Locomotion's own per-walker working state, persisted inside NavState (`nav.loco`, optional, created on the first
// request). Plain data only (numbers, strings, Vec3), so saves and determinism cover it. NavState itself keeps the
// public request: mode (current leg), dest / destKind / destId (final goal), path, field, route, status.

import type { Vec3 } from '@/core/math/vec3';
import type { Walker } from '@/sim/types';

export type { LocoRequest, LocoSpeedKind, NavScratch } from '@/sim/types/navScratch';
import type { NavScratch } from '@/sim/types/navScratch';

const v = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

/** "No progress measured yet" (finite, so states stay JSON-safe). */
export const NO_PROGRESS = 1e30;

export function newScratch(): NavScratch {
  return {
    req: 'none', reqTick: 0, timeoutTick: -1, goal: v(), goalNest: -1, goalField: '', legField: '', legExit: false,
    entranceId: -1, routeDir: 1, routeEnd: -1, routeThenSeek: 0, seekTarget: v(), seekFinal: 0, flowKey: '', flowNest: -1, discSig: 0, legNest: -1,
    speedKind: 'cruise', speedMult: 1, speedFixed: 0,
    planTick: -1, retargetTick: 0, best: NO_PROGRESS, bestTick: 0, anchor: v(), ladder: 0, ladderUntil: 0, side: 1, episodes: 0,
    relocations: 0, center: v(), radius: 0, trailColony: -1, trailChannel: '', trailDir: 0, trailLostS: 0, trailTurned: 0,
    crumbIdx: -1, latch: 0, latchAngle: 0, latchS: 0, lowMagS: 0, upRef: v(0, 1, 0), upRefAge: -1, latchDir: v(1, 0, 0), lastDir: v(),
    pivot: 0, rescueS: 0, rescueFrom: v(), openX: 0, openZ: 0, open: -1,
  };
}

/** The walker's scratch, created on first use. */
export function scratchOf(w: Walker): NavScratch {
  let s = w.nav.loco;
  if (!s) {
    s = newScratch();
    w.nav.loco = s;
  }
  return s;
}

/** Numeric id of a walker (ants and creatures have one), 0 otherwise; used for deterministic noise and staggering. */
export function walkerId(w: Walker): number {
  const id = (w as Walker & { id?: number }).id;
  return typeof id === 'number' ? id : 0;
}
