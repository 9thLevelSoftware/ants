// Review of task opening-fix (D42: the mound mask's hole probe reads f without the pile overlays,
// WorldField.withoutOverlays, and the mask's cache key follows dynamic primitives near the grid).
import { describe, expect, it } from 'vitest';
import type { Primitive } from '@/sim/types';
import { PrimFlag } from '@/sim/types';
import { heightAt } from '@/sim/world/terrainSample';
import { carveCapsule } from './carveOps';
import { moundMask } from './moundRelax';
import { createMound, publishMound } from './mounds';
import { nestSim, playerNest } from './nestTestKit';
import { nestRuntime } from './runtime';

/** A mound on flat ground beside an open pit (as moundMaskLip.test.ts), its mask built. */
function pitScene() {
  const sim = nestSim({ nest: 'none', seed: 1 });
  const bu = sim.world.bu, c = sim.world.size / 2;
  const ground = sim.field.height(c, c);
  const m = createMound(sim, playerNest(sim), null, c, c, 'loam');
  sim.carve.breaches.length = 0;
  const p = { x: c + 3.3 * bu, y: ground, z: c - 2.1 * bu };
  carveCapsule(sim, { ...p, y: ground - 4 * bu }, { ...p, y: ground + bu }, 1.4 * bu);
  sim.carve.breaches.push({ pos: { ...p }, r: 1.4 * bu });
  nestRuntime(sim).moundMasks.delete(m.id);
  return { sim, m, bu, p, ground };
}

const holes = (clear: Uint8Array) => Array.from(clear).filter((v) => v === 2).length;

describe('mound mask, wide restore-exact probe (opening-fix review)', () => {
  it('a published pile changes field heights but not the mask; withoutOverlays hides it only inside fn', () => {
    const { sim, m, bu, p } = pitScene();
    const before = Array.from(moundMask(sim, m).clear);
    for (let i = 0; i < m.n * m.n; i++) m.h[i] = 1.5 * bu;
    publishMound(sim, m);
    const terrain = heightAt(sim.world.terrain, p.x + 2 * bu, p.z);
    const withPile = sim.field.height(p.x + 2 * bu, p.z);
    expect(withPile).toBeGreaterThan(terrain + 0.5 * bu);
    const inside = sim.field.withoutOverlays((o) => o.id === m.id, () => sim.field.height(p.x + 2 * bu, p.z));
    expect(inside).toBeCloseTo(terrain, 6);
    expect(sim.field.height(p.x + 2 * bu, p.z)).toBe(withPile); // put back
    nestRuntime(sim).moundMasks.delete(m.id);
    expect(Array.from(moundMask(sim, m).clear)).toEqual(before);
  });

  it('withoutOverlays puts the overlays back when fn throws', () => {
    const { sim, m, bu, p } = pitScene();
    for (let i = 0; i < m.n * m.n; i++) m.h[i] = 1.5 * bu;
    publishMound(sim, m);
    const h0 = sim.field.height(p.x + 2 * bu, p.z);
    expect(() => sim.field.withoutOverlays(() => true, () => { throw new Error('probe'); })).toThrow('probe');
    expect(sim.field.height(p.x + 2 * bu, p.z)).toBe(h0);
  });

  it('a dynamic primitive put over the pit changes the cached mask, and taking it away restores it', () => {
    const { sim, m, bu, p, ground } = pitScene();
    const before = Array.from(moundMask(sim, m).clear);
    expect(holes(moundMask(sim, m).clear)).toBeGreaterThan(0);
    // a solid slab filling the pit's top (an object a person sets down; the probe's f is negative inside it)
    const slab: Primitive = {
      id: sim.state.nextId++, shape: 'box', pos: { x: p.x, y: ground - 1 * bu, z: p.z }, rot: { x: 0, y: 0, z: 0, w: 1 },
      size: { x: 4 * bu, y: 1.5 * bu, z: 4 * bu }, round: 0, material: 'plastic', flags: PrimFlag.DYNAMIC, objectId: -1, tint: 0,
    } as Primitive;
    sim.state.worldDelta.dynPrims.push(slab);
    sim.kernel.addPrim(slab);
    const covered = Array.from(moundMask(sim, m).clear); // no manual cache drop: the key must follow the object
    expect(holes(Uint8Array.from(covered))).toBeLessThan(holes(Uint8Array.from(before)));
    sim.state.worldDelta.dynPrims.pop();
    sim.kernel.removePrim(slab.id);
    expect(Array.from(moundMask(sim, m).clear)).toEqual(before);
  });
});
