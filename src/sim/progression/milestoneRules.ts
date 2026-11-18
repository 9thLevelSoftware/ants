// Milestone triggers (GDD 06 §8; GDD 03 nest milestones), one row per MILESTONE_IDS entry. Token names follow the
// content table (src/content/text/milestones.ts): {depth_mm} for ms-first-shaft, {zone_from} {zone_to} for
// ms-zone-crossed; every other row has none. Rows that read a counter another module does not emit yet use the
// nearest event that exists (listed in the task report).

import type { MilestoneId, Sim, ZoneType } from '@/sim/types';
import { ZONE_TYPES } from '@/sim/types';
import {
  MS_FOOTFALL_NEAR_BU, MS_HERD_TEND_GD, MS_POSSESSION_S, MS_TRAIL_FOLLOWERS, MS_TRUNK_TRAIL_BU, MS_TRUNK_TRAIL_GD,
  MS_WINTERS, MS_YEARS, PROGRESSION_POLL_EVERY,
} from '@/sim/balance';
import { currentSeason, currentYear, daysPerYear, daysToTicks, secondsToTicks } from '@/sim/time';
import { calendarNow } from '@/sim/environment';
import { zoneAt } from '@/sim/world';
import { colonyAgeDays, engineOf, isPlayerColonyId, memAdd, memGet, memSet, playerColony } from './engine';
import { WORKER_CROSS_KEY } from './discovery';
import {
  antOf, broodIsPlayer, isPlayerAntId, isPlayerWoodSite, playerChambers, playerNests, possessedAnt, type TriggerRule, when,
  WORKER_CASTES, yes,
} from './triggers';

const CP = ['camponotus-pennsylvanicus'] as const;
const MB = ['messor-barbarus'] as const;
const AT = ['atta-texana'] as const;
const POLYMORPHIC = ['camponotus-pennsylvanicus', 'messor-barbarus', 'atta-texana'] as const;

/** Winters the colony has come through (counted by the winter rules below). */
export const WINTERS_KEY = 'winters';

function deliveredKind(sim: Sim, colonyId: number, kind: string, c: number, p: number, kinds: readonly string[]): boolean {
  return isPlayerColonyId(sim, colonyId) && c + p > 0 && kinds.includes(kind);
}

/** Tokens of ms-zone-crossed when `to` is not the nest's zone, else null. */
function zoneCrossing(sim: Sim, to: ZoneType): { zone_from: ZoneType; zone_to: ZoneType } | null {
  const nest = playerNests(sim)[0];
  const from = nest ? zoneAt(sim.world, nest.origin.x, nest.origin.z) : null;
  return from && from !== to ? { zone_from: from, zone_to: to } : null;
}

function shaftTokens(sim: Sim): { depth_mm: number } {
  return { depth_mm: Math.round((sim.state.player.opening?.shaftDepthBu ?? 0) * sim.world.bu) };
}

/**
 * Counts a winter come through, once per winter. `year` is the calendar year in which that winter began (winter is
 * the last season of the year), so the spring turn and the Winter Report of the same winter credit the same year.
 */
export function countWinter(sim: Sim, year: number): void {
  if (memGet(sim, 'winterYear', -1) >= year) return;
  memSet(sim, 'winterYear', year);
  memAdd(sim, WINTERS_KEY, 1);
}

/**
 * The year of the winter that is under way or just ended: the current year while it is winter, else the year
 * before (the Winter Report arrives at doy 1 00:00 of the next year, GDD 06 §6.2).
 */
export function lastWinterYear(sim: Sim): number {
  const y = currentYear(sim.state);
  return currentSeason(sim.state) === 'winter' ? y : y - 1;
}

export function queenAlive(sim: Sim): boolean {
  const col = playerColony(sim);
  const q = col ? antOf(sim, col.queenId) : undefined;
  return !!q && q.alive;
}

export const MILESTONE_RULES: readonly TriggerRule<MilestoneId>[] = [
  {
    id: 'ms-first-shaft',
    on: { 'founding-readiness': (sim, e) => (e.parts.depth >= 1 ? shaftTokens(sim) : null) },
  },
  { id: 'ms-founding-chamber', on: { 'founding-readiness': (_s, e) => when(e.parts.volume >= 1) } },
  {
    id: 'ms-sealed-in',
    on: {
      'founding-sealed': () => yes(),
      'entrance-state-changed': (sim, e) => when(e.status === 'sealed' && playerNests(sim).some((n) => n.entrances.some((x) => x.id === e.entranceId))),
    },
  },
  { id: 'ms-first-eggs', on: { 'egg-laid': (sim, e) => when(isPlayerAntId(sim, e.queenId)) } },
  { id: 'ms-first-larva', on: { 'brood-stage': (sim, e) => when(e.to === 'larva' && broodIsPlayer(sim, e.broodId)) } },
  { id: 'ms-first-pupa', on: { 'brood-stage': (sim, e) => when(e.to === 'pupa' && broodIsPlayer(sim, e.broodId)) } },
  { id: 'ms-first-worker', on: { 'ant-eclosed': (sim, e) => when(WORKER_CASTES.has(e.caste) && isPlayerColonyId(sim, e.colonyId)) } },
  { id: 'ms-nest-reopened', on: { 'founding-reopened': (sim, e) => when(playerNests(sim).some((n) => n.id === e.nestId)) } },
  { id: 'ms-first-food', on: { delivery: (sim, e) => when(isPlayerColonyId(sim, e.colonyId) && e.c + e.p > 0) } },
  { id: 'ms-first-honeydew', on: { delivery: (sim, e) => when(deliveredKind(sim, e.colonyId, e.kind, e.c, e.p, ['honeydew'])) } },
  { id: 'ms-first-prey', on: { delivery: (sim, e) => when(deliveredKind(sim, e.colonyId, e.kind, e.c, e.p, ['prey', 'carrion'])) } },
  {
    // GDD 06 §8: a worker-laid trail followed by MS_TRAIL_FOLLOWERS distinct ants. Nearest emitters: an established
    // trail, or that many distinct recruits to one source.
    id: 'ms-first-trail',
    on: {
      'trail-established': (sim, e) => when(isPlayerColonyId(sim, e.colonyId)),
      recruit: (sim, e) => {
        if (!isPlayerAntId(sim, e.toId)) return null;
        const k = `trailf:${e.sourceId}:${e.toId}`;
        if (memGet(sim, k) > 0) return null;
        memSet(sim, k, 1);
        return when(memAdd(sim, `trailn:${e.sourceId}`, 1) >= MS_TRAIL_FOLLOWERS);
      },
    },
  },
  { id: 'ms-second-chamber', poll: (sim) => when(playerChambers(sim).length >= 2) },
  {
    id: 'ms-nursery',
    poll: (sim) => {
      const nurseries = new Set(playerChambers(sim).filter((c) => c.type === 'nursery').map((c) => c.id));
      if (nurseries.size === 0) return null;
      const col = playerColony(sim)!;
      return when(sim.stores.brood.list.some((b) => b.alive && b.colony === col.id && nurseries.has(b.chamberId)));
    },
  },
  {
    id: 'ms-first-midden',
    on: {
      'corpse-removed': (sim, e) => when(isPlayerAntId(sim, e.antId)),
      'waste-dumped': (sim, e) => when(isPlayerAntId(sim, e.antId)),
    },
  },
  { id: 'ms-second-entrance', poll: (sim) => when(playerNests(sim).reduce((n, x) => n + x.entrances.length, 0) >= 2) },
  { id: 'ms-depth-50', on: { 'nest-milestone': (_s, e) => when(e.kind === 'depth-50') } },
  { id: 'ms-depth-100', on: { 'nest-milestone': (_s, e) => when(e.kind === 'depth-100') } },
  { id: 'ms-chambers-10', on: { 'nest-milestone': (_s, e) => when(e.kind === 'chambers-10') } },
  { id: 'ms-volume-1000', on: { 'nest-milestone': (_s, e) => when(e.kind === 'volume-1000') } },
  {
    id: 'ms-first-aphid-herd',
    poll: (sim) => {
      const col = playerColony(sim);
      if (!col) return null;
      for (const h of sim.stores.herds.list) {
        if (!h.alive || h.tenderColony !== col.id || h.tend <= 0) continue;
        if (memAdd(sim, `herd:${h.id}`, PROGRESSION_POLL_EVERY) >= daysToTicks(MS_HERD_TEND_GD)) return yes();
      }
      return null;
    },
  },
  {
    id: 'ms-first-possession',
    on: { 'possession-started': (sim, e) => { memSet(sim, 'possessStart', sim.state.tick); memSet(sim, 'possessAnt', e.antId); return null; } },
    poll: (sim) => {
      const a = possessedAnt(sim);
      if (!a || memGet(sim, 'possessAnt', -1) !== a.id) return null;
      return when(sim.state.tick - memGet(sim, 'possessStart') >= secondsToTicks(MS_POSSESSION_S));
    },
  },
  {
    id: 'ms-first-trophallaxis',
    on: {
      trophallaxis: (sim, e) => {
        const p = sim.state.player.possessedAntId;
        return when(p >= 0 && !e.ambient && (e.donorId === p || e.receiverId === p));
      },
      'action-completed': (sim, e) => when(
        e.antId === sim.state.player.possessedAntId && (e.action === 'trophallaxis-give' || e.action === 'trophallaxis-receive'),
      ),
    },
  },
  {
    // "a worker first enters a zone type other than the nest zone": the event path when the colony's first entry is
    // a worker's; the poll path (discovery.ts memory) when the queen or a male entered that zone first.
    id: 'ms-zone-crossed',
    on: {
      'world.zone-first-entry': (sim, e) => {
        const a = antOf(sim, e.antId);
        return a && isPlayerAntId(sim, e.antId) && WORKER_CASTES.has(a.caste) ? zoneCrossing(sim, e.zoneType) : null;
      },
    },
    poll: (sim) => {
      const to = memGet(sim, WORKER_CROSS_KEY);
      return to > 0 ? zoneCrossing(sim, ZONE_TYPES[to - 1]) : null;
    },
  },
  { id: 'ms-micro-connection', on: { 'world.micro-discovered': (sim, e) => when(isPlayerAntId(sim, e.antId)) } },
  { id: 'ms-workers-25', poll: (_s, c) => when(c.census.workers >= 25) },
  { id: 'ms-workers-100', poll: (_s, c) => when(c.census.workers >= 100) },
  { id: 'ms-workers-500', poll: (_s, c) => when(c.census.workers >= 500) },
  { id: 'ms-workers-1000', poll: (_s, c) => when(c.census.workers >= 1000) },
  { id: 'ms-stage-growing', on: { 'stage.changed': (_s, e) => when(e.to === 'growing') } },
  { id: 'ms-stage-mature', on: { 'stage.changed': (_s, e) => when(e.to === 'mature') } },
  {
    id: 'ms-first-rain',
    poll: (sim, c) => {
      const w = sim.state.env.weather;
      return when(w.state === 'rain' && (w.intensityClass === 'shower' || w.intensityClass === 'downpour') && c.census.outside >= 1);
    },
  },
  {
    id: 'ms-first-flood-rescue',
    on: {
      'nest-milestone': (_s, e) => when(e.kind === 'survived-flood'),
      'brood-moved': (sim, e) => when(e.reason === 'flood' && broodIsPlayer(sim, e.broodId)),
    },
  },
  { id: 'ms-first-heat-wave', on: { 'weather.changed': (sim, e) => when(e.from === 'heat' && e.to !== 'heat' && queenAlive(sim)) } },
  { id: 'ms-first-frost', on: { 'weather.changed': (_s, e) => when(e.to === 'frost') } },
  { id: 'ms-first-storm', on: { 'weather.changed': (sim, e) => when(e.from === 'storm' && e.to !== 'storm' && queenAlive(sim)) } },
  {
    id: 'ms-first-footfall',
    on: {
      'human.impact': (sim, e) => {
        if (e.kind !== 'footsteps') return null;
        const col = playerColony(sim);
        if (!col) return null;
        const r = MS_FOOTFALL_NEAR_BU * sim.world.bu;
        return when(sim.stores.ants.list.some((a) => a.alive && a.colony === col.id
          && Math.hypot(a.pos.x - e.footprint.x, a.pos.z - e.footprint.z) <= r));
      },
    },
  },
  {
    id: 'ms-first-fight',
    on: {
      'combat-hit': (sim, e) => when(isPlayerAntId(sim, e.attackerId) || isPlayerAntId(sim, e.targetId)),
      'combat-lock': (sim, e) => when(isPlayerAntId(sim, e.holderId) || isPlayerAntId(sim, e.targetId)),
    },
  },
  {
    id: 'ms-first-rival-defeated',
    on: {
      'rival-destroyed': (sim, e) => when(!isPlayerColonyId(sim, e.colonyId)),
      'rival-raid-ended': (sim, e) => when(isPlayerColonyId(sim, e.target) && e.loot <= 0),
    },
  },
  {
    // winters are counted by the event watcher (events.ts) so the count keeps going after this row fired
    id: 'ms-first-winter-survived',
    poll: (sim) => when(memGet(sim, WINTERS_KEY) >= 1),
  },
  { id: 'ms-winter-3', poll: (sim) => when(memGet(sim, WINTERS_KEY) >= MS_WINTERS[0]) },
  { id: 'ms-winter-10', poll: (sim) => when(memGet(sim, WINTERS_KEY) >= MS_WINTERS[1]) },
  { id: 'ms-year-1', poll: (sim) => when(colonyAgeDays(sim) >= MS_YEARS[0] * daysPerYear(sim.state.config)) },
  { id: 'ms-year-5', poll: (sim) => when(colonyAgeDays(sim) >= MS_YEARS[1] * daysPerYear(sim.state.config)) },
  { id: 'ms-first-alate', on: { 'ant-eclosed': (sim, e) => when((e.caste === 'gyne' || e.caste === 'male') && isPlayerColonyId(sim, e.colonyId)) } },
  // flight.* and lineage.* events concern the player colony only (GDD 06 §11 FlightRecord / Lineage): no colony check
  { id: 'ms-first-flight', on: { 'flight.launched': () => yes() } },
  {
    id: 'ms-first-daughter',
    on: { 'lineage.daughter-added': () => yes(), 'flight.ended': (_s, e) => when(e.nFounded >= 1) },
  },
  { id: 'ms-flight-flown', on: { 'flight.possessed-end': () => yes() } },
  {
    id: 'ms-queen-lost',
    on: {
      'queen.died': (sim, e) => when(isPlayerColonyId(sim, e.colonyId)),
      'colony.orphaned': (sim, e) => when(isPlayerColonyId(sim, e.colonyId)),
      'ant-died': (sim, e) => when(e.caste === 'queen' && isPlayerColonyId(sim, e.colonyId)),
    },
  },
  // "first wood chamber excavated; frass pile exists": the first ejection from one of the colony's wood sites (a pile
  // grows only from ejections, and `frass-pile-grew` names no site that could be checked against the colony)
  { id: 'ms-first-gallery', species: CP, on: { 'frass-ejected': (sim, e) => when(isPlayerWoodSite(sim, e.siteId)) } },
  { id: 'ms-satellite-nest', species: CP, on: { 'brood-shuttled': (sim, e) => when(broodIsPlayer(sim, e.broodId)) } },
  {
    id: 'ms-night-trail', species: CP,
    on: {
      'trail-established': (sim, e) => {
        const phase = calendarNow(sim).phase;
        return when(isPlayerColonyId(sim, e.colonyId) && (phase === 'dusk' || phase === 'night' || phase === 'dawn'));
      },
    },
  },
  { id: 'ms-first-seed', species: MB, on: { delivery: (sim, e) => when(deliveredKind(sim, e.colonyId, e.kind, e.c, e.p, ['seed'])) } },
  { id: 'ms-first-granary', species: MB, on: { 'granary-state': () => yes() } },
  {
    id: 'ms-trunk-trail', species: MB,
    on: {
      'trail-established': (sim, e) => {
        if (isPlayerColonyId(sim, e.colonyId)) engineOf(sim).trails[String(e.sourceId)] = [sim.state.tick, e.lengthBu];
        return null;
      },
      'trail-lost': (sim, e) => { delete engineOf(sim).trails[String(e.sourceId)]; return null; },
    },
    poll: (sim) => when(Object.values(engineOf(sim).trails).some(([t, len]) =>
      len >= MS_TRUNK_TRAIL_BU && sim.state.tick - t >= daysToTicks(MS_TRUNK_TRAIL_GD))),
  },
  {
    id: 'ms-fungus-planted', species: AT,
    on: { 'action-completed': (_s, e) => when(e.action === 'plant') },
    poll: (sim) => when(!!sim.state.player.opening?.garden?.planted),
  },
  { id: 'ms-first-leaf', species: AT, on: { delivery: (sim, e) => when(deliveredKind(sim, e.colonyId, e.kind, e.c, e.p, ['leaf'])) } },
  { id: 'ms-garden-chamber', species: AT, poll: (sim) => when(playerChambers(sim).filter((c) => c.type === 'fungus').length >= 2) },
  { id: 'ms-first-major', species: POLYMORPHIC, on: { 'ant-eclosed': (sim, e) => when(e.caste === 'major' && isPlayerColonyId(sim, e.colonyId)) } },
];
