// Which source a departing forager goes to (GDD 02 §5.5 rule 2, §6.7) and the memory of sources found empty
// (§9.3). An ant chooses among the sources it knows: its route slots, its recruitment lead, and the entrance
// news; nothing else. U = (C_s wC + P_s wP) x q x fCrowd / tripTime, with the colony's nutrient weights (D7).

import type { Ant, FoodSource, Sim } from '@/sim/types';
import { LEAD_VALID_S } from '@/sim/balance';
import {
  CHOICE_COLLECT_S, CHOICE_MIN_TRIP_S, DEPLETED_GD, FORAGE_MARKER_SCORE_MULT,
} from '@/sim/balance/foraging';
import { sourceWeight } from '@/sim/colony';
import { harvestForm, slotUsers, sourceQuality } from '@/sim/ecology';
import { casteSpeeds } from '@/sim/locomotion';
import { daysToTicks, secondsToTicks } from '@/sim/time';
import { distFromHome } from './common';

/** Nutrients one trip brings from the source, loads (a crop, one unit, or one torn piece). */
export function tripNutrients(sim: Sim, ant: Ant, s: FoodSource): { c: number; p: number } {
  const form = harvestForm(sim, s);
  const k = form === 'liquid' ? ant.cropCap : form === 'tear' ? Math.min(1, ant.carryCap / Math.max(s.unitBulk, 1e-6)) : 1;
  return { c: s.c * k, p: s.p * k };
}

/** Whether the ant remembers the source as found empty (GDD 02 §9.3 depleted entries). */
export function isDepletedFor(sim: Sim, ant: Ant, sourceId: number): boolean {
  const now = sim.state.tick;
  for (const d of ant.mem.depleted) if (d.sourceId === sourceId && d.untilTick > now) return true;
  return false;
}

/**
 * The ant found the source empty: a depleted entry for DEPLETED_GD; found empty twice in a row, its route slot
 * for that source is cleared as well. Returns true on the second find.
 */
export function markDepleted(sim: Sim, ant: Ant, sourceId: number): boolean {
  if (sourceId < 0) return false;
  const now = sim.state.tick;
  const twice = isDepletedFor(sim, ant, sourceId);
  if (twice) {
    for (const r of ant.mem.routes) if (r.sourceId === sourceId) { r.sourceId = -1; r.n = 0; r.visits = 0; }
  }
  const list = ant.mem.depleted;
  if (list.length === 0) return twice;
  let slot = list.findIndex((d) => d.sourceId === sourceId);
  if (slot < 0) {
    slot = 0;
    for (let i = 1; i < list.length; i++) if (list[i].untilTick < list[slot].untilTick) slot = i;
  }
  list[slot] = { sourceId, untilTick: now + daysToTicks(DEPLETED_GD) };
  if (ant.mem.lead.sourceId === sourceId) ant.mem.lead = { sourceId: -1, pos: { x: 0, y: 0, z: 0 }, tick: -1 };
  return twice;
}

/** Whether the lead is still valid (GDD 02 §6.7 LEAD_VALID_S). */
export function leadValid(sim: Sim, ant: Ant): boolean {
  const l = ant.mem.lead;
  return l.sourceId >= 0 && sim.state.tick - l.tick <= secondsToTicks(LEAD_VALID_S);
}

function inForageMarker(sim: Sim, ant: Ant, s: FoodSource): boolean {
  for (const m of sim.stores.markers.list) {
    if (m.alive && m.kind === 'forage' && m.colony === ant.colony && Math.hypot(s.pos.x - m.pos.x, s.pos.z - m.pos.z) <= m.radius) return true;
  }
  return false;
}

/** Score U of a known source for this ant (0 = do not go). */
export function sourceScore(sim: Sim, ant: Ant, s: FoodSource): number {
  const col = sim.stores.colonies.get(ant.colony);
  if (!col || isDepletedFor(sim, ant, s.id)) return 0;
  const q = sourceQuality(sim, ant.colony, s.id); // 0 inside an avoid marker, exhausted or unavailable
  if (q <= 0) return 0;
  const n = tripNutrients(sim, ant, s);
  const w = sourceWeight(col, n.c, n.p);
  const slots = Math.max(1, s.slots);
  const crowd = Math.max(0.05, 1 - slotUsers(sim, s).length / slots);
  const speed = Math.max(1e-3, casteSpeeds(col.species, ant.caste, sim.world.bu).cruise);
  const trip = Math.max(CHOICE_MIN_TRIP_S, (2 * distFromHome(sim, ant, s.pos)) / speed + CHOICE_COLLECT_S);
  const marker = inForageMarker(sim, ant, s) ? FORAGE_MARKER_SCORE_MULT : 1;
  return (w * q * crowd * marker) / trip;
}

/** Candidate source ids the ant knows: lead (if valid), route slots, entrance news. No duplicates. */
export function knownSources(sim: Sim, ant: Ant, out: number[]): number[] {
  out.length = 0;
  const add = (id: number) => { if (id >= 0 && !out.includes(id)) out.push(id); };
  if (leadValid(sim, ant)) add(ant.mem.lead.sourceId);
  for (const r of ant.mem.routes) add(r.sourceId);
  const col = sim.stores.colonies.get(ant.colony);
  if (col) for (const n of col.news) add(n.sourceId);
  return out;
}

const cand: number[] = [];

/**
 * Best known source by U (ties broken by id, which keeps the choice deterministic), optionally restricted by a
 * filter and excluding one id; -1 when none scores above 0. A valid lead wins outright (the recruit follows it).
 */
export function chooseSource(sim: Sim, ant: Ant, accept?: (s: FoodSource) => boolean, exclude = -1): number {
  if (leadValid(sim, ant)) {
    const s = sim.stores.sources.get(ant.mem.lead.sourceId);
    if (s && s.id !== exclude && (!accept || accept(s)) && sourceScore(sim, ant, s) > 0) return s.id;
  }
  knownSources(sim, ant, cand);
  let best = -1, bestU = 0;
  for (const id of cand) {
    if (id === exclude) continue;
    const s = sim.stores.sources.get(id);
    if (!s || (accept && !accept(s))) continue;
    const u = sourceScore(sim, ant, s);
    if (u > bestU || (u === bestU && u > 0 && id < best)) { best = id; bestU = u; }
  }
  return best;
}

/** Best known source within radiusMm of a point (queue fallback, GDD 02 §10.2: next-best within 100 BU). */
export function chooseNear(sim: Sim, ant: Ant, p: { x: number; z: number }, radiusMm: number, exclude: number): number {
  return chooseSource(sim, ant, (s) => Math.hypot(s.pos.x - p.x, s.pos.z - p.z) <= radiusMm, exclude);
}

/** A source this ant would work now: available, worth something to its colony, not remembered empty, accepted. */
export function usableFor(sim: Sim, ant: Ant, sourceId: number, accept?: (s: FoodSource) => boolean): boolean {
  const s = sourceId >= 0 ? sim.stores.sources.get(sourceId) : undefined;
  if (!s || isDepletedFor(sim, ant, s.id) || (accept && !accept(s))) return false;
  return sourceQuality(sim, ant.colony, s.id) > 0;
}
