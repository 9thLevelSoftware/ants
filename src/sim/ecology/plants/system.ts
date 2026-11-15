// The plants systems (tick order: the ecology phase, after the sources):
//   plants       hourly (ECO_HOURLY_EVERY): host quality, herd growth and the seasonal cycle, migrants, rain on
//                the films, nectar, the colonies' honeydew yield days and the player colony's diag-herds;
//   herd-tending every tick a cheap check (the tend-aphid droplet listener), every second the tending step:
//                tenders, claims, tend, production into the pools and films, discovery;
//   tend-demand  right after each allocation pass (local adapter, TEND_DEMAND_ADAPTER).

import type { Sim, System } from '@/sim/types';
import { ALLOC_EVERY, ALLOC_OFFSET, HOURLY_EVERY, PLANTS_OFFSET, RAIN_INTENSITY } from '@/sim/balance';
import { TEND_DEMAND_ADAPTER } from '@/sim/balance/ecology';
import { TICKS_PER_DAY, TICKS_PER_SECOND } from '@/sim/time';
import { applyTendDemand } from './demand';
import { herdDiagnostic } from './diagnostics';
import { rainOnFilms } from './disturb';
import { installDropletListener } from './droplet';
import { stepHerd, stepHostQuality, stepMigrants, type HourContext } from './growth';
import { ensureLinks } from './links';
import { nectarTier, stepNectar } from './nectar';
import { ports } from './ports';
import { d28Now, hourNow, tempFactor } from './season';
import { stepTending } from './tending';
import { rollYield } from './yield';

/** Seconds between tending steps, and the tick within the second they run on. */
const TEND_STEP_TICKS = TICKS_PER_SECOND;
const TEND_STEP_OFFSET = 3;

function safe<T>(f: () => T, fallback: T): T {
  try {
    const v = f();
    return typeof v === 'number' && !Number.isFinite(v) ? fallback : v;
  } catch {
    return fallback;
  }
}

/** Air temperature at the plants, °C (20 when the environment cannot say). */
export function plantAirC(sim: Sim): number {
  return safe(() => ports.airTemp(sim), 20);
}

function abundance(sim: Sim): number {
  return sim.state.config.difficulty.params.foodAbundanceMult ?? 1;
}

/** One hourly plants step of dtGd game days. */
export function runPlantsHour(sim: Sim, dtGd: number): void {
  const airC = plantAirC(sim);
  const raining = safe(() => ports.isRaining(sim), false);
  const c: HourContext = {
    d28: d28Now(sim), hour: hourNow(sim), dt: dtGd, fT: tempFactor(airC),
    heavyRain: safe(() => ports.rainIntensityAt(sim), 0) >= RAIN_INTENSITY.downpour,
  };
  for (const pl of sim.stores.plants.list) if (pl.alive) stepHostQuality(pl, c);
  const herds = sim.stores.herds.list;
  const n = herds.length; // herds founded during the step start next hour
  for (let i = 0; i < n; i++) {
    const h = herds[i];
    if (!h.alive) continue;
    stepHerd(sim, h, sim.stores.plants.get(h.hostId), c);
    if (h.alive) ensureLinks(sim, h);
  }
  stepMigrants(sim, c);
  if (raining) rainOnFilms(sim);
  stepNectar(sim, { d28: c.d28, dt: dtGd, airC, raining, mult: abundance(sim), tier: nectarTier() });
  for (const col of sim.stores.colonies.list) if (col.alive) rollYield(sim, col);
  const player = sim.state.colonies[0];
  if (player?.alive && player.honeydew && herds.length > 0) ports.publishDiagnostic(sim, herdDiagnostic(sim, player, c.d28, c.fT));
}

export const plantsSystem: System = {
  name: 'plants', phase: 'ecology', every: HOURLY_EVERY, offset: PLANTS_OFFSET,
  run: (sim) => runPlantsHour(sim, HOURLY_EVERY / TICKS_PER_DAY),
};

/** One tending step of dtS seconds over every herd. */
export function runTendingStep(sim: Sim, dtS: number): void {
  const fT = tempFactor(plantAirC(sim));
  const mult = abundance(sim);
  const herds = sim.stores.herds.list;
  for (let i = 0, n = herds.length; i < n; i++) if (herds[i].alive) stepTending(sim, herds[i], dtS, fT, mult);
}

export const herdTendingSystem: System = {
  name: 'herd-tending', phase: 'ecology',
  run(sim) {
    installDropletListener(sim);
    if ((sim.state.tick + TEND_STEP_OFFSET) % TEND_STEP_TICKS !== 0 || sim.stores.herds.list.length === 0) return;
    runTendingStep(sim, TEND_STEP_TICKS / TICKS_PER_SECOND);
  },
};

export const tendDemandSystem: System = {
  name: 'tend-demand', phase: 'queen', every: ALLOC_EVERY, offset: ALLOC_OFFSET,
  run(sim) {
    if (!TEND_DEMAND_ADAPTER || sim.stores.herds.list.length === 0) return;
    for (const col of sim.stores.colonies.list) if (col.alive) applyTendDemand(sim, col);
  },
};

export const plantSystems: readonly System[] = [plantsSystem, herdTendingSystem, tendDemandSystem];
