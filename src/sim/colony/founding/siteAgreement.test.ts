// Directions §K (last bullet): the static suitability map (the overlay) and the queen's live read-out compute site
// quality with one function and one word table, so on a generated world they agree. The map stores per nav cell
// the best of four terrain-cell samples; the read-out taken at those four sample points must give the same value
// and word. (Before the hand-over nothing has changed the world, so the inputs are the generator's own.)
import { beforeAll, describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { TERRAIN_CELL_BU } from '@/sim/balance';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { generateWorld } from '@/worldgen';
import { SAMPLE_OFFSETS, siteClass } from '@/worldgen/maps/suitability';
import { assessSite } from './siteAssess';

const SEED = 1;
const CELLS = 400; // nav cells sampled around the queen's start
let sim: Sim;

beforeAll(() => {
  const cfg = { ...defaultGameConfig('lasius-niger', SEED), cheats: true };
  const world = generateWorld(cfg.world);
  sim = createSim(createNewGame(cfg, world).state, world);
}, 120_000);

describe('live read-out vs static suitability map (generated world)', () => {
  it('per nav cell, the best read-out of its four sample points equals the map value and word', () => {
    const m = sim.world.maps.suitability['lasius-niger'];
    const cell = TERRAIN_CELL_BU * sim.world.bu, sub = Math.round(m.cell / cell);
    const q0 = sim.stores.ants.get(sim.state.colonies[0].queenId)!.pos;
    const ci = Math.floor(q0.x / m.cell), ck = Math.floor(q0.z / m.cell);
    let n = 0, valueOk = 0, wordOk = 0, diggable = 0;
    const misses: string[] = [];
    for (let r = 0; n < CELLS; r++) {
      for (let dk = -r; dk <= r && n < CELLS; dk++) {
        for (let di = -r; di <= r && n < CELLS; di++) {
          if (Math.max(Math.abs(di), Math.abs(dk)) !== r) continue; // the ring at Chebyshev radius r
          const i = ci + di, k = ck + dk;
          if (i < 0 || k < 0 || i >= m.nx || k >= m.nz) continue;
          let best = 0;
          for (const [oi, ok] of SAMPLE_OFFSETS) {
            const ti = i * sub + Math.floor((oi * sub) / 4), tk = k * sub + Math.floor((ok * sub) / 4);
            best = Math.max(best, assessSite(sim, { x: (ti + 0.5) * cell, y: 0, z: (tk + 0.5) * cell }).q);
          }
          const map = m.data[k * m.nx + i] / 255;
          n++;
          if (map > 0) diggable++;
          if (Math.abs(best - map) <= 0.005) valueOk++;
          else if (misses.length < 8) misses.push(`(${i},${k}) live ${best.toFixed(3)} map ${map.toFixed(3)}`);
          if (siteClass(best) === siteClass(map)) wordOk++;
        }
      }
    }
    expect(diggable).toBeGreaterThan(CELLS / 4);
    expect(valueOk / n, misses.join('; ')).toBeGreaterThanOrEqual(0.98); // seed 1: 400 of 400
    expect(wordOk / n).toBeGreaterThanOrEqual(0.98);
  }, 60_000);
});
