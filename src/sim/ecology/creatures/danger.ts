// Player colony danger grid (GDD 05 §2.4): 16 BU cells; a witnessed predator kill or survived strike within 6 L of
// a nestmate adds 1.0 to its cell; half-life 0.5 gd; AI route costs x min(3, 1 + 2 danger) through the nav grid's
// runtime cost overlay; an avoid marker counts as danger 3 inside its radius while it exists.

import type { Ant, Colony, Sim } from '@/sim/types';
import type { Vec3 } from '@/core/math/vec3';
import { DANGER_CELL_BU } from '@/sim/balance';
import {
  DANGER_ADD, DANGER_AVOID_MARKER, DANGER_COST_MAX, DANGER_COST_PER, DANGER_EPS, DANGER_HALF_LIFE_GD, DANGER_WITNESS_L,
} from '@/sim/balance/creatures';
import { SECONDS_PER_DAY } from '@/sim/time';
import { antLen, dist } from './common';

function playerColony(sim: Sim): Colony | undefined {
  return sim.state.colonies.find((c) => c.alive && c.isPlayer);
}

/** Cell edge of the danger grid, mm (16 Lasius-scaled BU of this world). */
export function dangerCell(sim: Sim): number {
  return DANGER_CELL_BU * sim.world.bu;
}

/** The player colony's grid, allocated on first use. */
export function dangerGrid(sim: Sim): { colony: Colony; w: number; h: number; cell: number } | null {
  const col = playerColony(sim);
  if (!col) return null;
  const cell = dangerCell(sim);
  const w = Math.max(1, Math.ceil(sim.world.size / cell)), h = w;
  if (col.danger.length !== w * h) col.danger = new Float32Array(w * h);
  return { colony: col, w, h, cell };
}

export function dangerAt(sim: Sim, p: Vec3): number {
  const g = dangerGrid(sim);
  if (!g) return 0;
  const i = cellIndex(g, p);
  return i < 0 ? 0 : g.colony.danger[i];
}

function cellIndex(g: { w: number; h: number; cell: number }, p: Vec3): number {
  const ix = Math.floor(p.x / g.cell), iz = Math.floor(p.z / g.cell);
  if (ix < 0 || iz < 0 || ix >= g.w || iz >= g.h) return -1;
  return iz * g.w + ix;
}

/** Adds danger at p (the cell of p). */
export function addDanger(sim: Sim, p: Vec3, amount = DANGER_ADD): void {
  const g = dangerGrid(sim);
  if (!g) return;
  const i = cellIndex(g, p);
  if (i >= 0) g.colony.danger[i] += amount;
}

/**
 * A strike on `victim` at p (killed or survived): it counts when a nestmate of the PLAYER colony was within 6 L
 * (the victim itself for a survived strike, any other nestmate for a kill).
 */
export function noteDangerEvent(sim: Sim, victim: Ant, p: Vec3, outcome: 'killed' | 'survived'): void {
  const g = dangerGrid(sim);
  if (!g || victim.colony !== g.colony.id) return;
  const r = DANGER_WITNESS_L * antLen(sim, victim);
  let witnessed = outcome === 'survived';
  if (!witnessed) {
    const ids: number[] = [];
    sim.index.queryAnts(p, r, ids);
    for (const id of ids) {
      const a = sim.stores.ants.get(id);
      if (a && a.id !== victim.id && a.colony === victim.colony && dist(a.pos, p) <= r) { witnessed = true; break; }
    }
  }
  if (witnessed) addDanger(sim, p);
}

/** Last cost written per cell (runtime cache) so the nav grid overlay is only touched where it changed. */
const written = new WeakMap<Sim, Float32Array>();

/** Decays the grid by dtS seconds and refreshes the nav-grid cost overlay of changed cells. */
export function updateDanger(sim: Sim, dtS: number): void {
  const g = dangerGrid(sim);
  if (!g) return;
  const d = g.colony.danger;
  const k = Math.pow(0.5, dtS / (DANGER_HALF_LIFE_GD * SECONDS_PER_DAY));
  for (let i = 0; i < d.length; i++) if (d[i] !== 0) d[i] = d[i] < DANGER_EPS ? 0 : d[i] * k;
  let last = written.get(sim);
  if (!last || last.length !== d.length) { last = new Float32Array(d.length).fill(1); written.set(sim, last); }
  const markers = sim.state.markers.filter((m) => m.alive && m.kind === 'avoid' && m.colony === g.colony.id);
  const ng = sim.navGrid;
  const scale = ng.cell / g.cell;
  for (let i = 0; i < d.length; i++) {
    let danger = d[i];
    if (markers.length > 0) {
      const cx = ((i % g.w) + 0.5) * g.cell, cz = (Math.floor(i / g.w) + 0.5) * g.cell;
      for (const m of markers) if (Math.hypot(m.pos.x - cx, m.pos.z - cz) <= m.radius + 0.5 * g.cell) danger = Math.max(danger, DANGER_AVOID_MARKER);
    }
    const cost = danger < DANGER_EPS ? 1 : Math.min(DANGER_COST_MAX, 1 + DANGER_COST_PER * danger);
    if (Math.abs(cost - last[i]) < 0.01) continue;
    last[i] = cost;
    // the danger cell and the nav cell are both 16 BU; map by position in case they ever differ
    const ix = Math.floor(((i % g.w) + 0.5) / scale), iz = Math.floor((Math.floor(i / g.w) + 0.5) / scale);
    if (ix >= 0 && iz >= 0 && ix < ng.w && iz < ng.h) ng.setCostMult(ix, iz, cost);
  }
}
