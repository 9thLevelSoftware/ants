// Creature director (GDD 05 §2.7), every CREATURE_DIRECTOR_EVERY (50) ticks: residents occupy their worldgen
// territories (re-occupied after the kind's respawn delay), visitors come out of theirs while active (night, rain),
// spawn rules for prey and fruit flies, hourly aphid-predator arrivals, patch regrowth and bird rolls, despawning
// (over target and far from the focus, lifetime ended, stuck while unseen), the global cap of 260 (cull order
// neutral -> prey -> aphid predators; never ant predators), winter, the danger grid and expired hazards.

import type { Vec3 } from '@/core/math/vec3';
import type { Creature, CreatureKind, Sim } from '@/sim/types';
import { despawnCreature } from '@/sim/entities';
import { rngFloat } from '@/core/rng';
import {
  AMBIENT_BIRD_P, AMBIENT_CRICKET_P, CREATURE_AGENT_CAP, CREATURE_STATS, DESPAWN_MIN_DIST_BU, DIRECTOR_HOURLY_TICKS,
  RESIDENT_HOME_RADIUS_MM, RESIDENT_KINDS, SPAWN_MIN_DIST_ANT_BU, SPAWN_MIN_DIST_FOCUS_BU,
  STUCK_DESPAWN_S, VISITOR_KINDS, BURROW_S, VISITOR_SPAWN_P, WOLF_HOME_RADIUS_MM, WOODLOUSE_ROLLERS, type CreatureFamily,
} from '@/sim/balance/creatures';
import { CREATURE_DIRECTOR_EVERY } from '@/sim/balance';
import { TICKS_PER_SECOND } from '@/sim/time';
import { chance, cue, dist, inStateS, rng, setState, stop } from './common';
import { conditions, nightActive, type Conditions } from './conditions';
import { capOf } from './caps';
import { spawnKind } from './spawn';
import { aphidPredatorArrivals, countKind, trackAphids } from './aphidPredators';
import {
  initPits, initPreyPatches, regrowPatches, spawnCaterpillars, spawnFlyLarvae, spawnFruitFlies, spawnPatchPrey,
  strandWorms,
} from './spawners';
import { birdHourly } from './bird';
import { updateDanger } from './danger';
import { expireHazards } from './neutral';
import { abandonOrphanPits, reconcileInvasion } from './lifecycle';
import { nestAttackedAlerts, predatorNearAlerts } from './alerts';

const RUN_S = CREATURE_DIRECTOR_EVERY / TICKS_PER_SECOND;

/** Where the player looks: the possessed ant, else the player's first entrance (no camera state in the sim). */
export function focusPoints(sim: Sim, out: Vec3[]): Vec3[] {
  out.length = 0;
  const pa = sim.stores.ants.get(sim.state.player.possessedAntId);
  if (pa) out.push(pa.pos);
  const col = sim.state.colonies.find((c) => c.alive && c.isPlayer);
  const nest = col ? sim.state.nests.find((n) => n.alive && n.colony === col.id) : undefined;
  if (nest && nest.entrances.length > 0) out.push(nest.entrances[0].pos);
  return out;
}

const _focus: Vec3[] = [];
const _ids: number[] = [];

/** §2.7 spawn distance: >= 40 BU from the focus, >= 20 BU from any ant. */
export function spawnPointOk(sim: Sim, p: Vec3): boolean {
  const bu = sim.world.bu;
  for (const f of focusPoints(sim, _focus)) if (dist(f, p) < SPAWN_MIN_DIST_FOCUS_BU * bu) return false;
  sim.index.queryAnts(p, SPAWN_MIN_DIST_ANT_BU * bu, _ids);
  for (const id of _ids) { const a = sim.stores.ants.get(id); if (a && dist(a.pos, p) < SPAWN_MIN_DIST_ANT_BU * bu) return false; }
  return true;
}

function farFromFocus(sim: Sim, p: Vec3): boolean {
  for (const f of focusPoints(sim, _focus)) if (dist(f, p) < DESPAWN_MIN_DIST_BU * sim.world.bu) return false;
  return true;
}

/** Seized, fighting, held by ants, invading or in a strike: never despawned by the director. */
export function isEngaged(sim: Sim, c: Creature): boolean {
  if (c.seizedAntId >= 0 || c.state === 'windup' || c.state === 'hold' || c.state === 'invade' || c.state === 'carry' || c.state === 'drag') return true;
  sim.index.queryAnts(c.pos, c.radius + 4 * sim.world.bu, _ids);
  for (const id of _ids) {
    const l = sim.stores.ants.get(id)?.combat?.lock;
    if (l && l.targetKind === 'creature' && l.targetId === c.id) return true;
  }
  return false;
}

/** Is the kind out and about now (residents always; visitors at night or in rain). */
function visitorActive(kind: CreatureKind, cond: Conditions): boolean {
  if (cond.winter) return false;
  if (kind === 'earthworm' || kind === 'snail') return cond.dark || cond.raining;
  return nightActive(cond);
}

/**
 * §2.2b: centipedes and rove beetles burrow (despawn) at dawn unless engaged - near the focus too (they would
 * otherwise hunt all day where the colony lives). Far from the focus they are simply gone; near it they first
 * slip under the litter for BURROW_S (state 'burrow', no hunting) so the player sees them leave.
 */
function burrowAtDawn(sim: Sim, c: Creature): void {
  if (farFromFocus(sim, c.pos) || (c.state === 'burrow' && inStateS(sim, c) >= BURROW_S)) { despawnCreature(sim, c.id, 'burrowed'); return; }
  if (c.state === 'burrow') return;
  stop(sim, c);
  setState(sim, c, 'burrow');
}

function homeRadiusFor(kind: CreatureKind, territoryRadius: number): number {
  if (kind === 'wolf-spider') return Math.min(WOLF_HOME_RADIUS_MM, territoryRadius || WOLF_HOME_RADIUS_MM);
  return territoryRadius > 0 ? Math.min(territoryRadius, RESIDENT_HOME_RADIUS_MM) : RESIDENT_HOME_RADIUS_MM;
}

const INITIAL_STATE: Partial<Record<CreatureKind, string>> = {
  'jumping-spider': 'rest', 'wolf-spider': 'rest', 'ant-spider': 'rest', woodlouse: 'shelter', centipede: 'prowl',
  'rove-beetle': 'forage', millipede: 'wander', earthworm: 'surface', snail: 'graze',
};

/** Fills free territories (residents: after their respawn delay; visitors: while active). */
function occupyTerritories(sim: Sim, cond: Conditions): void {
  const terr = sim.state.ecology.director.territories;
  for (let i = 0; i < terr.length; i++) {
    const t = terr[i];
    const resident = RESIDENT_KINDS.includes(t.kind) && t.kind !== 'antlion';
    const visitor = VISITOR_KINDS.includes(t.kind);
    if (!resident && !visitor) continue;
    if (t.occupantId >= 0 && sim.stores.creatures.has(t.occupantId)) continue;
    t.occupantId = -1;
    if (sim.state.tick < t.vacantUntilTick) continue;
    if (visitor && (!visitorActive(t.kind, cond) || !chance(sim, VISITOR_SPAWN_P))) continue;
    if (countKind(sim, t.kind) >= capOf(sim, t.kind)) continue;
    if (!spawnPointOk(sim, t.center)) continue;
    const c = spawnKind(sim, t.kind, t.center, {
      state: INITIAL_STATE[t.kind] ?? 'idle', territoryId: i, homeRadius: homeRadiusFor(t.kind, t.radius),
      bb: t.kind === 'woodlouse' ? { roller: rngFloat(rng(sim)) < WOODLOUSE_ROLLERS ? 1 : 0 } : {},
    });
    if (c) t.occupantId = c.id;
  }
}

/** Visitors outside their active time leave (unless engaged); stuck unseen creatures leave. */
function despawnRules(sim: Sim, cond: Conditions): void {
  for (const c of sim.stores.creatures.list) {
    if (!c.alive) continue;
    if (c.lifeEndTick >= 0 && sim.state.tick >= c.lifeEndTick && !isEngaged(sim, c)) { despawnCreature(sim, c.id, 'lifetime'); continue; }
    if ((c.kind === 'centipede' || c.kind === 'rove-beetle') && !visitorActive(c.kind, cond) && !isEngaged(sim, c)) {
      burrowAtDawn(sim, c);
      continue;
    }
    // stuck: no progress for STUCK_DESPAWN_S while not near the focus
    const stuckTicks = STUCK_DESPAWN_S * TICKS_PER_SECOND;
    if (c.nav.status === 'moving' && c.nav.stuckTicks >= stuckTicks && farFromFocus(sim, c.pos) && !isEngaged(sim, c)) {
      despawnCreature(sim, c.id, 'stuck');
    }
  }
}

const CULL_ORDER: readonly CreatureFamily[] = ['neutral', 'prey', 'aphid-predator'];

/** Global cap (I5): cull non-engaged creatures by family order, farthest from the focus first. */
function enforceGlobalCap(sim: Sim): void {
  let live = 0;
  for (const c of sim.stores.creatures.list) if (c.alive) live++;
  if (live <= CREATURE_AGENT_CAP) return;
  focusPoints(sim, _focus);
  const f = _focus[0] ?? { x: sim.world.size / 2, y: 0, z: sim.world.size / 2 };
  for (const fam of CULL_ORDER) {
    const list = sim.stores.creatures.list
      .filter((c) => c.alive && CREATURE_STATS[c.kind].family === fam && !isEngaged(sim, c))
      .sort((a, b) => dist(b.pos, f) - dist(a.pos, f) || a.id - b.id);
    for (const c of list) {
      if (live <= CREATURE_AGENT_CAP) return;
      if (despawnCreature(sim, c.id, 'cap')) live--;
    }
  }
}

/** Live creatures per kind (read-out for the debug API and the soak). */
function countKinds(sim: Sim): void {
  const counts: Record<string, number> = {};
  for (const c of sim.stores.creatures.list) if (c.alive) counts[c.kind] = (counts[c.kind] ?? 0) + 1;
  sim.state.ecology.director.perKindCounts = counts;
}

/** Winter (time-lapse): everything but the (dormant) antlions leaves. */
function winterClear(sim: Sim): void {
  for (const c of sim.stores.creatures.list) if (c.alive && c.kind !== 'antlion' && !isEngaged(sim, c)) despawnCreature(sim, c.id, 'winter');
}

function ambience(sim: Sim, cond: Conditions): void {
  if (cond.winter) return;
  _focus.length = 0;
  focusPoints(sim, _focus);
  const at = _focus[0] ?? null;
  if (cond.phase === 'night' && cond.airC >= 12 && chance(sim, AMBIENT_CRICKET_P)) cue(sim, 'cricket-call', at, 0.5);
  else if (cond.day && !cond.raining && cond.phase !== 'dusk' && chance(sim, AMBIENT_BIRD_P)) cue(sim, 'ambient.bird', at, 0.4);
}

/** Initial placement (lazy, first run): pits with their antlions, prey patches. */
function ensureInit(sim: Sim): void {
  const dir = sim.state.ecology.director;
  if (dir.lastRunTick >= 0) return;
  initPreyPatches(sim);
  if (conditions(sim).predatorMult > 0) initPits(sim);
}

export function runDirector(sim: Sim): void {
  const cond = conditions(sim);
  ensureInit(sim);
  const dir = sim.state.ecology.director;
  const hourly = (dir.lastHourlyTick ?? -1) < 0 || sim.state.tick - (dir.lastHourlyTick ?? 0) >= DIRECTOR_HOURLY_TICKS;
  abandonOrphanPits(sim);
  expireHazards(sim);
  updateDanger(sim, RUN_S);
  if (cond.winter) winterClear(sim);
  else {
    despawnRules(sim, cond);
    occupyTerritories(sim, cond);
    spawnPatchPrey(sim, cond, RUN_S);
    spawnFruitFlies(sim, cond);
    spawnFlyLarvae(sim, cond);
    // stranded worms at the start of a rain event
    if (cond.raining && dir.wasRaining !== 1) strandWorms(sim);
  }
  if (hourly) {
    dir.lastHourlyTick = sim.state.tick;
    regrowPatches(sim, cond);
    if (!cond.winter) {
      aphidPredatorArrivals(sim, cond);
      spawnCaterpillars(sim, cond);
      birdHourly(sim, cond);
    }
  }
  trackAphids(sim, isEngaged);
  enforceGlobalCap(sim);
  countKinds(sim);
  dir.wasRaining = cond.raining ? 1 : 0;
  reconcileInvasion(sim);
  predatorNearAlerts(sim);
  nestAttackedAlerts(sim);
  ambience(sim, cond);
  dir.lastRunTick = sim.state.tick;
}
