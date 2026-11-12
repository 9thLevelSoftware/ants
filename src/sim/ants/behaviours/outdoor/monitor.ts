// Colony-level observers of the outdoor behaviours (events only; nothing here changes state):
//  - trail-established (GDD 02 App. C): the first time a connected trail >= TRAIL_CONNECTED_PH links an entrance of
//    the colony and a known source (checked every TRAIL_CHECK_S over the trail layer's active cells);
//  - trail-lost (§8.4): TRAIL_LOST_EVENT_ANTS ants lose the same trail within TRAIL_LOST_EVENT_WINDOW_S;
//  - marker-response (§12.2): how many ants currently respond to each forage marker, every MARKER_RESPONSE_EVERY_S.
// The "already established" set and the loss window are runtime caches; after a load the first trail pass only
// records what is already connected, so no event repeats.

import type { Vec3 } from '@/core/math/vec3';
import type { Sim, System } from '@/sim/types';
import { PHERO_CELL_BU } from '@/sim/balance';
import {
  MARKER_RESPONSE_EVERY_S, TRAIL_CHECK_S, TRAIL_CONNECTED_PH, TRAIL_LINK_REACH_BU, TRAIL_LOST_EVENT_ANTS,
  TRAIL_LOST_EVENT_WINDOW_S,
} from '@/sim/balance/foraging';
import { footprintMm } from '@/sim/ecology';
import { secondsToTicks } from '@/sim/time';
import { K } from './keys';

interface MonitorRt {
  primed: boolean;
  established: Set<string>;
  lost: Map<string, number[]>;
}

const rts = new WeakMap<Sim, MonitorRt>();

function rt(sim: Sim): MonitorRt {
  let r = rts.get(sim);
  if (!r) { r = { primed: false, established: new Set(), lost: new Map() }; rts.set(sim, r); }
  return r;
}

/** An ant following a trail lost it (locomotion's TRAIL_LOST_S passed without a reading). */
export function noteTrailLost(sim: Sim, colonyId: number, sourceId: number, pos: Vec3, _antId: number): void {
  const r = rt(sim);
  const key = `${colonyId}:${sourceId}`;
  const now = sim.state.tick, win = secondsToTicks(TRAIL_LOST_EVENT_WINDOW_S);
  const list = (r.lost.get(key) ?? []).filter((t) => now - t <= win);
  list.push(now);
  if (list.length >= TRAIL_LOST_EVENT_ANTS) {
    sim.emit({ type: 'trail-lost', colonyId, sourceId, pos: { x: pos.x, y: pos.y, z: pos.z } });
    list.length = 0;
  }
  r.lost.set(key, list);
}

/** Connected trail cells of a colony (x/z cell keys of cells >= TRAIL_CONNECTED_PH), or null without the API. */
function trailCells(sim: Sim, colonyId: number, cell: number): Map<number, number> | null {
  const visit = sim.phero.forEachActiveCell;
  if (!visit) return null;
  const cells = new Map<number, number>();
  visit.call(sim.phero, colonyId, 'trail', (x, _y, z, v) => {
    if (v < TRAIL_CONNECTED_PH) return;
    const k = Math.floor(x / cell) * 65536 + Math.floor(z / cell);
    cells.set(k, Math.max(cells.get(k) ?? 0, v));
  });
  return cells;
}

/**
 * BFS (8-neighbour, x/z) from cells within fromReach of `from` to cells within toReach of `to`; path length in
 * cells, -1 if not linked.
 */
function linkLength(cells: Map<number, number>, cell: number, fromReach: number, toReach: number, from: Vec3, to: Vec3): number {
  const near = (k: number, p: Vec3, reach: number) => {
    const i = Math.floor(k / 65536), j = k - i * 65536;
    return Math.hypot((i + 0.5) * cell - p.x, (j + 0.5) * cell - p.z) <= reach;
  };
  const dist = new Map<number, number>();
  const queue: number[] = [];
  for (const k of cells.keys()) if (near(k, from, fromReach)) { dist.set(k, 0); queue.push(k); }
  for (let q = 0; q < queue.length; q++) {
    const k = queue[q], d = dist.get(k)!;
    if (near(k, to, toReach)) return d;
    const i = Math.floor(k / 65536), j = k - i * 65536;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const n = (i + di) * 65536 + (j + dj);
        if ((di || dj) && cells.has(n) && !dist.has(n)) { dist.set(n, d + 1); queue.push(n); }
      }
    }
  }
  return -1;
}

function checkTrails(sim: Sim): void {
  const r = rt(sim);
  const bu = sim.world.bu, cell = PHERO_CELL_BU * bu, reach = TRAIL_LINK_REACH_BU * bu;
  for (const col of sim.stores.colonies.list) {
    if (!col.alive || col.knownSourceIds.length === 0) continue;
    let cells: Map<number, number> | null | undefined;
    for (const sid of col.knownSourceIds) {
      const key = `${col.id}:${sid}`;
      const s = sim.stores.sources.get(sid);
      if (!s || r.established.has(key)) continue;
      cells ??= trailCells(sim, col.id, cell);
      if (!cells || cells.size === 0) break;
      for (const nid of col.nestIds) {
        const n = sim.stores.nests.get(nid);
        // a large source (a spill) is worked at its rim, so the reach counts from its footprint
        const fromReach = footprintMm(s, bu) + reach;
        const linked = n?.entrances.map((e) => linkLength(cells!, cell, fromReach, e.radius + reach, s.pos, e.pos)).find((l) => l >= 0);
        if (linked === undefined) continue;
        r.established.add(key);
        if (r.primed) sim.emit({ type: 'trail-established', colonyId: col.id, sourceId: sid, lengthBu: linked * PHERO_CELL_BU });
        break;
      }
    }
  }
  r.primed = true;
}

function markerResponses(sim: Sim): void {
  for (const m of sim.stores.markers.list) {
    if (!m.alive || m.kind !== 'forage') continue;
    let n = 0;
    for (const a of sim.stores.ants.list) if (a.alive && a.colony === m.colony && a.bb[K.marker] === m.id) n++;
    if (n > 0) sim.emit({ type: 'marker-response', markerId: m.id, antsResponding: n });
  }
}

export const trailMonitorSystem: System = {
  name: 'outdoor-trail-monitor', phase: 'progression', every: secondsToTicks(TRAIL_CHECK_S), offset: 7, run: checkTrails,
};

export const markerResponseSystem: System = {
  name: 'outdoor-marker-response', phase: 'progression', every: secondsToTicks(MARKER_RESPONSE_EVERY_S), offset: 3,
  run: markerResponses,
};
