// Independent review of nest-fix3 item 3 (mound mask cache keyed on breach positions and radii near the grid):
// a breach whose radius changes in place, and a breach far off the grid replaced by one on it (same count both
// times), must both give the mask a fresh build gives; a breach change far off the grid keeps the cached entry.
import { describe, expect, it } from 'vitest';
import { carveCapsule } from './carveOps';
import { moundMask } from './moundRelax';
import { createMound } from './mounds';
import { nestSim, playerNest } from './nestTestKit';
import { nestRuntime } from './runtime';

function setup() {
  const sim = nestSim({ nest: 'none', seed: 1 });
  const bu = sim.world.bu, c = sim.world.size / 2;
  const ground = sim.field.height(c, c);
  const m = createMound(sim, playerNest(sim), null, c, c, 'loam');
  const a = { x: c - 6 * bu, y: ground, z: c };
  carveCapsule(sim, { ...a, y: ground - 4 * bu }, { ...a, y: ground + bu }, 1.5 * bu);
  sim.carve.breaches.length = 0;
  return { sim, m, a, bu, c };
}

function fresh(sim: ReturnType<typeof setup>['sim'], id: number, m: Parameters<typeof moundMask>[1]) {
  nestRuntime(sim).moundMasks.delete(id);
  return moundMask(sim, m);
}

describe('review nest-fix3 item 3: mound mask cache', () => {
  it('a breach whose radius changes in place: cached mask equals a fresh build', () => {
    const { sim, m, a, bu } = setup();
    sim.carve.breaches.push({ pos: { ...a }, r: 0.25 * bu });
    moundMask(sim, m);
    sim.carve.breaches[0] = { pos: { ...a }, r: 1.5 * bu };
    const cached = moundMask(sim, m);
    const built = fresh(sim, m.id, m);
    expect(Array.from(cached.clear)).toEqual(Array.from(built.clear));
    expect(Array.from(cached.cap)).toEqual(Array.from(built.cap));
  });

  it('a breach far off the grid replaced by one on it: cached mask equals a fresh build', () => {
    const { sim, m, a, bu, c } = setup();
    sim.carve.breaches.push({ pos: { x: c + 400 * bu, y: a.y, z: c }, r: bu });
    const before = moundMask(sim, m);
    sim.carve.breaches[0] = { pos: { ...a }, r: bu };
    const cached = moundMask(sim, m);
    const built = fresh(sim, m.id, m);
    expect(Array.from(cached.clear)).toEqual(Array.from(built.clear));
    expect(Array.from(before.clear)).not.toEqual(Array.from(built.clear)); // the change mattered
  });

  it('a breach change far off the grid keeps the cached mask (no rebuild)', () => {
    const { sim, m, a, bu, c } = setup();
    sim.carve.breaches.push({ pos: { ...a }, r: bu }, { pos: { x: c + 400 * bu, y: a.y, z: c }, r: bu });
    const first = moundMask(sim, m);
    sim.carve.breaches[1] = { pos: { x: c - 400 * bu, y: a.y, z: c }, r: 2 * bu };
    expect(moundMask(sim, m)).toBe(first);
  });
});
