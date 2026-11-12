// sim-fix-colony item 1: tight plan bounds, the acceptPlan command, the seeded plan cache, incremental nav
// components and kept nav fields.
import { describe, expect, it } from 'vitest';
import type { DigPlan, PlanSpec } from '@/sim/types';
import { nestFieldId } from '@/sim/types';
import { rngFork, rngRange } from '@/core/rng';
import { createNestNav } from './nav/nestNav';
import { buildGeometry, planG, type PlanGeometry } from './plans/geometry';
import { draftPlan } from './plans/resolve';
import { planById } from './plans/plans';
import { planCache } from './plans/targets';
import { nestRuntime } from './runtime';
import { createPlan } from './index';
import { nestSim, playerNest, runTicks } from './nestTestKit';
import { refreshNestFields } from './navFields';

const BU = 4;

/** Extent of the samples with g > 0 (scanned in a generous box around the geometry's own bounds), mm. */
function sampleExtent(g: PlanGeometry, v: number) {
  const pad = 6 * BU;
  const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (let k = Math.floor((g.min.z - pad) / v); k <= Math.ceil((g.max.z + pad) / v); k++)
    for (let j = Math.floor((g.min.y - pad) / v); j <= Math.ceil((g.max.y + pad) / v); j++)
      for (let i = Math.floor((g.min.x - pad) / v); i <= Math.ceil((g.max.x + pad) / v); i++) {
        if (planG(g, i * v, j * v, k * v) <= 0) continue;
        min.x = Math.min(min.x, i * v); min.y = Math.min(min.y, j * v); min.z = Math.min(min.z, k * v);
        max.x = Math.max(max.x, i * v); max.y = Math.max(max.y, j * v); max.z = Math.max(max.z, k * v);
      }
  return { min, max };
}

function plan(kind: DigPlan['kind'], extra: Partial<DigPlan> & { yawDeg?: number } = {}): DigPlan {
  const anchor = { pos: { x: 400, y: -80, z: 400 }, normal: { x: 0, y: 0, z: -1 } };
  const spec: PlanSpec = { nestId: 1, kind, anchor, priority: 'normal', confirmWarnings: true };
  const p = draftPlan({ id: 1 } as never, spec, {
    anchor, size: kind === 'chamber' ? 'm' : null,
    geom: { end: null, bend: null, length: 0, yawDeg: extra.yawDeg ?? 0, surfacePoint: null },
  });
  return { ...p, chamberType: kind === 'chamber' ? 'nursery' : null, ...extra };
}

describe('tight plan bounds (sim-fix-colony 1)', () => {
  const v = 0.5 * BU;
  const cases: [string, DigPlan][] = [
    ['chamber yaw 0', plan('chamber', { yawDeg: 0 })],
    ['chamber yaw 30', plan('chamber', { yawDeg: 30 })],
    ['chamber yaw 45', plan('chamber', { yawDeg: 45 })],
    ['chamber yaw 90', plan('chamber', { yawDeg: 90 })],
    ['chamber yaw 137 with 2 pillars', { ...plan('chamber', { yawDeg: 137 }), geom: { end: null, bend: null, length: 2, yawDeg: 137, surfacePoint: null } }],
    ['bent tunnel', { ...plan('tunnel'), geom: { end: { x: 460, y: -70, z: 380 }, bend: { x: 430, y: -82, z: 420 }, length: 20, yawDeg: 0, surfacePoint: null } }],
    ['shaft', { ...plan('shaft'), geom: { end: { x: 404, y: -10, z: 398 }, bend: null, length: 17, yawDeg: 0, surfacePoint: null } }],
    ['entrance', { ...plan('entrance'), geom: { end: null, bend: null, length: 10, yawDeg: 0, surfacePoint: { x: 420, y: 0, z: 410 } } }],
  ];
  it.each(cases)('%s: the box holds every g > 0 sample and lies within one voxel of their extent', (_name, p) => {
    const g = buildGeometry(p, 'lasius-niger', BU)!;
    expect(g).not.toBeNull();
    const e = sampleExtent(g, v);
    for (const ax of ['x', 'y', 'z'] as const) {
      expect(g.min[ax]).toBeLessThanOrEqual(e.min[ax] + 1e-6);
      expect(g.max[ax]).toBeGreaterThanOrEqual(e.max[ax] - 1e-6);
      expect(e.min[ax] - g.min[ax]).toBeLessThanOrEqual(v + 1e-6);
      expect(g.max[ax] - e.max[ax]).toBeLessThanOrEqual(v + 1e-6);
    }
  });

  it('a yawed nursery m box is far smaller than its bounding cube (about 4.75 x before)', () => {
    const g = buildGeometry(plan('chamber', { yawDeg: 0 }), 'lasius-niger', BU)!;
    const box = (g.max.x - g.min.x) * (g.max.y - g.min.y) * (g.max.z - g.min.z);
    const r = Math.max(g.ellipsoid!.hw, g.ellipsoid!.hh, g.ellipsoid!.hl);
    expect(box).toBeLessThan((2 * r) ** 3 / 3);
  });
});

/** A straight 2 BU tunnel at 20 BU depth through the world centre (the plans.test.ts set-up). */
function tunnelNest() {
  const sim = nestSim({});
  const c = sim.world.size / 2, y = -20 * BU;
  sim.kernel.carveCapsule({ x: c - 10 * BU, y, z: c }, { x: c + 10 * BU, y, z: c }, BU, { force: true });
  const nest = playerNest(sim, { x: c, y, z: c });
  return { sim, nest, c, y };
}

const nursery = (nestId: number, c: number, y: number): PlanSpec => ({
  nestId, kind: 'chamber', chamberType: 'nursery', size: 'm',
  anchor: { pos: { x: c, y: y - 0.5 * BU, z: c + BU }, normal: { x: 0, y: 0, z: -1 } }, priority: 'normal', confirmWarnings: true,
});

describe('acceptPlan (GDD 03 App. B, §7.8)', () => {
  it('queues a proposed architect plan at once and refuses anything else', () => {
    const { sim, nest, c, y } = tunnelNest();
    nest.architect.mode = 'suggest';
    const id = createPlan(sim, nursery(nest.id, c, y), 'architect');
    expect(id).toBeGreaterThan(0);
    expect(planById(sim, id)!.plan.status).toBe('proposed');
    runTicks(sim, 400); // suggest: no automatic queueing
    expect(planById(sim, id)!.plan.status).toBe('proposed');
    const rejected: string[] = [];
    sim.events.on('command-rejected', (e) => { if (e.commandType === 'acceptPlan') rejected.push(e.reason); });
    sim.enqueue({ type: 'acceptPlan', planId: id });
    runTicks(sim, 1);
    expect(planById(sim, id)!.plan.status).toBe('queued');
    sim.enqueue({ type: 'acceptPlan', planId: id }); // no longer a proposal
    sim.enqueue({ type: 'acceptPlan', planId: 987654 });
    runTicks(sim, 1);
    expect(rejected).toEqual(['not-a-proposal', 'not-a-proposal']);
  });
});

describe('plan cache seeded by validation', () => {
  it('equals the cache rebuilt from the plan record', () => {
    const { sim, nest, c, y } = tunnelNest();
    const id = createPlan(sim, nursery(nest.id, c, y), 'player');
    const p = planById(sim, id)!.plan;
    const seeded = planCache(sim, nest, p)!;
    nestRuntime(sim).geom.delete(id);
    const rebuilt = planCache(sim, nest, p)!;
    expect(seeded).not.toBe(rebuilt);
    expect(seeded.targets).toEqual(rebuilt.targets);
    expect(seeded.sphereTargets).toEqual(rebuilt.sphereTargets);
    expect(seeded.sphereNonDig).toEqual(rebuilt.sphereNonDig);
    expect(seeded.geometry.min).toEqual(rebuilt.geometry.min);
  });
});

describe('incremental nest nav (sim-fix-colony 1)', () => {
  it('components after openings match a full recompute (same partition of sample points)', () => {
    const { sim, c, y } = tunnelNest();
    const rng = rngFork(7, 'components');
    const probes: { x: number; y: number; z: number }[] = [];
    sim.nestNav.componentAt({ x: c, y, z: c }); // labels computed once, then kept up to date
    for (let n = 0; n < 40; n++) {
      const p = { x: c + rngRange(rng, -14, 14) * BU, y: y + rngRange(rng, -6, 6) * BU, z: c + rngRange(rng, -14, 14) * BU };
      sim.kernel.carveSphere(p, rngRange(rng, 0.6, 1.6) * BU, { force: true });
      probes.push(p);
      sim.nestNav.componentAt(p);
    }
    const fresh = createNestNav(sim.carve);
    const a = probes.map((p) => sim.nestNav.componentAt(p)), b = probes.map((p) => fresh.componentAt(p));
    for (let i = 0; i < probes.length; i++) for (let j = 0; j < probes.length; j++) {
      expect(a[i] === a[j]).toBe(b[i] === b[j]);
      expect(a[i] < 0).toBe(b[i] < 0);
    }
    fresh.dispose();
  });

  it('re-registering a nest keeps unchanged fields (no rebuild) and their distances stay exact', () => {
    const { sim, nest, c, y } = tunnelNest();
    nest.chambers.length = 0;
    nest.entrances.length = 0;
    nest.digPlans.length = 0;
    refreshNestFields(sim, nest);
    const id = nestFieldId(nest.id, { kind: 'plan', id: 1 });
    sim.nestNav.setTarget(id, { points: [{ x: c, y, z: c }], radius: BU });
    const p = { x: c + 8 * BU, y, z: c };
    const d0 = sim.nestNav.distanceAt(id, p);
    const rebuilds = sim.nestNav.stats().rebuilds;
    sim.nestNav.setTarget(id, { points: [{ x: c, y, z: c }], radius: BU }); // same seeds: kept
    expect(sim.nestNav.distanceAt(id, p)).toBe(d0);
    expect(sim.nestNav.stats().rebuilds).toBe(rebuilds);
    sim.kernel.carveCapsule({ x: c, y, z: c + 2 * BU }, { x: c + 8 * BU, y, z: c + 2 * BU }, BU, { force: true });
    const inc = sim.nestNav.distanceAt(id, p);
    const fresh = createNestNav(sim.carve);
    fresh.setTarget(id, { points: [{ x: c, y, z: c }], radius: BU });
    expect(inc).toBeCloseTo(fresh.distanceAt(id, p), 9);
    fresh.dispose();
  });
});
