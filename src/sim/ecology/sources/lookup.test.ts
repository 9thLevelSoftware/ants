// colony-life round 12, direction 26a item 0: the source lookup grid is kept current incrementally instead of being
// rebuilt on the first query of every tick. Its answers must be exactly what a scan of the whole list gives, while
// sources are added, moved, killed and swept between and within ticks.

import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { createSource } from './spawn';
import { forEachSourceNear } from './lookup';
import { makeSourceSim } from './testkit';

function viaGrid(sim: Sim, x: number, z: number, r: number): number[] {
  const out: number[] = [];
  forEachSourceNear(sim, x, z, r, (s) => out.push(s.id));
  return out.sort((a, b) => a - b);
}

/** Every live source whose bucket square could hold it: the grid may return a little more (whole buckets), so
 * compare only the sources inside the query square, which both must agree on. */
function inSquare(sim: Sim, ids: number[], x: number, z: number, r: number): number[] {
  return ids.filter((id) => {
    const s = sim.stores.sources.get(id);
    return !!s && Math.abs(s.pos.x - x) <= r && Math.abs(s.pos.z - z) <= r;
  });
}

function viaScan(sim: Sim, x: number, z: number, r: number): number[] {
  return sim.stores.sources.list
    .filter((s) => s.alive && Math.abs(s.pos.x - x) <= r && Math.abs(s.pos.z - z) <= r)
    .map((s) => s.id).sort((a, b) => a - b);
}

describe('source lookup grid (incremental)', () => {
  it('answers as a full scan does through adds, moves, deaths and sweeps', () => {
    const sim = makeSourceSim({ sizeBu: 600 });
    const bu = sim.world.bu, size = sim.world.size;
    let seed = 12345;
    const rnd = (): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const at = (): { x: number; y: number; z: number } => ({ x: rnd() * size, y: 0, z: rnd() * size });
    for (let i = 0; i < 300; i++) createSource(sim, { variant: 'insect-small', pos: at() });
    let checks = 0;
    for (let t = 0; t < 120; t++) {
      // changes of one tick (several of each kind), then queries on the next tick (the grid syncs on a tick's first
      // query, as the full rebuild did, so a move made later in a tick shows from the next one)
      for (let k = 0; k < 4; k++) {
        const list = sim.stores.sources.list;
        const op = rnd();
        if (op < 0.35 && list.length > 0) { // move one in place (as reprojectSources does)
          const s = list[Math.floor(rnd() * list.length)];
          const p = at(); s.pos.x = p.x; s.pos.z = p.z;
        } else if (op < 0.6 && list.length > 0) { // kill one (not swept yet)
          sim.stores.sources.markDead(list[Math.floor(rnd() * list.length)].id);
        } else if (op < 0.8) {
          createSource(sim, { variant: 'insect-small', pos: at() });
        } else {
          sim.stores.sources.sweep(); // end-of-tick removal: list order changes
        }
      }
      sim.state.tick += 1;
      for (let q = 0; q < 3; q++) {
        const c = at(), r = (20 + rnd() * 120) * bu;
        expect(inSquare(sim, viaGrid(sim, c.x, c.z, r), c.x, c.z, r)).toEqual(viaScan(sim, c.x, c.z, r));
        checks++;
      }
    }
    expect(checks).toBe(360);
  });
});
