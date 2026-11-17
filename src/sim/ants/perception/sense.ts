// One perception pass for one ant (GDD 02 §7): contact, antennal chemoreception, volatile smell, plus the
// colony's markers and human-event cues an ant at that spot would notice. Writes the percept into ant.bb (keys.ts).
// What an ant cannot know is never written here: no source beyond its odour radius, no trail it is not standing
// on, no colony aggregate.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, FoodSource, HumanCue, Sim } from '@/sim/types';
import { ALARM_ALERT } from '@/sim/balance';
import {
  ALARM_THREAT_OFFSET_BU, ANTENNA_ANGLE_DEG, ANTENNA_REACH_BU, AVOID_LOOKAHEAD_BU, CONTACT_DIST_BU, CONTACT_HALF_ANGLE_DEG, HUMAN_CUE_FEEL_MULT,
  SMELL_CREATURE_BU, SMELL_QUERY_MAX_BU,
} from '@/sim/balance/foraging';
import { footprintMm, isAvailable, odourRadiusMm } from '@/sim/ecology';
import { predatorPerceivedBy } from '@/sim/ecology/creatures';
import { queryAntsNear } from '@/sim/locomotion';
import { PC, THREAT } from './keys';

const DEG = Math.PI / 180;
const COS_CONTACT = Math.cos(CONTACT_HALF_ANGLE_DEG * DEG);
const COS_ANT = Math.cos(ANTENNA_ANGLE_DEG * DEG), SIN_ANT = Math.sin(ANTENNA_ANGLE_DEG * DEG);

/** Creature kinds an ant flees from on sight or smell (GDD 05 §2 ant predators). Tier 2: creatures are stubs. */
const PREDATORS: ReadonlySet<string> = new Set([
  'jumping-spider', 'wolf-spider', 'ant-spider', 'antlion', 'centipede', 'rove-beetle', 'bird',
]);

const ids: number[] = [];
const probe: Vec3 = { x: 0, y: 0, z: 0 };
const dir: Vec3 = { x: 0, y: 0, z: 0 };

/** Height of a source above the ground below it, mm; runtime cache per source object (sources do not move). */
const lifts = new WeakMap<FoodSource, number>();
function liftOf(sim: Sim, s: FoodSource): number {
  let h = lifts.get(s);
  if (h === undefined) { h = Math.max(0, s.pos.y - sim.field.height(s.pos.x, s.pos.z)); lifts.set(s, h); }
  return h;
}

/** Largest odour radius of any available source this tick, mm (runtime cache; the query never looks farther). */
const odourCache = new WeakMap<Sim, { tick: number; r: number }>();
function maxOdourNow(sim: Sim): number {
  let c = odourCache.get(sim);
  if (!c || c.tick !== sim.state.tick) {
    const bu = sim.world.bu;
    let r = CONTACT_DIST_BU * bu;
    for (const s of sim.stores.sources.list) {
      if (!s.alive) continue;
      // a raised source is smelled in plan view from the ground below it: the query must reach up to it
      const lift = liftOf(sim, s);
      r = Math.max(r, odourRadiusMm(s, bu) + lift, footprintMm(s, bu) + CONTACT_DIST_BU * bu);
    }
    c = { tick: sim.state.tick, r: Math.min(r, SMELL_QUERY_MAX_BU * bu) };
    odourCache.set(sim, c);
  }
  return c.r;
}

function food(sim: Sim, ant: Ant): void {
  const bu = sim.world.bu;
  ids.length = 0;
  sim.index.querySources(ant.pos, maxOdourNow(sim), ids);
  let touch = -1, touchD = Infinity, smell = -1, smellD = 0, best = 0;
  const reach = CONTACT_DIST_BU * bu;
  for (let i = 0; i < ids.length; i++) {
    const s = sim.stores.sources.get(ids[i]);
    if (!s || !isAvailable(sim, s)) continue;
    const dx = s.pos.x - ant.pos.x, dy = s.pos.y - ant.pos.y, dz = s.pos.z - ant.pos.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const edge = d - footprintMm(s, bu);
    if (edge <= reach && edge < touchD) { touch = s.id; touchD = edge; }
    const r = odourRadiusMm(s, bu);
    // A source raised above the ground (a flower head on its stem, a crumb on a bench) scents the column below
    // it: an ant at any height between the ground and the source smells it by its horizontal distance (GDD 05
    // §1.2 odour radius, read in plan view; int-1B-sim ruling). Without this no ground ant ever smelled a flower.
    const dOdour = dy > 0 && ant.pos.y >= s.pos.y - liftOf(sim, s) - reach ? Math.sqrt(dx * dx + dz * dz) : d;
    if (dOdour > r) continue;
    const strength = 1 - dOdour / Math.max(r, 1e-6);
    if (strength > best || (strength === best && smell >= 0 && s.id < smell)) { best = strength; smell = s.id; smellD = d; }
  }
  ant.bb[PC.touch] = touch;
  ant.bb[PC.smell] = smell;
  ant.bb[PC.smellD] = smell >= 0 ? smellD : 0;
}

function contacts(sim: Sim, ant: Ant): void {
  const r = CONTACT_DIST_BU * sim.world.bu;
  queryAntsNear(sim, ant.pos, r, ids); // the fine per-tick grid: in a crowded nest the index cells hold hundreds
  let mates = 0, aliens = 0;
  for (let i = 0; i < ids.length; i++) {
    if (ids[i] === ant.id) continue;
    const o = sim.stores.ants.get(ids[i]);
    if (!o) continue;
    const dx = o.pos.x - ant.pos.x, dy = o.pos.y - ant.pos.y, dz = o.pos.z - ant.pos.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > r || d < 1e-9) continue;
    if ((dx * ant.fwd.x + dy * ant.fwd.y + dz * ant.fwd.z) / d < COS_CONTACT) continue;
    if (o.colony === ant.colony) mates++; else aliens++;
  }
  ant.bb[PC.mates] = mates;
  ant.bb[PC.aliens] = aliens;
}

/** Antenna tip at +-35 deg in the tangent plane, ANTENNA_REACH ahead of the head, into probe. */
function antenna(sim: Sim, ant: Ant, side: number): Vec3 {
  const f = ant.fwd, u = ant.up;
  // side vector = up x fwd (left for side +1)
  const sx = u.y * f.z - u.z * f.y, sy = u.z * f.x - u.x * f.z, sz = u.x * f.y - u.y * f.x;
  const d = ANTENNA_REACH_BU * sim.world.bu + 0.5 * ant.lengthBu * sim.world.bu;
  probe.x = ant.pos.x + (f.x * COS_ANT + sx * SIN_ANT * side) * d;
  probe.y = ant.pos.y + (f.y * COS_ANT + sy * SIN_ANT * side) * d;
  probe.z = ant.pos.z + (f.z * COS_ANT + sz * SIN_ANT * side) * d;
  return probe;
}

function chemistry(sim: Sim, ant: Ant): void {
  const ph = sim.phero;
  const outside = ant.nestId < 0;
  // trail and home are laid on surfaces outside cavities only (GDD 02 §8.1)
  ant.bb[PC.trail] = outside
    ? Math.max(ph.sample(ant.colony, 'trail', antenna(sim, ant, 1)), ph.sample(ant.colony, 'trail', antenna(sim, ant, -1)))
    : 0;
  ant.bb[PC.home] = outside ? ph.sample(ant.colony, 'home', ant.pos) : 0;
  ant.bb[PC.alarm] = ph.sample(ant.colony, 'alarm', ant.pos);
}

function markers(sim: Sim, ant: Ant): void {
  let forage = -1, avoid = -1, avoidD = Infinity;
  const pad = AVOID_LOOKAHEAD_BU * sim.world.bu;
  for (const m of sim.stores.markers.list) {
    if (!m.alive || m.colony !== ant.colony) continue;
    if (m.kind !== 'forage' && m.kind !== 'avoid') continue;
    const d = Math.hypot(ant.pos.x - m.pos.x, ant.pos.z - m.pos.z);
    if (m.kind === 'forage' && d <= m.radius && forage < 0) forage = m.id;
    if (m.kind === 'avoid' && d <= m.radius + pad && d - m.radius < avoidD) { avoid = m.id; avoidD = d - m.radius; }
  }
  ant.bb[PC.forageMarker] = forage;
  ant.bb[PC.avoidMarker] = avoid;
}

function setThreat(ant: Ant, code: number, x: number, z: number, dx = 0, dz = 0): void {
  ant.bb[PC.threat] = code;
  ant.bb[PC.threatX] = x;
  ant.bb[PC.threatZ] = z;
  ant.bb[PC.threatDx] = dx;
  ant.bb[PC.threatDz] = dz;
}

/**
 * The way a human pass comes (GDD 02 §10.12 "perpendicular to the approach"): footfalls, strokes and strips move
 * along a lane, so the run's cue nearest in time at another spot gives the direction (earlier spot -> later spot).
 * Unit (x, z), or 0, 0 when the run has no second spot.
 */
function approachOf(cues: readonly HumanCue[], c: HumanCue): { x: number; z: number } {
  let other: HumanCue | undefined;
  for (const o of cues) {
    if (o === c || Math.hypot(c.origin.x - o.origin.x, c.origin.z - o.origin.z) < 1e-3) continue;
    if (!other || Math.abs(o.impactTick - c.impactTick) < Math.abs(other.impactTick - c.impactTick)) other = o;
  }
  if (!other) return { x: 0, z: 0 };
  const [a, b] = other.impactTick <= c.impactTick ? [other, c] : [c, other];
  const dx = b.origin.x - a.origin.x, dz = b.origin.z - a.origin.z, l = Math.hypot(dx, dz);
  return { x: dx / l, z: dz / l };
}

/** Danger in order of urgency: a looming human event, a predator in smell range, alarm pheromone. */
function threats(sim: Sim, ant: Ant): void {
  const now = sim.state.tick;
  for (const run of sim.state.env.human.active) {
    for (const c of run.cues) {
      if ((c.kind !== 'tremor' && c.kind !== 'shadow') || now > c.impactTick || now < c.startTick) continue;
      const d = Math.hypot(ant.pos.x - c.origin.x, ant.pos.z - c.origin.z);
      if (d <= c.radiusMm * HUMAN_CUE_FEEL_MULT) {
        const a = approachOf(run.cues, c);
        setThreat(ant, THREAT.human, c.origin.x, c.origin.z, a.x, a.z);
        return;
      }
    }
  }
  if (ant.nestId < 0) {
    ids.length = 0;
    sim.index.queryCreatures(ant.pos, SMELL_CREATURE_BU * sim.world.bu, ids);
    for (let i = 0; i < ids.length; i++) {
      const c = sim.stores.creatures.get(ids[i]);
      // GDD 05 §2.4 (owns predator detection): 4 L x the predator's stealth, never hidden / dormant ones or a buried
      // antlion (threats-live; was: any predator within SMELL_CREATURE_BU)
      if (c && PREDATORS.has(c.kind) && predatorPerceivedBy(sim, c, ant)) { setThreat(ant, THREAT.creature, c.pos.x, c.pos.z); return; }
    }
  }
  const alarm = ant.bb[PC.alarm] ?? 0;
  if (alarm >= ALARM_ALERT) {
    // the danger lies up the alarm gradient
    const s = sim.phero.sense(ant.colony, 'alarm', ant.pos, ant.fwd, ant.up, dir);
    const k = s > 0 ? ALARM_THREAT_OFFSET_BU * sim.world.bu : 0;
    setThreat(ant, THREAT.alarm, ant.pos.x + dir.x * k, ant.pos.z + dir.z * k);
    return;
  }
  setThreat(ant, THREAT.none, 0, 0);
}

function entrance(sim: Sim, ant: Ant): void {
  const col = sim.stores.colonies.get(ant.colony);
  let best = -1, bestD = Infinity;
  if (col) {
    for (const nid of col.nestIds) {
      const n = sim.stores.nests.get(nid);
      if (!n) continue;
      for (const e of n.entrances) {
        if (e.status === 'sealed') continue;
        const d = Math.hypot(ant.pos.x - e.pos.x, ant.pos.y - e.pos.y, ant.pos.z - e.pos.z);
        if (d < bestD) { bestD = d; best = e.id; }
      }
    }
  }
  ant.bb[PC.entrance] = best;
  ant.bb[PC.entranceD] = best >= 0 ? bestD : 0;
}

/** Runs every sense of the ant now and stores the percept. */
export function perceive(sim: Sim, ant: Ant): void {
  food(sim, ant);
  contacts(sim, ant);
  chemistry(sim, ant);
  markers(sim, ant);
  threats(sim, ant);
  entrance(sim, ant);
  ant.bb[PC.tick] = sim.state.tick;
}
