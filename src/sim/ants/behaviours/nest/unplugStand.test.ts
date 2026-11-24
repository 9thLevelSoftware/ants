// winter-sugar A3 (opening-fix review finding 2): the unplug stand point. With a wide mouth the old point (e.radius +
// UNPLUG_STAND_BU down the throat axis) lay inside the soil of the plugged throat, so a digger coming up from the
// cell failed its walk at once and was barred from unplugging for UNPLUG_RETRY_S (headless seed 4: the second digger
// reached the plug at +719 instead of +103). Now she stands at the plug's free face on her side, and a walk that
// fails against the plug itself bars her from nothing.
import { describe, expect, it } from 'vitest';
import type { Entrance, Nest, Sim } from '@/sim/types';
import { VoxelFlag } from '@/sim/types';
import { evaluateEntrance, plugCount, sealEntranceImpl } from '@/sim/nest/entrances';
import { nestRuntime } from '@/sim/nest/runtime';
import { OPEN_MIN } from '@/sim/nest/carve/keys';
import { makeNestColony, run } from './testkit';

/** The small test nest's entrance widened to `radiusBu` and plugged by seal-entrance until sealed, then `reopening`. */
function pluggedColony(radiusBu: number, workers: number) {
  const k = makeNestColony({ workers, stores: { c: 60, p: 30 } });
  const { sim, nest, entrance: e } = k;
  e.radius = radiusBu * sim.world.bu;
  evaluateEntrance(sim, nest, e);
  for (let i = 0; i < 60 && e.status !== 'sealed'; i++) sealEntranceImpl(sim, e.id, -1);
  expect(e.status).toBe('sealed');
  // the hand-over's reopen (founding/reopen.ts): the sealed throat becomes `reopening`, the plug is the diggers' job
  e.status = 'reopening';
  evaluateEntrance(sim, nest, e);
  return { ...k, e };
}

/** Closed PLUG samples left in the throat (plugCount, the entrance record's count). */
const plugLeft = (sim: Sim, e: Entrance) => plugCount(sim, e);

/** The unplug diggers of one run: who entered dig.unplug, who bit, who was barred (bb bn.uu), until open. */
function watchUnplug(sim: Sim, nest: Nest, e: Entrance, ticks: number) {
  const entered = new Map<number, number>(), bit = new Map<number, number>(), barred = new Set<number>();
  let openAt = -1;
  for (let t = 1; t <= ticks; t++) {
    run(sim, 1);
    for (const a of sim.stores.ants.list) {
      if (!a.alive || a.colony !== nest.colony) continue;
      if (a.state === 'dig.unplug' && !entered.has(a.id)) entered.set(a.id, t);
      if (a.action?.id === 'unseal-entrance' && !bit.has(a.id)) bit.set(a.id, t);
      if ((a.bb['bn.uu'] ?? 0) > sim.state.tick) barred.add(a.id);
    }
    if (e.status === 'open') { openAt = t; break; }
  }
  return { entered, bit, barred, openAt };
}

describe('unplug stand point (winter-sugar A3)', () => {
  // before A3 the throat was still `reopening` after 4000 ticks (the digger's stand point lay in the throat's soil)
  it('a wide plugged mouth: every digger that comes to the plug bites it, none is barred, and it opens', () => {
    const { sim, nest, e } = pluggedColony(1.9, 6);
    const plug0 = plugLeft(sim, e);
    expect(plug0).toBeGreaterThan(20);
    const w = watchUnplug(sim, nest, e, 4000);
    expect(w.entered.size).toBeGreaterThanOrEqual(1);
    // each digger bites within the time a walk up the shaft takes (before A3 the cell's digger never bit: barred)
    for (const [id, t] of w.entered) expect(w.bit.get(id) ?? Infinity, `ant ${id}`).toBeLessThanOrEqual(t + 300);
    expect([...w.barred]).toEqual([]);
    expect(w.openAt).toBeGreaterThan(0);
  }, 120_000);

  it('the stand point is free space touching the plug, inside the unseal throat test (the default mouth too)', async () => {
    const { unplugStandPoint } = await import('@/sim/nest/entrances');
    const { SEAL_THROAT_BU } = await import('@/sim/balance/actions');
    const { SLOT_STALL_ACCEPT_BU } = await import('@/sim/balance/nestwork');
    for (const r of [1.25, 1.9]) {
      const { sim, e, royal } = pluggedColony(r, 0);
      const bu = sim.world.bu, v = sim.carve.voxel, flags = nestRuntime(sim).flags;
      const out = { x: 0, y: 0, z: 0 };
      const reach = SEAL_THROAT_BU * bu + e.radius - SLOT_STALL_ACCEPT_BU * bu;
      expect(unplugStandPoint(sim, e, royal.center, reach, out)).toBe(true);
      expect(sim.field.sample(out)).toBeGreaterThan(0);
      const i = Math.round(out.x / v), j = Math.round(out.y / v), k = Math.round(out.z / v);
      const closedPlug = (a: number, b: number, c: number) => (flags.get(a, b, c) & VoxelFlag.PLUG) !== 0 && sim.carve.sampleAt(a, b, c) < OPEN_MIN;
      expect(closedPlug(i, j, k)).toBe(false);
      expect([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].some(([a, b, c]) => closedPlug(i + a, j + b, k + c))).toBe(true);
      expect(Math.hypot(out.x - e.pos.x, out.y - e.pos.y, out.z - e.pos.z)).toBeLessThanOrEqual(reach + 1e-6);
      // from the cell it is the plug's underside: below the opening
      expect((out.x - e.pos.x) * e.dir.x + (out.y - e.pos.y) * e.dir.y + (out.z - e.pos.z) * e.dir.z).toBeLessThan(0);
    }
  }, 60_000);
});
