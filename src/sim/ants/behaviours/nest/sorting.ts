// Brood sorting by microclimate (GDD 02 §10.4.1): every brood-capable chamber is scored for each brood group
// (0 eggs + young larvae, 1 older larvae, 2 pupae); an item whose best chamber beats its current one by the
// trigger margin gets a `move` job. A `move-brood` marker (GDD 02 §12.2) overrides sorting for its source chamber
// for MOVE_BROOD_LOCK_GD. Scores are recomputed from the current state whenever the nursery board is rebuilt.

import type { Brood, Chamber, Marker, Nest, Sim, SpeciesDef } from '@/sim/types';
import { BROOD_SPACE } from '@/sim/balance/nest';
import {
  SORT_CROWD_SPAN, SORT_CROWD_START, SORT_FLOOD_WEIGHT, SORT_HUM_EGG_LARVA, SORT_HUM_PUPA,
  SORT_NURSERY_BONUS, SORT_R_MAX, SORT_ROYAL_DIST_PER_BU, SORT_ROYAL_EGG_BONUS, SORT_TRIGGER_ADD, SORT_TRIGGER_MULT,
  SORT_WASTE_FULL, SORT_YOUNG_LARVA_PROGRESS,
} from '@/sim/balance/nestwork';
import { MOVE_BROOD_LOCK_GD } from '@/sim/balance/colony';
import { devRate } from '@/sim/colony';
import { daysToTicks } from '@/sim/time';
import { royalChamber } from './places';

/** Chamber types that may hold brood (GDD 02 §10.4.1). */
const BROOD_TYPES: readonly string[] = ['nursery', 'royal', 'founding', 'general', 'rest'];

export const GROUPS = 3;

/** Sorting group of a brood item: 0 eggs and young larvae, 1 older larvae, 2 pupae. */
export function groupOf(b: Brood): number {
  if (b.stage === 'pupa') return 2;
  if (b.stage === 'larva' && b.progress >= SORT_YOUNG_LARVA_PROGRESS) return 1;
  return 0;
}

function curve(points: readonly (readonly [number, number])[], x: number): number {
  if (x <= points[0][0]) return points[0][1];
  for (let n = 1; n < points.length; n++) {
    const [x1, y1] = points[n];
    if (x <= x1) {
      const [x0, y0] = points[n - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return points[points.length - 1][1];
}

/** Per-nest sorting context: chamber scores per group and the best chamber per group. */
export interface SortContext {
  chambers: Chamber[];
  /** scores[g][i] for chambers[i]. */
  scores: number[][];
  /** Index into chambers of the best chamber per group, -1 none. */
  best: number[];
  /** Live move-brood marker of the colony for this nest, or null. */
  marker: Marker | null;
}

function avoided(sim: Sim, colonyId: number, c: Chamber): boolean {
  for (const m of sim.stores.markers.list) {
    if (!m.alive || m.kind !== 'avoid' || m.colony !== colonyId) continue;
    if (Math.hypot(m.pos.x - c.center.x, m.pos.y - c.center.y, m.pos.z - c.center.z) <= m.radius) return true;
  }
  return false;
}

/** The colony's live move-brood marker whose target chamber is in this nest, inside its lock time. */
function moveMarker(sim: Sim, colonyId: number, nest: Nest): Marker | null {
  const lock = daysToTicks(MOVE_BROOD_LOCK_GD);
  for (const m of sim.stores.markers.list) {
    if (!m.alive || m.kind !== 'move-brood' || m.colony !== colonyId) continue;
    if (sim.state.tick - m.placedTick > lock) continue;
    const t = nest.chambers.find((c) => c.id === m.targetChamberId);
    if (t && BROOD_TYPES.includes(t.type)) return m;
  }
  return null;
}

/**
 * Score of a chamber for a group (GDD 02 §10.4.1): r(T)/1.818 x hum x (1 - crowd) x (1 - 0.8 floodRisk) x hygiene
 * + nursery bonus + royal egg bonus - 0.002 per BU of nest path to the royal chamber. `space` = brood space in
 * the chamber including incoming moves.
 */
export function chamberScore(def: SpeciesDef, c: Chamber, group: number, space: number, royalDistBu: number): number {
  if (!BROOD_TYPES.includes(c.type)) return 0;
  const rT = Math.min(1, devRate(def, c.temp) / SORT_R_MAX);
  const hum = curve(group === 2 ? SORT_HUM_PUPA : SORT_HUM_EGG_LARVA, c.humidity);
  const cap = c.capacity.brood;
  const crowd = cap > 0 ? Math.min(1, Math.max(0, (space / cap - SORT_CROWD_START) / SORT_CROWD_SPAN)) : 1;
  const flood = 1 - SORT_FLOOD_WEIGHT * Math.min(1, Math.max(c.floodRisk, c.flooded));
  const hygiene = 1 - Math.min(1, c.occupancy.other / SORT_WASTE_FULL);
  let s = rT * hum * (1 - crowd) * flood * hygiene;
  if (c.type === 'nursery') s += SORT_NURSERY_BONUS;
  if (c.type === 'royal' && group === 0) s += SORT_ROYAL_EGG_BONUS;
  return s - SORT_ROYAL_DIST_PER_BU * royalDistBu;
}

/** Scores every chamber of the nest. `space(chamberId)` gives the brood space there plus incoming moves. */
export function sortContext(sim: Sim, nest: Nest, def: SpeciesDef, space: (chamberId: number) => number): SortContext {
  const chambers = nest.chambers;
  const royal = royalChamber(nest);
  const bu = sim.world.bu;
  const scores: number[][] = [];
  const best: number[] = [];
  const royalDist = chambers.map((c) => {
    if (!royal || c.id === royal.id) return 0;
    const d = sim.nestNav.distance(nest.id, { kind: 'chamber', id: royal.id }, c.center);
    return d >= 0 ? d / bu : Math.hypot(c.center.x - royal.center.x, c.center.y - royal.center.y, c.center.z - royal.center.z) / bu;
  });
  const off = chambers.map((c) => avoided(sim, nest.colony, c));
  for (let g = 0; g < GROUPS; g++) {
    const row: number[] = [];
    let bi = -1;
    for (let i = 0; i < chambers.length; i++) {
      const s = off[i] ? 0 : chamberScore(def, chambers[i], g, space(chambers[i].id), royalDist[i]);
      row.push(s);
      if (s > 0 && (bi < 0 || s > row[bi])) bi = i;
    }
    scores.push(row);
    best.push(bi);
  }
  return { chambers, scores, best, marker: moveMarker(sim, nest.colony, nest) };
}

/** Score of the chamber with this id in the context (0 when not a chamber of the nest). */
export function scoreOf(ctx: SortContext, group: number, chamberId: number): number {
  const i = ctx.chambers.findIndex((c) => c.id === chamberId);
  return i >= 0 ? ctx.scores[group][i] : 0;
}

/** Best chamber id for the group, -1 none. */
export function bestChamberId(ctx: SortContext, group: number): number {
  const i = ctx.best[group];
  return i >= 0 ? ctx.chambers[i].id : -1;
}

/**
 * Where a lying brood item should go, or -1 to stay: the move-brood marker's target for items in its source,
 * else the best chamber when it beats the current one by the trigger margin (best > cur x 1.15 + 0.05).
 * `marker` is set to true when the marker decides.
 */
export function moveTarget(ctx: SortContext, b: Brood, out: { marker: boolean }): number {
  out.marker = false;
  const m = ctx.marker;
  if (m) {
    if (b.chamberId === m.targetChamberId) return -1; // locked in the target
    if (m.sourceChamberId < 0 || b.chamberId === m.sourceChamberId) { out.marker = true; return m.targetChamberId; }
  }
  const g = groupOf(b);
  const best = bestChamberId(ctx, g);
  if (best < 0 || best === b.chamberId) return -1;
  const cur = scoreOf(ctx, g, b.chamberId);
  return ctx.scores[g][ctx.best[g]] > cur * SORT_TRIGGER_MULT + SORT_TRIGGER_ADD ? best : -1;
}

/** Brood space of a brood item (GDD 03 §6.4 occupancy units). */
export function broodSpace(b: Brood): number {
  return BROOD_SPACE[b.stage];
}
