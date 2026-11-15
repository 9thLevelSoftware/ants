// Read-outs the first-playable scripts need (gate 1B, tests/e2e/firstplay.mjs and friends), registered under
// `__game.query.*` through registerQuery: food sources, the colony's trail scent at a point, the colony's counters
// and a screen-independent "is this point in the camera's view" test. Plain data only; nothing here writes state.
import type { Vec3 } from '@/core';
import type { Sim } from '@/sim/types';
import { registerQuery } from './query';

const v3 = (p: Vec3) => ({ x: p.x, y: p.y, z: p.z });

export function registerGateQueries(): void {
  /** Alive food sources: id, kind, surface point, units and liquid pool. */
  registerQuery('sources', (sim: Sim) => sim.state.sources.filter((s) => s.alive).map((s) => ({
    id: s.id, kind: s.kind, variant: s.variant, pos: v3(s.pos), units: s.units, pool: s.pool, poolCap: s.poolCap,
  })));
  /** Alive brood of the player colony: id, stage, position (mm). */
  registerQuery('broodList', (sim: Sim) => sim.state.brood.filter((b) => b.alive && b.colony === (sim.state.colonies[0]?.id ?? -1))
    .map((b) => ({ id: b.id, stage: b.stage, pos: v3(b.pos), carriedBy: b.carriedBy })));
  /** Trail (or another channel's) scent of the player colony at a point. */
  registerQuery('scent', (sim: Sim, ...a: unknown[]) => {
    const [x, y, z, channel] = a as [number, number, number, 'trail' | 'home' | 'alarm' | undefined];
    const col = sim.state.colonies[0]?.id ?? -1;
    return sim.phero.sample(col, channel ?? 'trail', { x, y, z });
  });
  /** Player-colony counters for growth checks: adults by caste, brood, stores, deliveries. */
  registerQuery('growth', (sim: Sim) => {
    const col = sim.state.colonies[0];
    if (!col) return null;
    const castes: Record<string, number> = {};
    for (const a of sim.state.ants) if (a.alive && a.colony === col.id) castes[a.caste] = (castes[a.caste] ?? 0) + 1;
    let brood = 0;
    for (const b of sim.state.brood) if (b.alive && b.colony === col.id) brood++;
    const deliveries = Object.values(col.core?.pop?.intakeByKind ?? {}).reduce((n, r) => n + r.n, 0);
    return { tick: sim.state.tick, castes, brood, stores: { c: col.stores.c, p: col.stores.p }, deliveries };
  });
  /**
   * Places for the visual sweep near the queen's start: beside the largest primitive, among plants, inside the
   * interior zone (if any) and at the map edge. Ground points, mm; null when the world has none.
   */
  registerQuery('sweepSpots', (sim: Sim) => {
    const w = sim.world, bu = w.bu, start = w.queenStart.pos;
    const groundAt = (x: number, z: number) => ({ x, y: sim.field.height(x, z), z });
    const near = (p: Vec3, r: number) => Math.hypot(p.x - start.x, p.z - start.z) <= r;
    const big = w.prims.filter((p) => near(p.pos, 400 * bu) && p.size.y > 10 * bu)
      .sort((a, b) => b.size.x * b.size.y * b.size.z - a.size.x * a.size.y * a.size.z)[0];
    const prop = big ? groundAt(big.pos.x + (Math.max(big.size.x, big.size.z) + 4 * bu), big.pos.z) : null;
    const plant = w.prims.filter((p) => (p.material === 'plant' || p.material === 'leaf') && near(p.pos, 300 * bu))
      .sort((a, b) => Math.hypot(a.pos.x - start.x, a.pos.z - start.z) - Math.hypot(b.pos.x - start.x, b.pos.z - start.z))[0];
    const plants = plant ? groundAt(plant.pos.x + 3 * bu, plant.pos.z + 3 * bu) : null;
    const zone = w.zones.find((z) => z.type === 'interior' && z.rects.length > 0);
    const r = zone?.rects[0];
    const interior = r ? groundAt((r[0] + r[2]) / 2, (r[1] + r[3]) / 2) : null;
    const edge = groundAt(Math.min(w.size - 12 * bu, Math.max(12 * bu, start.x)), w.size - 12 * bu);
    // under a raised body (a parked car, a bench): the largest upright box whose underside clears the ground
    const raised = w.prims.filter((p) => p.shape === 'box' && near(p.pos, 1500 * bu) && p.size.x > 20 * bu && p.size.z > 20 * bu
      && p.pos.y - p.size.y - sim.field.height(p.pos.x, p.pos.z) > 3 * bu)
      .sort((a, b) => b.size.x * b.size.z - a.size.x * a.size.z)[0];
    const under = raised ? groundAt(raised.pos.x, raised.pos.z) : null;
    return { start: v3(start), prop, propSize: big ? v3(big.size) : null, plants, interior, edge, under, bu, size: w.size };
  });
}
