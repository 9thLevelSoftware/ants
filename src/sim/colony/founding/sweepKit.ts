// Test support for the sealing sweep on generated worlds (task viab-founding work item 1; never imported by game
// code): one generated world, a founding site (the queen's start or the nearest good map cell), and one of two
// paths to the seal:
//   passive - cheat.completeFounding (the template carved where she stands, then the passive player's guided seal),
//   player  - the queen walks to the site, digs with the real dig-bite, then the possessed player presses E once.
// Each case ends with the opening in `lay` and the cell sealed, and is then held for SEAL_HOLD_TICKS checking that
// the seal stays (no flip back to `ready`, no path from the cell to the air).

import type { ArchetypeId, Sim, System, WorldData } from '@/sim/types';
import { begin } from '@/sim/ants';
import { navStop, navTo } from '@/sim/locomotion';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { runFoundingDig } from '@/sim/testing/e2e/foundingScript';
import { generateWorld } from '@/worldgen';
import { SUIT } from '@/worldgen/tuning/maps';
import { cavityEntrances } from './dig';
import { throatClosed } from './leak';
import { cellReachesAir } from './sealPlan';
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
}

function sealedNow(sim: Sim): boolean {
  const nest = nestOf(sim);
  return nest.founding?.state === 'sealed' && !cellReachesAir(sim, nest) && cavityEntrances(sim, nest).every((e) => throatClosed(sim, e));
}

/** Holds the seal for SEAL_HOLD_TICKS; false at the first tick it is not sealed. */
function holds(sim: Sim): { held: boolean; note: string } {
  for (let t = 0; t < SEAL_HOLD_TICKS; t++) {
    sim.tick();
    if (t % 20 === 0 && !sealedNow(sim)) {
      const nest = nestOf(sim);
      return { held: false, note: `seal lost at +${t} ticks: state ${nest.founding?.state}, air ${cellReachesAir(sim, nest)}, ${cavityEntrances(sim, nest).map((e) => e.status).join('/')}` };
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

/** The player widening the cell until the nest reports it ready (generated.long.test's player). */
function widenCell(sim: Sim, maxTicks: number): void {
  const q = queen(sim), bu = sim.world.bu, c = { ...q.pos };
  let k = 0;
  const end = sim.state.tick + maxTicks;
  while (phase(sim) === 'dig' && sim.state.tick < end) {
    const a = k * 2.4, r = Math.min(2.5, 0.8 + 0.05 * k) * bu;
    walkTo(sim, { x: c.x + Math.cos(a) * r * 0.5, y: c.y, z: c.z + Math.sin(a) * r * 0.5 }, 0.5, 400);
    for (let b = 0; b < 2 && phase(sim) === 'dig'; b++) {
      begin(sim, q, 'dig-bite', { kind: 'point', id: -1, pos: { x: q.pos.x + Math.cos(a) * 2 * bu, y: q.pos.y - 0.2 * bu, z: q.pos.z + Math.sin(a) * 2 * bu } });
      stepUntil(sim, () => q.action === null, 300);
    }
    stepUntil(sim, () => phase(sim) !== 'dig', 15);
    k++;
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
    desiccation: q.queen?.founding?.desiccation ?? -1, note: h.note,
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
  sim.enqueue({ type: 'cheat.completeFounding', workers: 10 });
  stepUntil(sim, () => phase(sim) === 'seal' || phase(sim) === 'failed', 3000);
  if (phase(sim) !== 'seal') return { ...result(sim, sim.state.tick, [], 'carve'), ok: false };
  const refusals = listenRefusals(sim);
  const t0 = sim.state.tick;
  stepUntil(sim, () => phase(sim) !== 'seal', SEAL_BUDGET_TICKS);
  return result(sim, t0, refusals, 'seal');
}

/** The player path: walk to `site`, dig with dig-bite, press E once in the cell (possessed). */
export function playerCase(sim: Sim, site: { x: number; y: number; z: number } | null): SweepResult {
  const q = queen(sim);
  if (site && !walkTo(sim, site, 1.5, 6000)) return { ...result(sim, sim.state.tick, [], 'walk'), ok: false };
  navStop(sim, q);
  const nest = nestOf(sim);
  runFoundingDig(sim, q, nest, { x: q.fwd.x, z: q.fwd.z }, 30_000);
  widenCell(sim, 20_000);
  if (phase(sim) !== 'seal') return { ...result(sim, sim.state.tick, [], 'dig'), ok: false, note: `readiness ${nest.founding?.readiness?.toFixed(2)}` };
  sim.enqueue({ type: 'possess', antId: q.id });
  sim.tick();
  const refusals = listenRefusals(sim);
  const t0 = sim.state.tick;
  sim.enqueue({ type: 'action', actionId: 'seal-entrance', phase: 'start' });
  stepUntil(sim, () => phase(sim) !== 'seal', SEAL_BUDGET_TICKS);
  return result(sim, t0, refusals, 'seal');
}
