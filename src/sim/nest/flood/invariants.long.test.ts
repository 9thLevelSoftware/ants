// Flood invariants on generated worlds (task weather-fix2 item 2): seeds 1-3 x the five Tier 1 archetypes, the real
// game (every system, default start, passive founding by the AI queen) for 3 game days with precipitation 0
// (weather severity "none": clear and overcast only). FOUNDRESS_LONG only: 4-10 min per world on the shared machine.
//   1. no chamber of any nest has a flooded share above 0, no nest holds water, nobody drowns or is submerged;
//   2. every nest whose entrance stands on a site the static suitability map calls flood-safe (floodFactorOf >= 2/3)
//      would keep its brood / royal / founding chambers under the 25 % alert share in an ordinary shower
//      (I 0.4 for the median summer rain dwell, 3.2 game hours, integrated from the nest's state at the end);
//   3. a sealed founding cell takes no rain through its plug (inflow at I = 1 through any entrance that is not open
//      is 0 while it is sealed; a real hole into the cell takes rain, review finding 2).
// The fast versions on the test world are invariants.test.ts.

import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { FLOOD_ALERT_FRACTION } from '@/sim/balance/weather';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { TICKS_PER_DAY } from '@/sim/time';
import { byteAt } from '@/sim/world/terrainSample';
import { generateWorld } from '@/worldgen';
import { floodFactorOf } from '@/worldgen/maps/suitability';
import { entranceInflow, isClaustralCell } from './inflow';
import { predictRain } from './predict';

const ARCHETYPES = ['woodland-edge', 'suburban-garden', 'playground-park', 'car-park-verge', 'kitchen-door'] as const;
const ENV = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
/** Seeds (FOUNDRESS_FLOOD_SEEDS=1,2 narrows the sweep on a loaded machine; default 1-3). */
const SEEDS = (ENV.FOUNDRESS_FLOOD_SEEDS ?? '1,2,3').split(',').map(Number).filter((n) => n > 0);
const RAISED = 2 / 3;
const SHOWER_I = 0.4;
const SHOWER_S = 80; // the median summer rain dwell, 3.2 game hours (see invariants.test.ts)
const BROOD = new Set(['nursery', 'royal', 'founding']);
const LONG = !!ENV.FOUNDRESS_LONG;

interface WorldResult {
  wetSteps: number;
  drowned: number;
  submerged: number;
  sealedLeaks: number;
  safeNests: number;
  safeFlooding: string[];
}

function dryWorld(archetype: string, seed: number): WorldResult {
  const base = defaultGameConfig('lasius-niger', seed, 'naturalist');
  const config = { ...base, world: { ...base.world, archetype: archetype as never } };
  const world = generateWorld(config.world);
  const sim: Sim = createSim(createNewGame(config, world).state, world);
  sim.state.config.rules.weatherSeverity = 'none';
  const r: WorldResult = { wetSteps: 0, drowned: 0, submerged: 0, sealedLeaks: 0, safeNests: 0, safeFlooding: [] };
  sim.events.on('ant-died', (e) => { if (e.cause === 'drowning') r.drowned++; });
  sim.events.on('ant-submerged', () => { r.submerged++; });
  for (let t = 0; t < 3 * TICKS_PER_DAY; t++) {
    sim.tick();
    if (t % 50 !== 0) continue;
    for (const n of sim.stores.nests.list) {
      if (!n.alive) continue;
      if (n.flood.water > 0 || n.chambers.some((c) => c.flooded > 0)) r.wetSteps++;
      if (isClaustralCell(n) && n.entrances.some((e) => e.status !== 'open' && entranceInflow(sim, e, 1, n).q > 0)) r.sealedLeaks++;
    }
  }
  for (const n of sim.stores.nests.list) {
    if (!n.alive || n.entrances.length === 0) continue;
    const safe = n.entrances.every((e) => floodFactorOf(byteAt(world.maps.floodRisk, e.pos.x, e.pos.z) / 255) >= RAISED);
    if (!safe) continue;
    r.safeNests++;
    const p = predictRain(sim, n, SHOWER_I, SHOWER_S);
    for (const c of n.chambers) {
      const share = p.chambers.get(c.id) ?? 0;
      if (BROOD.has(c.type) && share >= FLOOD_ALERT_FRACTION) r.safeFlooding.push(`nest ${n.id} ${c.type} ${share.toFixed(2)}`);
    }
  }
  return r;
}

describe.skipIf(!LONG)('flood invariants on generated worlds (3 dry game days)', () => {
  for (const archetype of ARCHETYPES) for (const seed of SEEDS) {
    it(`${archetype} #${seed}`, () => {
      const r = dryWorld(archetype, seed);
      console.log(`[flood-invariants] ${archetype} #${seed}`, JSON.stringify(r));
      expect(r.wetSteps).toBe(0);
      expect(r.drowned).toBe(0);
      expect(r.submerged).toBe(0);
      expect(r.sealedLeaks).toBe(0);
      expect(r.safeFlooding).toEqual([]);
    }, 900_000);
  }
});
