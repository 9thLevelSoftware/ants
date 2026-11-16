// The weather demo's scene (pure sim, no three): a real new game on the test world with the small nest and its
// workers, sited LOW (worldgen's flood risk 0.35 over the whole map: water gathers at the entrance), next to a paved
// hollow that collects runoff into a puddle. The storm is held by the demo (`holdWeather`), because the weather
// state machine would end a forced storm after its drawn dwell.
import type { Sim, WeatherState } from '@/sim/types';
import { MATERIAL_IDS } from '@/sim/types';
import { NAV_CELL_BU, PRECIP_PEAK_FRACTION, STORM_RAIN_MMH } from '@/sim/balance';
import { makeTestSim, makeTestWorld } from '@/sim/testing';

export interface WeatherScenario {
  sim: Sim;
  /** Centre of the paved hollow, mm. */
  hollow: { x: number; z: number; r: number };
  entrance: { x: number; y: number; z: number };
}

const SIZE_BU = 128;
const WORKERS = 30;
/** Paved hollow: radius and depth (BU), puddle capacity (mm), offset from the nest entrance (BU). */
const HOLLOW = { rBu: 18, depthBu: 0.6, capMm: 8, dxBu: -26, dzBu: 12 };
const LOW_SITE_RISK = 0.35;
/** Dwell of a held weather state, ticks. */
const HOLD_SPAN = 10000;

function byteMap(cell: number, n: number, fill: number) {
  return { cell, nx: n, nz: n, data: new Uint8Array(n * n).fill(fill) };
}

export function weatherScenario(seed = 1): WeatherScenario {
  const world = makeTestWorld({ sizeBu: SIZE_BU, seed });
  const bu = world.bu;
  // the small nest's entrance sits 14 BU east of the queen start (src/sim/testing/testNest.ts)
  const ex = world.queenStart.pos.x + 14 * bu, ez = world.queenStart.pos.z;
  const hx = ex + HOLLOW.dxBu * bu, hz = ez + HOLLOW.dzBu * bu, hr = HOLLOW.rBu * bu;
  // paved hollow: concrete surface, a shallow bowl in the terrain, impermeable cells with a puddle capacity
  const t = world.terrain, concrete = MATERIAL_IDS.indexOf('concrete');
  for (let iz = 0; iz < t.nz; iz++) for (let ix = 0; ix < t.nx; ix++) {
    const d = Math.hypot(ix * t.cell - hx, iz * t.cell - hz) / hr;
    if (d < 1.2) t.data[iz * t.nx + ix] -= HOLLOW.depthBu * bu * Math.max(0, 1 - d * d);
  }
  const s = world.ground.surface;
  for (let iz = 0; iz < s.nz; iz++) for (let ix = 0; ix < s.nx; ix++) {
    if (Math.hypot((ix + 0.5) * s.cell - hx, (iz + 0.5) * s.cell - hz) < hr * 1.15) s.data[iz * s.nx + ix] = concrete;
  }
  const navCell = NAV_CELL_BU * bu, n = Math.ceil(world.size / navCell);
  const perm = byteMap(navCell, n, 255), cap = byteMap(navCell, n, 0);
  for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) {
    if (Math.hypot((ix + 0.5) * navCell - hx, (iz + 0.5) * navCell - hz) < hr) { perm.data[iz * n + ix] = 0; cap.data[iz * n + ix] = HOLLOW.capMm; }
  }
  world.maps.permeable = perm;
  world.maps.puddleCapMm = cap;
  world.maps.floodRisk.data.fill(Math.round(LOW_SITE_RISK * 255));
  const config = { startSeason: 'summer' as const, startDayOfSeason: 2, startHour: 13 };
  const sim = makeTestSim({ world, nest: 'small', workers: WORKERS, seed, config });
  const nest = sim.stores.nests.get(sim.state.colonies[0].nestIds[0])!;
  const e = nest.entrances[0].pos;
  return { sim, hollow: { x: hx, z: hz, r: hr }, entrance: { ...e } };
}

/** Holds a weather state at full strength (demo only: the state machine would move on after its dwell). */
export function holdWeather(sim: Sim, state: WeatherState): void {
  const w = sim.state.env.weather;
  if (w.state !== state) {
    sim.enqueue({ type: 'cheat.setWeather', state, intensityClass: state === 'rain' ? 'downpour' : null });
    sim.applyPendingCommands();
  }
  // keep the dwell clock at the precipitation bell's peak (35 % of a long dwell)
  w.startTick = sim.state.tick - Math.round(PRECIP_PEAK_FRACTION * HOLD_SPAN);
  w.dwellEndTick = w.startTick + HOLD_SPAN;
  if (state === 'storm') { w.rainRateMmH = STORM_RAIN_MMH; w.precip = 1; w.peakPrecip = 1; w.cloud = 1; }
  if (state !== 'storm' && state !== 'rain') { w.rainRateMmH = 0; w.precip = 0; }
}

/** Advances the sim n ticks, re-applying the held weather every tick (null = let the weather run). */
export function runTicks(sim: Sim, n: number, hold: WeatherState | null = null): void {
  for (let i = 0; i < n; i++) {
    if (hold) holdWeather(sim, hold);
    sim.tick();
  }
}
