// Territory from home-range marking (GDD 05 §3.5): per-colony marks on a 16 BU grid (slot 0 = player). Ants on
// the surface deposit 1 per s; rival nests add a core deposit standing for unsimulated traffic; marks halve in
// 2 gd and once per rain event. Hourly scan: claimed cells per colony, contested cells per pair (war fronts).

import type { Vec3 } from '@/core/math/vec3';
import type { Sim, TerritoryGrid } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { TERR_CLAIM_MIN, TERR_CLAIM_RATIO } from '@/sim/balance/combat';
import {
  CORE_DEPOSIT, CORE_MIN_N, TERR_DEPOSIT, TERR_DEPOSIT_EVERY_TICKS, TERR_HALF_LIFE_GD, WAR_FRONT_CELLS,
} from '@/sim/balance/rivals';
import { SECONDS_PER_DAY, TICKS_PER_SECOND } from '@/sim/time';
import { coreRadiusBu, ensureTerritory } from './init';
import { cellAt } from './claims';
export { cellAt, cellCentre, claimAt, marksAt, type CellClaim } from './claims';
import { colExt, relExt, rivalColonies, rmod, slotOf } from './state';
import { ensureRelation } from './relations';
import { homeNest } from './setup';

/** Every TERR_DEPOSIT_EVERY_TICKS: each ant on the surface marks its cell for its colony. */
export function depositMarks(sim: Sim): void {
  const t = sim.state.rivals.territory;
  ensureTerritory(sim.state);
  const amount = TERR_DEPOSIT * (TERR_DEPOSIT_EVERY_TICKS / TICKS_PER_SECOND);
  let lastColony = -2, slot = -1;
  const list = sim.stores.ants.list;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!a.alive || a.nestId >= 0 || a.medium !== 'surface' || (a.flags & AntFlag.DORMANT) !== 0) continue;
    if (a.colony !== lastColony) { lastColony = a.colony; slot = t.slotColony.indexOf(a.colony); }
    if (slot < 0) continue;
    const c = cellAt(t, a.pos.x, a.pos.z);
    if (c >= 0) t.marks[c * t.slots + slot] += amount;
  }
}

/** Hourly: decay (half-life 2 gd), the core deposit of active rival nests, and the rain-event halving. */
export function hourlyMarks(sim: Sim, dtGd: number, activity: (colonyId: number) => number, raining: boolean): void {
  const t = sim.state.rivals.territory;
  ensureTerritory(sim.state);
  const m = rmod(sim.state);
  let k = Math.pow(0.5, dtGd / TERR_HALF_LIFE_GD);
  if (raining && m.wasRaining === 0) k *= 0.5; // a rain event halves exposed marks once (cover not modelled)
  m.wasRaining = raining ? 1 : 0;
  const marks = t.marks;
  for (let i = 0; i < marks.length; i++) if (marks[i] !== 0) marks[i] = marks[i] * k < 1e-3 ? 0 : marks[i] * k;
  const add = CORE_DEPOSIT * dtGd * SECONDS_PER_DAY; // per game second, over dtGd of game time
  for (const col of rivalColonies(sim)) {
    const a = activity(col.id);
    if (col.rival.n < CORE_MIN_N || a <= 0) continue;
    const s = slotOf(sim.state, col.id), nest = homeNest(sim, col);
    if (s < 0 || !nest) continue;
    const r = coreRadiusBu(col.rival.n) * sim.world.bu;
    for (const e of nest.entrances) addDisc(t, s, e.pos.x, e.pos.z, r, add * a);
  }
}

function addDisc(t: TerritoryGrid, slot: number, x: number, z: number, r: number, v: number): void {
  const c0x = Math.max(0, Math.floor((x - r) / t.cell)), c1x = Math.min(t.w - 1, Math.floor((x + r) / t.cell));
  const c0z = Math.max(0, Math.floor((z - r) / t.cell)), c1z = Math.min(t.h - 1, Math.floor((z + r) / t.cell));
  for (let cz = c0z; cz <= c1z; cz++) {
    for (let cx = c0x; cx <= c1x; cx++) {
      const dx = (cx + 0.5) * t.cell - x, dz = (cz + 0.5) * t.cell - z;
      if (dx * dx + dz * dz <= r * r) t.marks[(cz * t.w + cx) * t.slots + slot] += v;
    }
  }
}

/** Result of the hourly scan: claimed cells per slot and contested cells per slot pair. */
export interface TerritoryScan {
  claimed: number[];
  contested: Map<number, number[]>;
}

const pairKey = (s1: number, s2: number): number => (s1 < s2 ? s1 * 16 + s2 : s2 * 16 + s1);

/**
 * Hourly scan: claimed cells per colony (into the colony records, K_eff), contested cells per colony pair (into
 * the relation records: count and the front cells nearest both nests).
 */
export function scanTerritory(sim: Sim): TerritoryScan {
  const t = sim.state.rivals.territory;
  ensureTerritory(sim.state);
  const claimed = new Array<number>(t.slots).fill(0);
  const contested = new Map<number, number[]>();
  const n = t.w * t.h, S = t.slots, marks = t.marks;
  for (let c = 0; c < n; c++) {
    const base = c * S;
    let b1 = -1, v1 = 0, b2 = -1, v2 = 0;
    for (let s = 0; s < S; s++) {
      const v = marks[base + s];
      if (v > v1) { b2 = b1; v2 = v1; b1 = s; v1 = v; } else if (v > v2) { b2 = s; v2 = v; }
    }
    if (v1 < TERR_CLAIM_MIN) continue;
    if (v2 >= TERR_CLAIM_MIN && v1 < TERR_CLAIM_RATIO * v2) {
      const k = pairKey(b1, b2);
      let l = contested.get(k);
      if (!l) { l = []; contested.set(k, l); }
      l.push(c);
    } else claimed[b1]++;
  }
  for (let s = 0; s < S; s++) {
    const id = t.slotColony[s];
    if (id >= 0 && sim.stores.colonies.get(id)?.rival) colExt(sim.state, id).claimedCells = claimed[s];
  }
  // contested cells per pair of living colonies: count, and the front (nearest both nests first)
  for (const r of sim.state.rivals.relations) {
    const sa = slotOf(sim.state, r.a), sb = slotOf(sim.state, r.b);
    const ext = relExt(sim.state, r.a, r.b);
    const cells = sa >= 0 && sb >= 0 ? contested.get(pairKey(sa, sb)) ?? [] : [];
    ext.contested = cells.length;
    r.warFront = frontCells(sim, r.a, r.b, cells);
  }
  // pairs with contested cells but no record yet meet here
  for (const [k, cells] of contested) {
    const a = t.slotColony[Math.floor(k / 16)], b = t.slotColony[k % 16];
    if (a < 0 || b < 0 || !sim.stores.colonies.get(a) || !sim.stores.colonies.get(b)) continue;
    const r = ensureRelation(sim.state, a, b);
    if (r.warFront.length === 0) {
      relExt(sim.state, a, b).contested = cells.length;
      r.warFront = frontCells(sim, a, b, cells);
    }
  }
  return { claimed, contested };
}

function nestPoint(sim: Sim, colonyId: number): Vec3 | null {
  const col = sim.stores.colonies.get(colonyId);
  const n = col ? homeNest(sim, col) : undefined;
  return n ? n.entrances[0]?.pos ?? n.origin : null;
}

function frontCells(sim: Sim, a: number, b: number, cells: number[]): number[] {
  if (cells.length === 0) return [];
  const pa = nestPoint(sim, a), pb = nestPoint(sim, b);
  if (!pa || !pb) return cells.slice(0, WAR_FRONT_CELLS);
  const t = sim.state.rivals.territory;
  const score = (c: number): number => {
    const x = ((c % t.w) + 0.5) * t.cell, z = (Math.floor(c / t.w) + 0.5) * t.cell;
    return Math.hypot(x - pa.x, z - pa.z) + Math.hypot(x - pb.x, z - pb.z);
  };
  return cells.map((c) => ({ c, s: score(c) })).sort((x, y) => x.s - y.s || x.c - y.c).slice(0, WAR_FRONT_CELLS).map((x) => x.c);
}
