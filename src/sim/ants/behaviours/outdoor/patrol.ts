// The `patrol` task (GDD 02 §10.10; owner: combat). States:
//   patrol.loop    walk at cruise between waypoints on the home-range edge (home pheromone 1-3 ph), depositing home
//                  marks as every ant outside does; a hostile ant seen within 15 BU (or a predator within 6 BU)
//                  raises the alarm when the sighting is near an entrance or a trail and is then fought; farther
//                  sightings are only noted. After PATROL_TRIP_S -> return.
//   patrol.rally   an active rally marker of the colony (GDD 02 §12.2): hold within 8 BU of it and engage every
//                  non-nestmate inside its radius (mode attack: the same, the raid itself is the rivals module's).
//   patrol.return  back into the nest, then the allocator re-evaluates (task cycle end).

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Behaviour, Marker, Sim } from '@/sim/types';
import { rngRange } from '@/core/rng';
import {
  PATROL_ALARM_NEAR_BU, PATROL_ARRIVE_BU, PATROL_CANDIDATES, PATROL_HOME_BAND, PATROL_PREDATOR_BU, PATROL_RING_BU,
  PATROL_SEE_BU, PATROL_THINK_TICKS, PATROL_TRAIL_PH, PATROL_TRIP_S, RALLY_HOLD_BU,
} from '@/sim/balance/combat';
import { begin, canDo } from '@/sim/ants/actions';
import { navStop, navTo, navToTarget, navWander } from '@/sim/locomotion';
import { taskCycleDone } from '@/sim/colony';
import { activeRally, mayAttack, startFight } from '@/sim/combat';
import { secondsToTicks } from '@/sim/time';
import { homeNest, logDecision, mainEntrance } from './common';
import { hostileCreature } from './fightTargets';

const T0 = 'pt.t0', WX = 'pt.wx', WY = 'pt.wy', WZ = 'pt.wz', ISSUED = 'pt.go', RALLY = 'cb.rally', ALARMED = 'pt.alarm';
const ids: number[] = [];

function setState(sim: Sim, ant: Ant, s: string): void {
  if (ant.state !== s) { ant.state = s; ant.stateTick = sim.state.tick; ant.bb[ISSUED] = 0; }
}

function d3(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function homePoint(sim: Sim, ant: Ant): Vec3 {
  const n = homeNest(sim, ant);
  const e = n ? mainEntrance(n) : undefined;
  return e ? e.pos : ant.pos;
}

/** Next waypoint: a point on a ring around home whose home pheromone lies in the band (else the closest to it). */
function pickWaypoint(sim: Sim, ant: Ant): void {
  const bu = sim.world.bu, home = homePoint(sim, ant), rng = sim.stream('rng.combat');
  let best: Vec3 | null = null, bestErr = Infinity;
  for (let i = 0; i < PATROL_CANDIDATES; i++) {
    const a = rngRange(rng, 0, Math.PI * 2), r = rngRange(rng, PATROL_RING_BU[0], PATROL_RING_BU[1]) * bu;
    const x = Math.min(sim.world.size - bu, Math.max(bu, home.x + Math.cos(a) * r));
    const z = Math.min(sim.world.size - bu, Math.max(bu, home.z + Math.sin(a) * r));
    const p = { x, y: sim.field.height(x, z), z };
    const h = sim.phero.sample(ant.colony, 'home', p);
    const err = h < PATROL_HOME_BAND[0] ? PATROL_HOME_BAND[0] - h : h > PATROL_HOME_BAND[1] ? h - PATROL_HOME_BAND[1] : 0;
    if (err < bestErr) { best = p; bestErr = err; }
    if (err === 0) break;
  }
  const p = best ?? home;
  ant.bb[WX] = p.x; ant.bb[WY] = p.y; ant.bb[WZ] = p.z;
  ant.bb[ISSUED] = 0;
}

/** Near an own entrance or on a trail of the colony: a sighting there is worth an alarm (GDD 02 §10.10). */
function nearHomeOrTrail(sim: Sim, ant: Ant, p: Vec3): boolean {
  const r = PATROL_ALARM_NEAR_BU * sim.world.bu;
  const n = homeNest(sim, ant);
  if (n) for (const e of n.entrances) if (d3(e.pos, p) <= r) return true;
  return sim.phero.sample(ant.colony, 'trail', p) >= PATROL_TRAIL_PH;
}

/** A hostile in sight: a foreign ant within 15 BU, or a predator within 6 BU (nearest first). */
function sighting(sim: Sim, ant: Ant, within: Marker | null): { kind: 'ant' | 'creature'; id: number; pos: Vec3 } | null {
  const bu = sim.world.bu;
  const r = within ? within.radius : PATROL_SEE_BU * bu;
  const at = within ? within.pos : ant.pos;
  let best: { kind: 'ant' | 'creature'; id: number; pos: Vec3 } | null = null, bestD = Infinity;
  sim.index.queryAnts(at, r, ids);
  for (const id of ids) {
    const o = sim.stores.ants.get(id);
    if (!o || !mayAttack(sim, ant, o)) continue;
    const d = d3(o.pos, at);
    if (d <= r && d < bestD) { best = { kind: 'ant', id, pos: o.pos }; bestD = d; }
  }
  if (best) return best;
  const rc = within ? within.radius : PATROL_PREDATOR_BU * bu;
  sim.index.queryCreatures(at, rc, ids);
  for (const id of ids) {
    const c = sim.stores.creatures.get(id);
    if (!c || !c.alive || !hostileCreature(sim, ant, c)) continue;
    const d = d3(c.pos, at);
    if (d <= rc && d < bestD) { best = { kind: 'creature', id, pos: c.pos }; bestD = d; }
  }
  return best;
}

function rally(sim: Sim, ant: Ant, m: Marker): void {
  setState(sim, ant, 'patrol.rally');
  ant.bb[RALLY] = m.id;
  const foe = sighting(sim, ant, m);
  if (foe) { logDecision(sim, ant, 'marker:rally', foe.id); startFight(sim, ant, foe, foe.pos, 'marker:rally'); return; }
  const hold = RALLY_HOLD_BU * sim.world.bu;
  if (ant.bb[ISSUED] === 1 && ant.nav.status === 'moving') return;
  ant.bb[ISSUED] = 1;
  if (d3(ant.pos, m.pos) > hold) navTo(sim, ant, m.pos, hold * 0.5);
  else navWander(sim, ant, m.pos, hold);
}

function loop(sim: Sim, ant: Ant): void {
  setState(sim, ant, 'patrol.loop');
  const foe = sighting(sim, ant, null);
  if (foe) {
    if (nearHomeOrTrail(sim, ant, foe.pos)) {
      if ((ant.bb[ALARMED] ?? 0) === 0 && canDo(sim, ant, 'release-alarm', null).ok) {
        if (ant.nav.status === 'moving') navStop(sim, ant);
        ant.bb[ALARMED] = 1;
        begin(sim, ant, 'release-alarm', null);
        return;
      }
      if (ant.action) return; // the alarm puff is being released
      ant.bb[ALARMED] = 0;
      startFight(sim, ant, foe, foe.pos, 'threat');
      return;
    }
    logDecision(sim, ant, 'threat', foe.id);
  }
  const w = { x: ant.bb[WX] ?? ant.pos.x, y: ant.bb[WY] ?? ant.pos.y, z: ant.bb[WZ] ?? ant.pos.z };
  const arrive = PATROL_ARRIVE_BU * sim.world.bu;
  if (ant.bb[WX] === undefined || d3(ant.pos, w) <= arrive || ant.nav.status === 'arrived' || ant.nav.status === 'failed') {
    if (ant.bb[ISSUED] === 1 || ant.bb[WX] === undefined) { pickWaypoint(sim, ant); return; }
  }
  if (ant.bb[ISSUED] === 1 && ant.nav.status === 'moving') return;
  ant.bb[ISSUED] = 1;
  navTo(sim, ant, { x: w.x, y: w.y, z: w.z }, arrive);
}

function goHome(sim: Sim, ant: Ant): void {
  setState(sim, ant, 'patrol.return');
  if (ant.nestId >= 0) { taskCycleDone(sim, ant); return; }
  const n = homeNest(sim, ant);
  const e = n ? mainEntrance(n) : undefined;
  if (!e) { taskCycleDone(sim, ant); return; }
  if (ant.bb[ISSUED] === 1 && ant.nav.status === 'moving') return;
  if (ant.bb[ISSUED] === 1 && ant.nav.status === 'arrived') { taskCycleDone(sim, ant); return; }
  ant.bb[ISSUED] = 1;
  navToTarget(sim, ant, { kind: 'entrance', id: e.id, pos: e.pos }, sim.world.bu);
}

function update(sim: Sim, ant: Ant): void {
  ant.thinkTick = sim.state.tick + PATROL_THINK_TICKS;
  if (ant.combat && (ant.combat.seizedBy >= 0 || ant.combat.paralysedUntilTick > sim.state.tick)) return;
  const m = activeRally(sim, ant.colony);
  if (m) { rally(sim, ant, m); return; }
  if ((ant.bb[RALLY] ?? -1) >= 0) { delete ant.bb[RALLY]; setState(sim, ant, 'patrol.return'); }
  if (ant.state === 'patrol.return' || sim.state.tick - (ant.bb[T0] ?? sim.state.tick) > secondsToTicks(PATROL_TRIP_S)) { goHome(sim, ant); return; }
  loop(sim, ant);
}

export const patrolBehaviour: Behaviour = {
  task: 'patrol',
  enter(sim, ant) {
    ant.bb[T0] = sim.state.tick;
    ant.bb[ALARMED] = 0;
    delete ant.bb[WX];
    setState(sim, ant, 'patrol.loop');
    ant.thinkTick = sim.state.tick;
  },
  update,
  exit(sim, ant) {
    if (ant.nav.status === 'moving') navStop(sim, ant);
    for (const k of [T0, WX, WY, WZ, ISSUED, ALARMED]) delete ant.bb[k];
  },
};
