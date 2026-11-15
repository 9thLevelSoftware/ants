// Test support for the creature module (not used by the game): a reference combat fake, small scenes on the flat
// test world, event capture and time setting.

import type { Ant, Creature, CreatureKind, Herd, Season, Sim, SimEvent, System } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import type { Vec3 } from '@/core/math/vec3';
import { killAnt, spawnAnt, spawnHerd, spawnPlant } from '@/sim/entities';
import { makeTestSim, type TestSimOptions } from '@/sim/testing';
import { locomotionSystem, placeOnSurface } from '@/sim/locomotion';
import { calendarTickAt } from '@/sim/time';
import { creatureDirectorSystem, creatureSystem } from './index';
import { quietTracker } from './threat';
import { ports } from './ports';
import { creatureArmour } from './queries';
import { spawnKind, type SpawnKindOptions } from './spawn';

export interface CombatLog {
  damage: { kind: string; id: number; dmg: number; cause: string; tick: number }[];
  released: number[];
  alarms: number;
}

/**
 * Reference combat for tests (the combat module is a parallel task): hp -= dmg x (1 - armour) (creature armour
 * from creatureArmour; ants 0), an ant at hp <= 0 dies with the cause; releaseGrapple clears the holder's lock.
 * Alerts are dropped unless `realAlerts` (then progression's alert engine stores them). Returns the log and a
 * restore function.
 */
export function installFakeCombat(o: { realAlerts?: boolean } = {}): { log: CombatLog; restore: () => void } {
  const saved = { ...ports };
  const log: CombatLog = { damage: [], released: [], alarms: 0 };
  ports.applyDamage = (sim, kind, id, dmg, cause) => {
    if (kind === 'ant') {
      const a = sim.stores.ants.get(id);
      if (!a) return 0;
      a.hp -= dmg;
      log.damage.push({ kind, id, dmg, cause, tick: sim.state.tick });
      if (a.hp <= 0) killAnt(sim, id, cause);
      return dmg;
    }
    if (kind === 'creature') {
      const c = sim.stores.creatures.get(id);
      if (!c) return 0;
      const d = dmg * (1 - creatureArmour(c));
      c.hp -= d;
      log.damage.push({ kind, id, dmg: d, cause, tick: sim.state.tick });
      return d;
    }
    return 0;
  };
  ports.releaseGrapple = (sim, holderId) => {
    const a = sim.stores.ants.get(holderId);
    if (a?.combat) a.combat.lock = null;
    log.released.push(holderId);
  };
  ports.raiseAlarm = () => { log.alarms++; };
  if (!o.realAlerts) {
    ports.raiseAlert = () => -1;
    ports.clearAlert = () => {};
  }
  return { log, restore: () => Object.assign(ports, saved) };
}

export interface SceneOptions extends TestSimOptions {
  /** Include the director system (default false: creatures are spawned by the test). */
  director?: boolean;
  /** Extra systems before the creature systems. */
  extra?: readonly System[];
}

/** A test sim running only the creature systems and locomotion (no ant behaviours). */
export function creatureScene(o: SceneOptions = {}): Sim {
  const systems: System[] = [...(o.extra ?? [])];
  if (o.director) systems.push(creatureDirectorSystem);
  systems.push(creatureSystem, locomotionSystem);
  return makeTestSim({ sizeBu: 128, ...o, systems });
}

/** Sets the calendar so that the current tick is at season / day / hour (default-length seasons). */
export function setClock(sim: Sim, season: Season, day: number, hour: number): void {
  const cal = calendarTickAt(season, day, hour, sim.state.config);
  sim.state.env.calendar.startTick = cal - sim.state.tick;
}

/** A worker of the player colony standing on the surface at (x, z). */
export function placeWorker(sim: Sim, x: number, z: number, colonyId = sim.state.colonies[0].id): Ant {
  const pos = { x, y: sim.field.height(x, z), z };
  const ant = spawnAnt(sim, { colony: colonyId, caste: 'worker', pos, fwd: { x: 1, y: 0, z: 0 }, ageGd: 5 });
  placeOnSurface(sim, ant, pos);
  ant.task = 'forage';
  return ant;
}

export function possess(sim: Sim, ant: Ant): void {
  ant.flags |= AntFlag.POSSESSED;
  sim.state.player.possessedAntId = ant.id;
}

/** Moves the founding queen far away (she would count as a nestmate near the scene). */
export function sendQueenAway(sim: Sim, to: Vec3 = { x: 20, y: 0, z: 20 }): void {
  for (const a of sim.stores.ants.list) if (a.caste === 'queen') placeOnSurface(sim, a, to);
}

export function spawnAt(sim: Sim, kind: CreatureKind, x: number, z: number, o: SpawnKindOptions = {}): Creature {
  const c = spawnKind(sim, kind, { x, y: sim.field.height(x, z), z }, o);
  if (!c) throw new Error(`no surface for ${kind}`);
  return c;
}

/** Records every event of the given types (with the tick they were emitted in). */
export function captureEvents(sim: Sim, types: readonly SimEvent['type'][]): { tick: number; ev: SimEvent }[] {
  const out: { tick: number; ev: SimEvent }[] = [];
  sim.events.onAny((type, payload) => {
    if (types.includes(type as SimEvent['type'])) out.push({ tick: sim.state.tick - 1, ev: payload as SimEvent });
  });
  return out;
}

export function step(sim: Sim, n: number, until?: () => boolean): number {
  for (let i = 0; i < n; i++) {
    sim.tick();
    if (until && until()) return i + 1;
  }
  return n;
}

/** Field value at a walker's surface point (must be >= about 0: not inside a solid). */
export function surfaceClearance(sim: Sim, w: { pos: Vec3; up: Vec3; footOffset: number }): number {
  return sim.field.sample(w.pos);
}

/** A host plant at (x, z) carrying a herd of `aphids` (a bare world object stands in for the plant geometry). */
export function addHerd(sim: Sim, x: number, z: number, aphids: number): Herd {
  const objectId = 900000 + sim.world.objects.length;
  sim.world.objects.push({
    id: objectId, templateId: 'test-herb', pos: { x, y: sim.field.height(x, z), z }, rot: { x: 0, y: 0, z: 0, w: 1 },
    primStart: 0, primCount: 0, tags: ['plant'], routeIds: [], poiIds: [],
  });
  const plant = spawnPlant(sim, objectId, 'herb', 0);
  return spawnHerd(sim, plant.id, 'aphid', aphids);
}

/** A colony past founding with `n` quiet daytime hours in the threat director's record (major threats allowed). */
export function quietHistory(sim: Sim, n: number): void {
  sim.state.progression.stage.id = 'growing';
  const q = quietTracker(sim);
  for (let i = 0; i < n; i++) { q.hours[q.head] = 1; q.head = (q.head + 1) % q.hours.length; }
}
