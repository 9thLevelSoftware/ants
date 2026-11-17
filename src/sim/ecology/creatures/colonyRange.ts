// Colony-range residents (threats-live). GDD 05 §2.7: ant predators occupy territories; GDD 04 §8.2 places them by
// zone density with a small map cap (4 wolf spiders on a 4,000 BU map), so on the generated worlds the nearest
// territory of every hunting predator lay 1,600-3,000 BU from the colony while its ants walk within ~200 BU: no
// predator ever sensed an ant. The director therefore makes sure that each hunting kind with habitat inside the
// colony's foraging ring (COLONY_RANGE_BU around the player's first entrance) has one territory there, and fills the
// kind's capped places nearest the colony first (rebalance: the farthest unseen resident gives way). Caps (I5),
// spawn distances and every strike number are unchanged. Antlions stay worldgen-only (§2.2b).
//
// How many kinds get a colony-range territory follows the Predators setting (COLONY_RANGE_P x Few 0.4 / Normal 1 /
// Many 1.6), one fixed draw per world and kind.
// Determinism: the siting draws from a stream forked from the world seed and the kind (not from rng.creatures), it
// only adds a territory when the ring has none, and it keeps no runtime memo: the director calls it on its hourly
// runs (a persisted cadence), so the running game and a reloaded one take the same decision at the same tick, also
// after a Predators setting change (GDD 06 §14: added threats appear at the new rate without a reload).
//
// Colony-size ramp (ruling R25, threats-calibrate): the siting chance is also multiplied by predationRamp (0 up to the
// preset's lower worker count, 1 at its upper), so a founding-year colony meets only the residents of worldgen's own
// territories. A kind that the ramp no longer draws (the colony shrank) keeps its territory slot (indices are
// creature references) but it is not re-occupied, and its resident leaves SETTING_DESPAWN_GD later (director.ts).
// Colony-range territories are the ones the director added: index >= the world's own territory seeds.

import type { Vec3 } from '@/core/math/vec3';
import type { CreatureKind, CreatureTerritory, Sim } from '@/sim/types';
import { rngFork, rngRange } from '@/core/rng';
import { isWorkerCaste } from '@/sim/colony/census';
import { predationRamp } from '@/sim/balance/difficulty';
import { conditions } from './conditions';
import { colonySources, groundSites, inRing, jumpingSpiderSites, pickSite } from './colonySites';
import { ANT_SPIDER_REGIONS, COLONY_RANGE_P, COLONY_RANGE_RADIUS_MM, COLONY_RANGE_ZONES } from '@/sim/balance/creatures';

/** Kinds the colony-range rule sites, in a fixed order. */
export const COLONY_RANGE_KINDS = Object.keys(COLONY_RANGE_ZONES) as CreatureKind[];

/**
 * The player colony's first entrance (ground point), or null before the hand-over (the founding queen meets the
 * opening's own threats, GDD 06 §5.6) or while the colony has no nest.
 */
export function colonyAnchor(sim: Sim): Vec3 | null {
  const op = sim.state.player.opening;
  if (op && !op.done && op.phase !== 'handover' && op.phase !== 'done') return null;
  const col = sim.state.colonies.find((c) => c.alive && c.isPlayer);
  const nest = col ? sim.state.nests.find((n) => n.alive && n.colony === col.id && n.entrances.length > 0) : undefined;
  return nest ? nest.entrances[0].pos : null;
}

/** Live workers of the player colony (any worker caste). */
export function playerWorkers(sim: Sim): number {
  const col = sim.state.colonies.find((c) => c.alive && c.isPlayer);
  if (!col) return 0;
  let n = 0;
  for (const a of sim.stores.ants.list) if (a.alive && a.colony === col.id && isWorkerCaste(a.caste)) n++;
  return n;
}

/**
 * This world draws a colony-range territory for `kind` now: the fixed draw of the world and kind is below
 * min(1, COLONY_RANGE_P x Predators setting) x the colony-size ramp (R25). `workers` defaults to the live count.
 */
export function colonyRangeDrawn(sim: Sim, kind: CreatureKind, workers = playerWorkers(sim)): boolean {
  const p = Math.min(1, (COLONY_RANGE_P[kind] ?? 0) * conditions(sim).predatorMult) * predationRamp(sim, workers);
  return rngRange(rngFork(sim.state.config.world.seed, `creatures/colony-range/${sim.world.params.archetype}/${kind}/p`), 0, 1) < p;
}

/**
 * A territory the director added for the colony range (flag `colonyRange`). Saves and hand-over snapshots from before
 * the flag hold such territories unflagged: they are recognised by being beyond the world's own territory seeds, of a
 * colony-range kind, with the colony-range radius, inside the kind's ring.
 */
export function isColonyRangeTerritory(sim: Sim, index: number): boolean {
  const t = sim.state.ecology.director.territories[index];
  if (!t) return false;
  if (t.colonyRange !== undefined) return t.colonyRange === 1;
  if (index < sim.world.placements.territories.length || t.radius !== COLONY_RANGE_RADIUS_MM[t.kind]) return false;
  const anchor = colonyAnchor(sim);
  return anchor !== null && inRing(sim, anchor, t.center, t.kind);
}

/**
 * Which kinds the colony range draws now (one worker count for all kinds). A colony-range territory of a kind not in
 * the set is suspended: not occupied, its resident leaves (director.ts rampCull).
 */
export function drawnKinds(sim: Sim): Set<CreatureKind> {
  const w = playerWorkers(sim);
  const out = new Set<CreatureKind>();
  if (conditions(sim).predatorMult <= 0 || !colonyAnchor(sim)) return out;
  for (const k of COLONY_RANGE_KINDS) if (colonyRangeDrawn(sim, k, w)) out.add(k);
  return out;
}

/** Where a colony-range territory of `kind` goes (colonySites.ts), or null when the ring holds no habitat for it. */
export function colonyRangeSite(sim: Sim, anchor: Vec3, kind: CreatureKind): Vec3 | null {
  if (kind === 'ant-spider' && !ANT_SPIDER_REGIONS.includes(sim.world.params.region)) return null;
  const rng = rngFork(sim.state.config.world.seed, `creatures/colony-range/${sim.world.params.archetype}/${kind}`);
  const pick = rngRange(rng, 0, 1);
  const sources = colonySources(sim, anchor);
  if (kind !== 'jumping-spider') return pickSite(sim, anchor, kind, groundSites(sim, anchor, kind, sources, rng), sources, pick);
  // a stem with food on it first (where the colony's ants climb and stop), else any vertical surface
  const js = jumpingSpiderSites(sim, anchor);
  return pickSite(sim, anchor, kind, js.atFood.length > 0 ? js.atFood : js.surfaces, sources, pick);
}

function hasTerritoryInRing(sim: Sim, anchor: Vec3, kind: CreatureKind, terr: readonly CreatureTerritory[]): boolean {
  for (const t of terr) if (t.kind === kind && inRing(sim, anchor, t.center, kind)) return true;
  return false;
}

/**
 * Adds the missing colony-range territories (one per kind drawn at the current Predators setting, with habitat in
 * the ring and none there yet). Returns the number added. Idempotent and a function of the saved state only (no
 * memo), so calling it again, or after a reload, takes the same decision.
 */
export function ensureColonyRangeTerritories(sim: Sim): number {
  const anchor = colonyAnchor(sim);
  if (!anchor) return 0;
  const terr = sim.state.ecology.director.territories;
  const workers = playerWorkers(sim);
  let added = 0;
  for (const kind of COLONY_RANGE_KINDS) {
    if (hasTerritoryInRing(sim, anchor, kind, terr) || !colonyRangeDrawn(sim, kind, workers)) continue;
    const at = colonyRangeSite(sim, anchor, kind);
    if (!at) continue;
    terr.push({ kind, center: at, radius: COLONY_RANGE_RADIUS_MM[kind] ?? 400, occupantId: -1, vacantUntilTick: -1, colonyRange: 1 });
    added++;
  }
  return added;
}

/** Squared horizontal distance of a territory from the colony anchor (Infinity without one). */
export function anchorDist2(anchor: Vec3 | null, p: Vec3): number {
  if (!anchor) return Infinity;
  return (p.x - anchor.x) ** 2 + (p.z - anchor.z) ** 2;
}
