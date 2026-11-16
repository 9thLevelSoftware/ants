// The possessed nuptial flight (GDD 06 §11.6, GDD 01 §4.4; simplified per the integrator: a guided glide over the
// height field). The gyne is possessed like any ant; a locomotion movement override moves her (medium `air`), so
// the possession camera follows her as usual. Phases: ascend (to the cruise height) -> lek (stay near the males above
// the tallest point around the nest for FLIGHT_MATING_S) -> descend -> land. Energy drains; leaving the map is
// dispersal off-map; "Land now" resolves the rest by the aggregate model with p_mate halved.

import { rngFloat } from '@/core/rng';
import type { Ant, Colony, PlayerIntent, PossessedFlight, Sim, SpeciesDef, Walker, ZoneType } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { killAnt } from '@/sim/entities';
import { possess, releasePossessed } from '@/sim/ants/player/possession';
import { registerMovementOverride } from '@/sim/locomotion/runtime';
import { zoneAt } from '@/sim/world';
import { TICKS_PER_SECOND } from '@/sim/time';
import {
  FLIGHT_CRUISE_BU, FLIGHT_DIGGABLE_FOUND_BONUS, FLIGHT_EDGE_BU, FLIGHT_ENERGY_PER_S, FLIGHT_ENERGY_WIND_MULT,
  FLIGHT_LAND_NOW_MATE_MULT, FLIGHT_LEK_HEIGHT_BU, FLIGHT_LEK_RADIUS_BU, FLIGHT_LEK_SAMPLES, FLIGHT_LEK_SEARCH_BU,
  FLIGHT_MATING_S, FLIGHT_MAX_S, FLIGHT_TOUCHDOWN_BU, FLIGHT_WIND_AIR_MS,
} from '@/sim/balance/lifecycle';
import { bookFlown, lifecycleOf } from '../succession/lifecycleState';
import { glideStep, heightAboveBu, type GlideState } from './glide';
import { addCause, endFlight, flightOdds, openRecord } from './launch';

const installed = new WeakSet<Sim>();
const scratch: GlideState = { x: 0, y: 0, z: 0, yaw: 0 };
const TICK_S = 1 / TICKS_PER_SECOND;

function isAnt(w: Walker): w is Ant {
  return typeof (w as Ant).caste === 'string';
}

/** The flight of the player's colony in progress, if any. */
export function activeFlight(sim: Sim): { col: Colony; f: PossessedFlight } | null {
  for (const col of sim.state.colonies) {
    const f = col.lifecycle?.flight;
    if (f && f.phase !== 'ended') return { col, f };
  }
  return null;
}

/** Tallest ground point within FLIGHT_LEK_SEARCH_BU of `at` (terrain heights on rings), males hover above it. */
export function lekPoint(sim: Sim, x: number, z: number): { x: number; y: number; z: number } {
  const bu = sim.world.bu, size = sim.world.size;
  let best = { x, z, h: sim.field.height(x, z) };
  for (let ring = 1; ring <= 3; ring++) {
    const r = (FLIGHT_LEK_SEARCH_BU * bu * ring) / 3;
    for (let i = 0; i < FLIGHT_LEK_SAMPLES; i++) {
      const a = (2 * Math.PI * i) / FLIGHT_LEK_SAMPLES;
      const px = Math.min(size, Math.max(0, x + Math.cos(a) * r)), pz = Math.min(size, Math.max(0, z + Math.sin(a) * r));
      const h = sim.field.height(px, pz);
      if (h > best.h) best = { x: px, z: pz, h };
    }
  }
  // the males' swarm stays inside the locality, clear of the edge (on a tiny map: its middle)
  const margin = Math.min(size / 2, (FLIGHT_EDGE_BU + FLIGHT_LEK_RADIUS_BU) * bu);
  const cx = Math.min(size - margin, Math.max(margin, best.x)), cz = Math.min(size - margin, Math.max(margin, best.z));
  return { x: cx, y: sim.field.height(cx, cz) + FLIGHT_LEK_HEIGHT_BU * bu, z: cz };
}

/** Why `flightPossess` is refused now, or null. */
export function flightPossessRefusal(sim: Sim, gyneId: number): string | null {
  const s = sim.state;
  if (s.player.timelapse !== null) return 'invalid-phase';
  const a = sim.stores.ants.get(gyneId);
  const col = s.colonies[0];
  if (!a || !col || a.colony !== col.id || a.caste !== 'gyne' || !a.alate) return 'not-a-gyne';
  if (a.alate.state !== 'assembling' && a.alate.state !== 'waiting') return 'invalid-phase';
  if (lifecycleOf(col).repro.openFlightId === '') return 'no-flight';
  if (activeFlight(sim)) return 'busy';
  return null;
}

/** Takes a gyne into the possessed flight: possessed, airborne above her, heading away from the nest. */
export function startPossessedFlight(sim: Sim, gyneId: number): boolean {
  if (flightPossessRefusal(sim, gyneId) !== null) return false;
  const col = sim.state.colonies[0];
  const a = sim.stores.ants.get(gyneId)!;
  installOverride(sim);
  possess(sim, { type: 'possess', antId: a.id, via: 'command', dropTo1x: true });
  if (sim.state.player.possessedAntId !== a.id) return false;
  const rec = openRecord(col);
  if (rec) rec.possessed = true;
  const bu = sim.world.bu;
  // take-off from the surface above her (out of the nest)
  const ground = sim.field.height(a.pos.x, a.pos.z);
  a.pos.y = Math.max(a.pos.y, ground) + 2 * bu;
  a.medium = 'air';
  a.vel.x = 0; a.vel.y = 0; a.vel.z = 0;
  a.nestId = -1;
  a.chamberId = -1;
  a.alate!.state = 'flying';
  a.alate!.flightPhase = 'ascend';
  a.alate!.flightEnergy = 1;
  a.alate!.mating = 0;
  const lek = lekPoint(sim, a.pos.x, a.pos.z);
  lifecycleOf(col).flight = {
    flightId: rec?.id ?? '', gyneId: a.id, phase: 'ascend', startTick: sim.state.tick, energy: 1, mating: 0, mated: false,
    lek, yaw: Math.atan2(lek.z - a.pos.z, lek.x - a.pos.x), outcome: '', seconds: 0, landing: null, landingDiggable: false, landingZone: null, founded: false,
  };
  col.repro.active = { id: rec?.id ?? '', phase: 'ascend', possessedAntId: a.id, startTick: sim.state.tick, energy: 1, matingProgress: 0 };
  sim.emit({ type: 'flight.possessed-start', gyneId: a.id });
  return true;
}

/** Locomotion hook: moves the flying gyne (true = handled). */
function installOverride(sim: Sim): void {
  if (installed.has(sim)) return;
  installed.add(sim);
  registerMovementOverride(sim, (s, w, dt) => (isAnt(w) && w.alate?.state === 'flying' ? flyStep(s, w, dt) : false));
}

/** Rebuilds the hook after a load (the override is a runtime registration, not state). */
export function ensureFlightOverride(sim: Sim): void {
  if (activeFlight(sim)) installOverride(sim);
}

/**
 * Climb request -1..1 from the player's intent. The possession controls as the game sends them (no flight block):
 * Space (the foot / grip key) climbs, Shift (hurry) descends. A flight block, when an input layer sends one, wins.
 */
export function controlClimb(intent: PlayerIntent): number {
  const fl = intent.flight;
  if (fl) return fl.climb - fl.descend;
  return (intent.grip || intent.dir.y > 0.3 ? 1 : 0) - (intent.hurry ? 1 : 0);
}

function flyStep(sim: Sim, a: Ant, dt: number): boolean {
  const af = activeFlight(sim);
  if (!af || af.f.gyneId !== a.id || af.f.phase === 'land') return true; // she stays put until the flight ends
  const f = af.f;
  const bu = sim.world.bu;
  const ground = (x: number, z: number) => sim.field.height(x, z);
  const intent = sim.state.player.possessedAntId === a.id ? sim.state.player.intent : null;
  const w = sim.state.env.weather;
  let climb = 0, steerX = 0, steerZ = 0, thrust = 1;
  if (intent) {
    steerX = intent.dir.x; steerZ = intent.dir.z;
    const fl = intent.flight;
    climb = controlClimb(intent);
    if (fl) thrust = fl.brake > 0.5 ? 0 : 1;
  }
  if (f.phase === 'ascend') climb = 1;
  if (f.energy <= 0 || f.phase === 'descend') climb = Math.min(climb, -1);
  scratch.x = a.pos.x; scratch.y = a.pos.y; scratch.z = a.pos.z; scratch.yaw = f.yaw;
  glideStep(scratch, { steerX, steerZ, climb, thrust, windMs: w.wind2m, windX: w.windDir.x, windZ: w.windDir.z, bu }, dt, ground);
  const dx = scratch.x - a.pos.x, dy = scratch.y - a.pos.y, dz = scratch.z - a.pos.z;
  a.pos.x = scratch.x; a.pos.y = scratch.y; a.pos.z = scratch.z;
  f.yaw = scratch.yaw;
  const L = Math.hypot(dx, dy, dz);
  a.speed = L / Math.max(1e-6, dt);
  if (L > 1e-6) { a.fwd.x = dx / L; a.fwd.y = dy / L; a.fwd.z = dz / L; }
  a.up.x = 0; a.up.y = 1; a.up.z = 0;
  a.vel.x = dx / dt; a.vel.y = dy / dt; a.vel.z = dz / dt;
  return true;
}

/** Per-tick flight logic: phases, energy, mating, landing, edge, timeout. */
export function updatePossessedFlight(sim: Sim, def: SpeciesDef): void {
  const af = activeFlight(sim);
  if (!af) return;
  const { col, f } = af;
  const a = sim.stores.ants.get(f.gyneId);
  if (!a || !a.alive) { finishFlight(sim, col, def, 'died'); return; }
  installOverride(sim);
  const bu = sim.world.bu;
  const dt = TICK_S;
  f.seconds += dt;
  const wind = sim.state.env.weather.wind2m;
  if (f.phase !== 'land') f.energy = Math.max(0, f.energy - FLIGHT_ENERGY_PER_S * (wind > FLIGHT_WIND_AIR_MS ? FLIGHT_ENERGY_WIND_MULT : 1) * dt);
  const hBu = heightAboveBu({ x: a.pos.x, y: a.pos.y, z: a.pos.z, yaw: 0 }, (x, z) => sim.field.height(x, z), bu);
  if (f.phase === 'ascend' && hBu >= FLIGHT_CRUISE_BU) f.phase = 'lek';
  if (f.phase === 'lek' || f.phase === 'mate') {
    const near = Math.hypot(a.pos.x - f.lek.x, a.pos.z - f.lek.z) <= FLIGHT_LEK_RADIUS_BU * bu
      && Math.abs(a.pos.y - f.lek.y) <= FLIGHT_LEK_RADIUS_BU * bu;
    f.phase = near ? 'mate' : 'lek';
    if (near) f.mating = Math.min(1, f.mating + dt / FLIGHT_MATING_S);
    if (f.mating >= 1) { f.mated = true; f.phase = 'descend'; }
  }
  if (f.energy <= 0 && f.phase !== 'land') f.phase = 'descend';
  a.alate!.flightPhase = f.phase === 'ended' ? null : f.phase;
  a.alate!.flightEnergy = f.energy;
  a.alate!.mating = f.mating;
  col.repro.active = { id: f.flightId, phase: f.phase, possessedAntId: a.id, startTick: f.startTick, energy: f.energy, matingProgress: f.mating };
  const edge = FLIGHT_EDGE_BU * bu, size = sim.world.size;
  if (a.pos.x < edge || a.pos.z < edge || a.pos.x > size - edge || a.pos.z > size - edge) { finishFlight(sim, col, def, 'dispersed'); return; }
  if (f.phase !== 'ascend' && hBu <= FLIGHT_TOUCHDOWN_BU) { finishFlight(sim, col, def, f.energy <= 0 ? 'exhausted' : 'landed'); return; }
  if (f.seconds >= FLIGHT_MAX_S) finishFlight(sim, col, def, 'timeout');
}

/** `flightLand`: land now (the rest resolves by the aggregate model, p_mate halved when not mated). */
export function landNow(sim: Sim, def: SpeciesDef): boolean {
  const af = activeFlight(sim);
  if (!af) return false;
  finishFlight(sim, af.col, def, 'land-now');
  return true;
}

/** Ends her flight: whether she founds a daughter, then she leaves the colony and the flight record closes. */
function finishFlight(sim: Sim, col: Colony, def: SpeciesDef, outcome: string): void {
  const life = lifecycleOf(col);
  const f = life.flight;
  if (!f) return;
  const a = sim.stores.ants.get(f.gyneId);
  const bu = sim.world.bu;
  const rng = sim.stream('rng.repro');
  const odds = flightOdds(sim, def, 1, 1);
  let pFound = 0;
  let zone: ZoneType | null = null;
  if (a && a.alive) {
    f.landing = { x: a.pos.x, y: a.pos.y, z: a.pos.z };
    zone = zoneAt(sim.world, a.pos.x, a.pos.z);
    const below = { x: a.pos.x, y: sim.field.height(a.pos.x, a.pos.z) - bu, z: a.pos.z };
    f.landingDiggable = sim.field.diggability(below, def.id) > 0;
    if (outcome === 'landed' || outcome === 'exhausted') pFound = f.mated ? odds.pFound + (f.landingDiggable ? FLIGHT_DIGGABLE_FOUND_BONUS : 0) : 0;
    else if (outcome === 'dispersed') pFound = (f.mated ? 1 : odds.pMate) * odds.pFound;
    else if (outcome === 'land-now' || outcome === 'timeout') pFound = (f.mated ? 1 : odds.pMate * FLIGHT_LAND_NOW_MATE_MULT) * odds.pAir * odds.pFound;
  }
  const founded = pFound > 0 && rngFloat(rng) < Math.min(1, pFound);
  f.founded = founded;
  f.landingZone = outcome === 'dispersed' ? null : zone;
  f.outcome = outcome;
  f.phase = 'ended';
  col.repro.active = null;
  const rec = openRecord(col);
  if (rec) {
    rec.nLaunched++;
    if (f.mated) rec.nMated++;
    if (outcome === 'died') { rec.flightDeaths++; addCause(rec, 'predation', 1); }
    else rec.nLanded++;
  }
  life.repro.alatesFlown++;
  if (a && a.alive) {
    if (sim.state.player.possessedAntId === a.id) releasePossessed(sim, 'player');
    a.flags &= ~AntFlag.POSSESSED;
    bookFlown(sim, col, 'dispersed');
    killAnt(sim, a.id, 'dispersed');
  }
  sim.emit({ type: 'flight.possessed-end', gyneId: f.gyneId, outcome });
  // the others are resolved at take-off; when she ends first the take-off happens now
  if (life.repro.assemblyUntil >= 0) return;
  endFlight(sim, col, def, witnessedOf(f));
}

/** The possessed gyne's part of the flight record (null when nobody flew). */
export function witnessedOf(f: PossessedFlight | null): { founded: boolean; zone: ZoneType | null } | null {
  return f && f.phase === 'ended' ? { founded: f.founded, zone: f.landingZone } : null;
}

/** After take-off, a flight whose possessed gyne already finished closes; one still flying closes when she ends. */
export function flightCanEnd(col: Colony): boolean {
  const f = col.lifecycle?.flight;
  return !f || f.phase === 'ended';
}
