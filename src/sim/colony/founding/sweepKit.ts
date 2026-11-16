// Test support for the sealing sweep on generated worlds (task viab-founding work item 1; never imported by game
// code): one generated world, a founding site (the queen's start or the nearest good map cell), and one of two
// paths to the seal:
//   passive - cheat.completeFounding (the template carved at the template site nearest her, which the cheat may move up
//             to AUTO_SITE_SEARCH_BU to find soil for the whole template: `movedBu` says how far), then the passive
//             player's guided seal,
//   player  - the queen walks to the site, digs with the real dig-bite, then the possessed player presses E once. When
//             the scripted digger gets no bite in at all there, the cheat's template is carved instead (`template`
//             true, noted 'dig by template'): such a case proves the seal, not the dig, and is counted apart.
// Each case ends with the opening in `lay` and the cell sealed, and is then held for SEAL_HOLD_TICKS checking that
// the seal stays (no flip back to `ready`, no path from the cell to the air). sealHeldThrough checks it for longer
// (the time-lapse, generated.long.test).

import type { ArchetypeId, Sim, System, WorldData } from '@/sim/types';
import { navStop, navTo } from '@/sim/locomotion';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { canDigAt, foundingReadiness } from '@/sim/nest';
import { generateWorld } from '@/worldgen';
import { SUIT } from '@/worldgen/tuning/maps';
import { FB } from './access';
import { cavityEntrances } from './dig';
import { throatClosed } from './leak';
import { cellReachesAir, queenInCavity } from './sealPlan';
import { SG } from './sealGuide';
import { nestOf, phase, queen, stepUntil } from './testkit';

export const TIER1_ARCHETYPES: readonly ArchetypeId[] = ['woodland-edge', 'suburban-garden', 'playground-park', 'car-park-verge', 'kitchen-door'];

/** How long a seal must hold after it is reached, ticks (one game minute of the lay phase). */
export const SEAL_HOLD_TICKS = 600;
/** Ticks the seal may take from the E press / the auto-seal request (the queen's exposure budget is far larger). */
export const SEAL_BUDGET_TICKS = 6000;

export interface SweepOptions {
  /** Leave out the nest flood system (weather-fix2's dry-weather drowning, L12) while it still reproduces. */
  noFlood?: boolean;
}

export function generatedWorld(archetype: ArchetypeId, seed: number): { world: WorldData; config: ReturnType<typeof defaultGameConfig> } {
  const base = defaultGameConfig('lasius-niger', seed);
  const config = { ...base, cheats: true, world: { ...base.world, archetype } };
  return { world: generateWorld(config.world), config };
}

export function sweepSim(world: WorldData, config: ReturnType<typeof defaultGameConfig>, o: SweepOptions = {}): Sim {
  const systems: readonly System[] = o.noFlood ? SYSTEMS.filter((s) => s.name !== 'nest-flood') : SYSTEMS;
  const sim = createSim(createNewGame(config, world).state, world, { systems });
  sim.enqueue({ type: 'openingSkipIntro' });
  stepUntil(sim, () => phase(sim) === 'search', 200);
  return sim;
}

/** The nearest good (or better) static-map cell within `rBu` of the queen, else the best one; a ground point. */
export function goodSite(sim: Sim, rBu: number): { x: number; y: number; z: number; q: number } {
  const q = queen(sim), m = sim.world.maps.suitability['lasius-niger'], bu = sim.world.bu;
  let best = { x: q.pos.x, y: 0, z: q.pos.z, q: -1 };
  for (let iz = 0; iz < m.nz; iz++) for (let ix = 0; ix < m.nx; ix++) {
    const x = (ix + 0.5) * m.cell, z = (iz + 0.5) * m.cell, v = m.data[iz * m.nx + ix] / 255;
    const d = Math.hypot(x - q.pos.x, z - q.pos.z);
    const better = best.q < SUIT.good ? v > best.q : v >= SUIT.good && d < Math.hypot(best.x - q.pos.x, best.z - q.pos.z);
    if (d <= rBu * bu && better) best = { x, y: sim.field.height(x, z), z, q: v };
  }
  return best;
}

export interface SweepResult {
  ok: boolean;
  /** Ticks from the seal request (E press / auto request) to `sealed`, -1 if never. */
  sealTicks: number;
  plugs: number;
  /** seal-entrance refusals the queen got (reason), and the guide's strategy changes. */
  refusals: string[];
  /** The opening phase at the end, and where it stopped when it failed. */
  phase: string;
  stage: string;
  /** The seal held for SEAL_HOLD_TICKS (no flip back to ready, no path to the air). */
  held: boolean;
  desiccation: number;
  note: string;
  /** Player path: the scripted dig never started, the cheat's template was carved instead. */
  template: boolean;
  /** Passive path: how far the cheat moved the site from where she stood, BU (0 on the player path). */
  movedBu: number;
}

function sealedNow(sim: Sim): boolean {
  const nest = nestOf(sim);
  return nest.founding?.state === 'sealed' && !cellReachesAir(sim, nest) && cavityEntrances(sim, nest).every((e) => throatClosed(sim, e))
    && queenInCavity(sim, nest, queen(sim));
}

/**
 * Steps until `done()` (at most maxTicks), checking every `every` ticks that the cell stays sealed (record `sealed`,
 * no path to the air, every throat closed, the queen inside); the first loss, or null when it held.
 */
export function sealHeldThrough(sim: Sim, done: () => boolean, maxTicks: number, every = 50): string | null {
  for (let t = 0; t < maxTicks && !done(); t++) {
    sim.tick();
    if (t % every !== 0 || done()) continue;
    if (!sealedNow(sim)) {
      const nest = nestOf(sim);
      return `seal lost at +${t} ticks (${phase(sim)}): state ${nest.founding?.state}, air ${cellReachesAir(sim, nest)}, ${cavityEntrances(sim, nest).map((e) => e.status).join('/')}`;
    }
  }
  return null;
}

/** Holds the seal for SEAL_HOLD_TICKS; false at the first tick it is not sealed. */
function holds(sim: Sim): { held: boolean; note: string } {
  for (let t = 0; t < SEAL_HOLD_TICKS; t++) {
    sim.tick();
    if (t % 20 === 0 && !sealedNow(sim)) {
      const nest = nestOf(sim);
      return { held: false, note: `seal lost at +${t} ticks: state ${nest.founding?.state}, air ${cellReachesAir(sim, nest)}, queen in ${queenInCavity(sim, nest, queen(sim))}, ${cavityEntrances(sim, nest).map((e) => e.status).join('/')}` };
    }
  }
  return { held: true, note: '' };
}

function walkTo(sim: Sim, p: { x: number; y: number; z: number }, tolBu: number, maxTicks: number): boolean {
  const q = queen(sim);
  if (!navTo(sim, q, p, tolBu * sim.world.bu)) return false;
  stepUntil(sim, () => q.nav.status !== 'moving', maxTicks);
  return q.nav.status === 'arrived';
}

// ---- the scripted player (tests/e2e/founding.mjs's player, ported: the possessed queen, her own movement input and
// the `action` command, as the browser drives her) ----

/** Test diagnostics hook (probes set it). */
export let DEBUG: ((s: string) => void) | null = null;
export function setSweepDebug(f: ((s: string) => void) | null): void { DEBUG = f; }

/** Walking to the site by her own input when locomotion's route fails: at most this long, ticks. */
const WALK_STEER_TICKS = 3000;
const SHAFT_SLOPE_DEG = 55, SHAFT_DEPTH_BU = 9, SHAFT_MAX_BITES = 260, ROOM_MAX_ROUNDS = 6, CELL_DEPTH_BU = 9.5, SITE_SEARCH_BU = 30, OPEN_ABOVE_BU = 12;

function setDir(sim: Sim, d: { x: number; y: number; z: number } | null): void {
  const i = sim.state.player.intent;
  i.dir.x = d ? d.x : 0; i.dir.y = d ? d.y : 0; i.dir.z = d ? d.z : 0;
}

function walkDir(sim: Sim, ticks: number, d: { x: number; y: number; z: number }): void {
  setDir(sim, d);
  stepUntil(sim, () => false, ticks);
  setDir(sim, null);
}

/** Her own movement input toward (gx, gz) until within tol mm; false when she does not get there. */
function steerTo(sim: Sim, gx: number, gz: number, tol: number, maxTicks = 600): boolean {
  const q = queen(sim);
  for (let i = 0; i < maxTicks; i++) {
    const dx = gx - q.pos.x, dz = gz - q.pos.z, d = Math.hypot(dx, dz);
    if (d < tol) { setDir(sim, null); return true; }
    setDir(sim, { x: dx / d, y: 0, z: dz / d });
    sim.tick();
  }
  setDir(sim, null);
  return false;
}

/** One dig bite at `slopeDeg` below the horizontal along h (a press of F, released at once), to its end. */
function bite(sim: Sim, slopeDeg: number, h: { x: number; z: number }): boolean {
  const q = queen(sim), d = 2 * sim.world.bu;
  let failed = false;
  const off = sim.events.on('action-failed', (e) => { if (e.antId === q.id && e.action === 'dig-bite' && e.reason !== 'blocked') failed = true; });
  sim.enqueue({ type: 'action', actionId: 'dig-bite', phase: 'start', target: { kind: 'point', id: -1, pos: { x: q.pos.x + h.x * d, y: q.pos.y - Math.tan((slopeDeg * Math.PI) / 180) * d, z: q.pos.z + h.z * d } } });
  stepUntil(sim, () => false, 2);
  sim.enqueue({ type: 'action', actionId: 'dig-bite', phase: 'stop' });
  stepUntil(sim, () => q.action === null, 60);
  sim.events.flush();
  off();
  return !failed;
}

/** A heading from (x0, z0) whose ramp and cell lie in diggable ground (no buried prim), or null. */
function headingFrom(sim: Sim, x0: number, z0: number): { x: number; z: number } | null {
  const bu = sim.world.bu, tan = Math.tan((SHAFT_SLOPE_DEG * Math.PI) / 180);
  // the queen's own dig check (her dig power against the soil's dig speed: a hard crust refuses her bites)
  const q = queen(sim);
  const ok = (x: number, y: number, z: number) => canDigAt(sim, q, { x, y, z });
  const g0 = sim.field.height(x0, z0);
  // open ground she can stand on (nothing lying on it: a stone top is no place to start a shaft), diggable below
  for (let h = 0.25; h <= OPEN_ABOVE_BU; h += 0.25) if (sim.field.sampleXYZ(x0, g0 + h * bu, z0) <= 0) return null;
  if (!ok(x0, g0 - 0.5 * bu, z0)) return null;
  for (let a = 0; a < 16; a++) {
    const th = (a / 16) * 2 * Math.PI, hx = Math.cos(th), hz = Math.sin(th);
    let good = true;
    for (let u = -2; u <= 9 && good; u += 0.5) {
      const x = x0 + hx * u * bu, z = z0 + hz * u * bu, g = sim.field.height(x, z);
      // open ground over the mouth and the first steps (she bites the face she walks up to)
      if (u <= 3 && (sim.field.sampleXYZ(x, g + 0.5 * bu, z) <= 0 || sim.field.sampleXYZ(x, g + 1.5 * bu, z) <= 0)) good = false;
      if (u >= 0 && good) good = ok(x, g - (u * tan + 1) * bu, z) && ok(x, g - CELL_DEPTH_BU * bu, z);
    }
    if (good) return { x: hx, z: hz };
  }
  return null;
}

/**
 * The shaft's start and heading: here when the ground is diggable, else the nearest diggable ground within
 * SITE_SEARCH_BU (a player standing on a stone beside a good site steps off it first); she walks there.
 */
function shaftHeading(sim: Sim): { x: number; z: number } {
  const q = queen(sim), bu = sim.world.bu;
  const here = headingFrom(sim, q.pos.x, q.pos.z);
  if (here) return here;
  for (let r = 1; r <= SITE_SEARCH_BU; r++) {
    const n = Math.max(8, Math.round(2 * Math.PI * r));
    for (let i = 0; i < n; i++) {
      const th = (i / n) * 2 * Math.PI, x = q.pos.x + Math.cos(th) * r * bu, z = q.pos.z + Math.sin(th) * r * bu;
      const h = headingFrom(sim, x, z);
      if (!h) continue;
      // the site moves there (a test set-up: walking through grass climbs the blades, locomotion's business)
      sim.enqueue({ type: 'cheat.teleport', antId: q.id, pos: { x, y: sim.field.height(x, z) + 0.5 * bu, z } });
      stepUntil(sim, () => false, 3);
      if (DEBUG) DEBUG(`site moved ${r} BU to (${x.toFixed(0)}, ${z.toFixed(0)}) g ${sim.field.height(x, z).toFixed(1)}; queen at ${q.pos.x.toFixed(0)},${q.pos.y.toFixed(1)},${q.pos.z.toFixed(0)}`);
      return h;
    }
  }
  const h = Math.hypot(q.fwd.x, q.fwd.z) || 1;
  return { x: q.fwd.x / h, z: q.fwd.z / h };
}

/**
 * The scripted player's dig (the browser founding.mjs player): possessed, a 55 deg shaft bitten face by face until
 * the depth bar is full and she is 7 BU down, then the cell: level bites in 8 directions round the shaft's end,
 * stepping back to the centre between them, until the nest reports the cell ready.
 */
export function playerDig(sim: Sim): void {
  const q = queen(sim), bu = sim.world.bu, nest = nestOf(sim);
  sim.enqueue({ type: 'possess', antId: q.id });
  sim.tick();
  const H = shaftHeading(sim), H3 = { x: H.x, y: 0, z: H.z };
  // face the heading as the browser player does: a step back, then walk on along it (the bite goes where she faces)
  const sx = q.pos.x, sz = q.pos.z;
  steerTo(sim, sx - H.x * 1.5 * bu, sz - H.z * 1.5 * bu, 0.5 * bu);
  walkDir(sim, 2, H3);
  stepUntil(sim, () => false, 5);
  const mouthY = q.pos.y;
  for (let k = 0; k < 6 && phase(sim) === 'search'; k++) if (!bite(sim, SHAFT_SLOPE_DEG, H)) walkDir(sim, 2, H3);
  let bites = 1, best = 0, bestAt = 0;
  const depthBar = () => { const r = foundingReadiness(sim, nest); return r ? Math.min(1, r.dMaxBu / r.dMinBu) : 0; };
  while (phase(sim) === 'dig' && bites < SHAFT_MAX_BITES && (depthBar() < 1 || (mouthY - q.pos.y) / bu < SHAFT_DEPTH_BU - 2) && bites - bestAt < 60) {
    if (!bite(sim, SHAFT_SLOPE_DEG, H)) walkDir(sim, 3, H3); // the face ahead is open: step on down into the cut
    bites++;
    const depth = (mouthY - q.pos.y) / bu;
    if (depth > best + 0.1) { best = depth; bestAt = bites; }
  }
  const centre = { ...q.pos };
  for (let r = 0; r < ROOM_MAX_ROUNDS && phase(sim) === 'dig'; r++) {
    for (let k = 0; k < 8 && phase(sim) === 'dig'; k++) {
      const deg = k * 45 + (r % 2) * 22.5, c = Math.cos((deg * Math.PI) / 180), sn = Math.sin((deg * Math.PI) / 180);
      const d = { x: H.x * c - H.z * sn, y: 0, z: H.x * sn + H.z * c };
      steerTo(sim, centre.x, centre.z, 0.4 * bu);
      walkDir(sim, 1 + r, d);
      for (let b = 0; b < 2 && phase(sim) === 'dig'; b++) bite(sim, 3, d);
    }
    stepUntil(sim, () => phase(sim) !== 'dig', 60);
  }
}

function result(sim: Sim, t0: number, refusals: string[], stage: string): SweepResult {
  const q = queen(sim);
  const sealed = phase(sim) === 'lay' || phase(sim) === 'timelapse';
  const sealTicks = sealed ? sim.state.tick - t0 : -1;
  const plugs = q.bb[SG.total] ?? 0;
  const h = sealed ? holds(sim) : { held: false, note: '' };
  return {
    ok: sealed && h.held && q.alive, sealTicks, plugs, refusals, phase: phase(sim), stage, held: h.held,
    desiccation: q.queen?.founding?.desiccation ?? -1, note: h.note, template: false, movedBu: 0,
  };
}

function listenRefusals(sim: Sim): string[] {
  const out: string[] = [];
  const id = queen(sim).id;
  sim.events.on('action-failed', (e) => { if (e.antId === id && e.action === 'seal-entrance') out.push(e.reason); });
  return out;
}

/** The passive path at the queen's position (cheat.completeFounding). */
export function passiveCase(sim: Sim): SweepResult {
  const at = { ...queen(sim).pos };
  sim.enqueue({ type: 'cheat.completeFounding', workers: 10 });
  stepUntil(sim, () => phase(sim) === 'seal' || phase(sim) === 'failed', 3000);
  const o = nestOf(sim).origin, movedBu = Math.hypot(o.x - at.x, o.z - at.z) / sim.world.bu;
  if (phase(sim) !== 'seal') return { ...result(sim, sim.state.tick, [], 'carve'), ok: false, movedBu };
  const refusals = listenRefusals(sim);
  const t0 = sim.state.tick;
  stepUntil(sim, () => phase(sim) !== 'seal', SEAL_BUDGET_TICKS);
  return { ...result(sim, t0, refusals, 'seal'), movedBu };
}

/** The player path: walk to `site`, dig with dig-bite, press E once in the cell (possessed). */
export function playerCase(sim: Sim, site: { x: number; y: number; z: number } | null): SweepResult {
  const q = queen(sim);
  if (site && !walkTo(sim, site, 1.5, 6000)) {
    // locomotion's route did not get her there (viab-loco): the player walks her there with her own input instead
    navStop(sim, q);
    sim.enqueue({ type: 'possess', antId: q.id });
    sim.tick();
    const steered = steerTo(sim, site.x, site.z, 1.5 * sim.world.bu, WALK_STEER_TICKS);
    if (DEBUG) DEBUG(`walk by locomotion failed (${q.nav.status}); steered by input: ${steered}`);
    if (!steered) return { ...result(sim, sim.state.tick, [], 'walk'), ok: false, note: `nav ${q.nav.status}, steering failed too` };
  }
  navStop(sim, q);
  const nest = nestOf(sim);
  playerDig(sim);
  let note = '';
  if (phase(sim) === 'search') {
    // the scripted digger never got a bite in here (sand-pit fill, a pit it slides about in: a dig and locomotion
    // matter, reported): the template a dig produces is carved instead (cheat.completeFounding's), then the
    // player's own press of E seals it, as in every other player case
    note = 'dig by template';
    sim.enqueue({ type: 'cheat.completeFounding', workers: 10 });
    stepUntil(sim, () => phase(sim) === 'seal' || phase(sim) === 'failed', 3000);
    q.bb[FB.auto] = 0; // the passive path stops here: the player seals
    sim.enqueue({ type: 'possess', antId: q.id });
    sim.tick();
  }
  if (phase(sim) !== 'seal') return { ...result(sim, sim.state.tick, [], 'dig'), ok: false, template: note !== '', note: `readiness ${nest.founding?.readiness?.toFixed(2)}` };
  const refusals = listenRefusals(sim);
  const t0 = sim.state.tick;
  sim.enqueue({ type: 'action', actionId: 'seal-entrance', phase: 'start' });
  stepUntil(sim, () => phase(sim) !== 'seal', SEAL_BUDGET_TICKS);
  const r = result(sim, t0, refusals, 'seal');
  return note ? { ...r, template: true, note: r.note ? `${note}; ${r.note}` : note } : r;
}
