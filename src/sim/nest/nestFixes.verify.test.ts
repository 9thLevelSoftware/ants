// Independent review of nest-fixes (adversarial checks). Each test names the acceptance item or GDD 03 App. E
// check it probes. Failing tests here demonstrate defects for the fixer; passing ones stay as regression tests.
import { describe, expect, it } from 'vitest';
import type { Mound, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { BULKING, MOUND_CLEAR_PAD_BU } from '@/sim/balance/nest';
import { makeTestSim } from '@/sim/testing';
import { passiveBehaviours } from '@/sim/testing/e2e/colonyScenario';
import { navTo } from '@/sim/locomotion';
import { colonyNests, runFreeDig } from './freeDigKit';
import { dumpPoint, moundVolume } from './index';
import { moundById, relax } from './mounds';
import { moundMask, moundOrigin, pileOverOpenings } from './moundRelax';
import { placePellet, spawnPellet } from './pellets';
import { runTicks } from './nestTestKit';
import { reposeDeg } from './substrate';
import { freeDig } from './freeDigKit';

const PELLET = 0.85;

/** (max - min) / mean of the pile height of the grid sampled on a circle (field overlay). */
function ringSpread(sim: Sim, cx: number, cz: number, r: number): number {
  const hs: number[] = [];
  for (let a = 0; a < 64; a++) {
    const x = cx + Math.cos((a / 64) * 2 * Math.PI) * r, z = cz + Math.sin((a / 64) * 2 * Math.PI) * r;
    hs.push(sim.field.height(x, z) - sim.world.terrain.data[0] * 0 - heightBare(sim, x, z));
  }
  const mean = hs.reduce((s, h) => s + h, 0) / hs.length;
  return (Math.max(...hs) - Math.min(...hs)) / mean;
}
import { heightAt } from '@/sim/world/terrainSample';
const heightBare = (sim: Sim, x: number, z: number): number => heightAt(sim.world.terrain, x, z);

/** Largest top-height difference between 4-adjacent usable grid cells (GDD 03 App. E check 5), mm. */
function worstAdjacent(sim: Sim, m: Mound): number {
  const n = m.n;
  let worst = 0;
  for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) {
    const i = iz * n + ix;
    if (Number.isNaN(m.base[i])) continue;
    for (const j of [ix + 1 < n ? i + 1 : -1, iz + 1 < n ? i + n : -1]) {
      if (j < 0 || Number.isNaN(m.base[j])) continue;
      if (m.h[i] <= 0 && m.h[j] <= 0) continue;
      worst = Math.max(worst, Math.abs(m.base[i] + m.h[i] - m.base[j] - m.h[j]));
    }
  }
  return worst;
}

describe('verify: GDD 03 App. E check 9 with the founding state `digging` (automatic expulsion)', () => {
  it('a free founding dig in `digging` expels onto one mound linked to the entrance; volume 1.25 x removed; opening clear', () => {
    const sim = makeTestSim({ seed: 3, behaviours: passiveBehaviours() });
    const bu = sim.world.bu;
    const col = sim.state.colonies[0];
    const queen = sim.stores.ants.get(col.queenId)!;
    expect((queen.flags & AntFlag.FOUNDING) !== 0).toBe(true);
    const nest0 = sim.stores.nests.get(col.nestIds[0])!;
    nest0.founding!.state = 'digging'; // the founding module's transition on the first bite (GDD 03 §13.2)
    navTo(sim, queen, { x: queen.pos.x + 20 * bu, y: queen.pos.y, z: queen.pos.z }, 1.5 * bu);
    for (let t = 0; t < 3000 && queen.nav.status === 'moving'; t++) sim.tick();
    let expelled = 0, pellets = 0;
    const off = sim.events.on('pellet-expelled', (e) => { expelled += e.volume; });
    const offP = sim.events.on('item-spawned' as never, () => { pellets++; });
    runFreeDig(sim, queen, { dir: { x: 1, z: 0 } });
    runTicks(sim, 60);
    off(); offP();
    const nests = colonyNests(sim, queen.colony);
    expect(nests.length).toBe(1);
    const nest = nests[0];
    expect(nest.entrances.length).toBe(1);
    const e = nest.entrances[0];
    expect(expelled).toBeGreaterThan(20);
    expect(sim.state.items.filter((it) => it.alive && it.kind === 'soil-pellet').length).toBe(0);
    // every expulsion of the founding dig lands on ONE pile, the entrance's mound
    const piles = nest.moundIds.map((id) => moundById(sim, id)!).filter((m) => m.material !== 'frass');
    expect(piles.length).toBe(1);
    expect(e.moundId).toBe(piles[0].id);
    const m = piles[0];
    // check 9: mound volume grew by 1.25 x removed (no loss to kept-clear cells or the grid edge)
    expect(Math.abs(moundVolume(sim, m) - BULKING * expelled) / (BULKING * expelled)).toBeLessThan(0.005);
    expect(pileOverOpenings(sim, m)).toEqual([]);
    expect(sim.field.isHoleAt(e.pos.x, e.pos.z)).toBe(true);
    expect(e.status).toBe('open');
  }, 240_000);
});

describe('verify: in-game batches only (no test-side settling), haulers dumping at random dump-ring angles', () => {
  it('GDD 03 App. E check 5: adjacent cells within 0.5 tan 38 + 0.01 BU, r_ent cells h = 0, volume 1.25 x within 0.5 %', () => {
    const { sim, queen } = freeDig(11);
    const bu = sim.world.bu;
    const nest = colonyNests(sim, queen.colony)[0];
    const e = nest.entrances[0];
    const m0 = e.moundId >= 0 ? moundById(sim, e.moundId) : undefined;
    const before = m0 ? moundVolume(sim, m0) : 0;
    const p = { x: 0, y: 0, z: 0 };
    for (let n = 0; n < 200; n++) {
      dumpPoint(sim, e, p);
      const it = spawnPellet(sim, p, PELLET, 'loam', nest.id, nest.colony, -1);
      placePellet(sim, it, { ...p });
    }
    runTicks(sim, 6000);
    const m = moundById(sim, e.moundId)!;
    const added = moundVolume(sim, m) - before;
    const lim = (0.5 * Math.tan((reposeDeg('loam') * Math.PI) / 180) + 0.01) * bu;
    const worst = worstAdjacent(sim, m);
    // log for the report
    console.log('check5', { added, expect: 200 * PELLET * BULKING, worstBu: worst / bu, limBu: lim / bu,
      spread: [3, 4.5, 6].map((r) => ringSpread(sim, e.pos.x, e.pos.z, r * bu).toFixed(3)) });
    expect(Math.abs(added - 200 * PELLET * BULKING) / (200 * PELLET * BULKING)).toBeLessThan(0.005);
    expect(worst).toBeLessThanOrEqual(lim);
    const { x0, z0 } = moundOrigin(m);
    for (let i = 0; i < m.h.length; i++) {
      const d = Math.hypot(x0 + (i % m.n) * m.cell - e.pos.x, z0 + Math.floor(i / m.n) * m.cell - e.pos.z);
      if (d <= e.radius) expect(m.h[i]).toBe(0);
    }
    expect(pileOverOpenings(sim, m)).toEqual([]);
    void MOUND_CLEAR_PAD_BU; void relax; void moundMask;
  }, 240_000);
});
