// Tab / Shift+Tab possession cycling (GDD 01 §3.2): living colony ants within TAB_RADIUS of the centre (else
// TAB_RADIUS_WIDE, else the whole colony), excluding the current one, nearest first. The list is frozen while
// Tab is pressed again within TAB_LIST_TTL_S; each press takes the next entry and wraps.
import type { Vec3 } from '@/core';
import type { Sim } from '@/sim/types';

export const TAB_RADIUS_BU = 40;
export const TAB_RADIUS_WIDE_BU = 160;
export const TAB_LIST_TTL_S = 2;

export function tabCandidates(sim: Sim, centre: Vec3, excludeId: number): number[] {
  const col = sim.state.colonies[0];
  if (!col) return [];
  const bu = sim.world.bu;
  const all: { id: number; d2: number }[] = [];
  for (const a of sim.state.ants) {
    if (!a.alive || a.colony !== col.id || a.id === excludeId) continue;
    all.push({ id: a.id, d2: (a.pos.x - centre.x) ** 2 + (a.pos.y - centre.y) ** 2 + (a.pos.z - centre.z) ** 2 });
  }
  all.sort((a, b) => a.d2 - b.d2 || a.id - b.id);
  for (const r of [TAB_RADIUS_BU, TAB_RADIUS_WIDE_BU]) {
    const near = all.filter((c) => c.d2 <= (r * bu) ** 2);
    if (near.length) return near.map((c) => c.id);
  }
  return all.map((c) => c.id);
}

export class TabCycle {
  private list: number[] = [];
  private index = -1;
  private stamp = -Infinity;

  /** Next ant id to possess (dir +1 Tab, -1 Shift+Tab), or -1 when there is none. `nowS` is real seconds. */
  next(sim: Sim, centre: Vec3, currentId: number, dir: 1 | -1, nowS: number): number {
    if (nowS - this.stamp > TAB_LIST_TTL_S || this.list.length === 0) {
      this.list = tabCandidates(sim, centre, currentId);
      this.index = dir > 0 ? -1 : 0;
    }
    this.stamp = nowS;
    if (this.list.length === 0) return -1;
    this.index = (this.index + dir + this.list.length) % this.list.length;
    return this.list[this.index];
  }
}
