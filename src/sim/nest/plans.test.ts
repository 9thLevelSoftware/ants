// Dig plans (GDD 03 §7; App. E checks 11-13, 15, 16; acceptance 6 and 7): validation, expansion, the frontier and
// its claims, completion into a chamber of the planned type and size, stalls, cancel.
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/math/vec3';
import type { Ant, MaterialId, PlanSpec, Primitive, Sim } from '@/sim/types';
import { removeItem } from '@/sim/entities';
import { detectNestChambers } from './chambers/upkeep';
import { cancelPlan, claimDigSite, createPlan, digBite, planDigAim, releaseDigSite, validatePlan } from './index';
import { nestSim, placeWorker, playerNest, runTicks, setMoisture } from './nestTestKit';
import { planById } from './plans/plans';
import { antSlot, slotSphere } from './plans/frontier';
import { validatePlanImpl } from './plans/validate';

const BU = 4;

/** A straight 2 BU tunnel at `depth` BU along x through the world centre; the nest is established there. */
function tunnelNest(opts: { material?: MaterialId; moisture?: number; depth?: number; prims?: Primitive[] } = {}) {
  const sim = nestSim({ material: opts.material, moisture: opts.moisture, prims: opts.prims });
  const c = sim.world.size / 2, y = -(opts.depth ?? 20) * BU;
  sim.kernel.carveCapsule({ x: c - 10 * BU, y, z: c }, { x: c + 10 * BU, y, z: c }, BU, { force: true });
  const nest = playerNest(sim, { x: c, y, z: c });
  return { sim, nest, c, y };
}

function nurserySpec(nestId: number, c: number, y: number, size: 'm' | 's' = 'm'): PlanSpec {
  return {
    nestId, kind: 'chamber', chamberType: 'nursery', size,
    anchor: { pos: { x: c, y: y - 0.5 * BU, z: c + BU }, normal: { x: 0, y: 0, z: -1 } }, priority: 'normal', confirmWarnings: false,
  };
}

describe('plan validation', () => {
  it('check 11: a nursery m on a tunnel wall at depth 20 BU validates with 135 +- 10 BU^3', () => {
    const { sim, nest, c, y } = tunnelNest();
    const v = validatePlan(sim, nurserySpec(nest.id, c, y));
    expect(v.codes).toEqual([]);
    expect(v.ok).toBe(true);
    expect(Math.abs(v.targetVolume - 135)).toBeLessThanOrEqual(10);
  });

  it('check 12: in sand the same plan is unstable at moisture 0.05 and accepted at 0.5', () => {
    const dry = tunnelNest({ material: 'sand', moisture: 0.05 });
    expect(validatePlan(dry.sim, nurserySpec(dry.nest.id, dry.c, dry.y)).codes).toContain('unstable');
    const moist = tunnelNest({ material: 'sand', moisture: 0.5 });
    expect(validatePlan(moist.sim, nurserySpec(moist.nest.id, moist.c, moist.y)).ok).toBe(true);
  });

  it('check 13 / acceptance 7: 1.5 BU from another chamber: architect refused too-close, player only with confirmation', () => {
    const { sim, nest, c, y } = tunnelNest();
    // the room will be centred about 7 BU into +z; a cavity 1.5 BU beyond its far wall (z + 3 + 8 + 1.5)
    sim.kernel.carveCapsule({ x: c - 4 * BU, y, z: c + 13.5 * BU }, { x: c + 4 * BU, y, z: c + 13.5 * BU }, BU, { force: true });
    const spec = nurserySpec(nest.id, c, y);
    const arch = validatePlanImpl(sim, spec, 'architect');
    expect(arch.ok).toBe(false);
    expect(arch.codes).toContain('too-close');
    const player = validatePlan(sim, spec);
    expect(player.ok).toBe(true);
    expect(player.warnings).toContain('too-close');
    expect(createPlan(sim, spec, 'player')).toBe(-1);
    const id = createPlan(sim, { ...spec, confirmWarnings: true }, 'player');
    expect(id).toBeGreaterThan(0);
    expect(planById(sim, id)!.plan.warnings).toContain('too-close');
  });

  it('acceptance 7: plans into non-diggable material and anchors outside the nest are refused with a reason', () => {
    const size = 128 * BU, c = size / 2;
    const slab: Primitive = {
      id: 1, shape: 'box', pos: { x: c, y: -20 * BU, z: c + 8 * BU }, rot: { x: 0, y: 0, z: 0, w: 1 },
      size: { x: 8 * BU, y: 4 * BU, z: 6 * BU }, round: 0, material: 'concrete', flags: 0, objectId: -1,
    };
    const { sim, nest, y } = tunnelNest({ prims: [slab] });
    expect(validatePlan(sim, nurserySpec(nest.id, c, y)).codes).toEqual(['non-diggable']);
    const away = { ...nurserySpec(nest.id, c, y), anchor: { pos: { x: c, y: -40 * BU, z: c + 30 * BU }, normal: { x: 0, y: 0, z: -1 } } };
    expect(validatePlan(sim, away).codes).toEqual(['anchor-not-in-nest']);
    expect(validatePlan(sim, { ...nurserySpec(nest.id, c, y), chamberType: 'granary' }).codes).toEqual(['type-not-allowed']);
  });
});

/** Diggers bite at their slots until the plan is complete (or `maxTicks`); records every claim. */
function digPlan(sim: Sim, planId: number, diggers: Ant[], maxTicks: number): { claims: [number, number][]; bites: number } {
  const claims: [number, number][] = [];
  let bites = 0;
  const heading: Vec3 = { x: 0, y: 0, z: 0 };
  for (let t = 0; t < maxTicks; t++) {
    const found = planById(sim, planId)!;
    if (found.plan.status === 'complete') break;
    for (const ant of diggers) {
      if (!antSlot(sim, ant)) {
        if (!claimDigSite(sim, ant)) continue;
        const ref = antSlot(sim, ant)!;
        const s = slotSphere(ref.plan, ref.idx);
        // a claim is never on a finished sphere, and its slot is held by nobody else
        expect(ref.plan.spheres[s].done).toBe(false);
        expect(ref.plan.slots.filter((x) => x.antId === ant.id).length).toBe(1);
        claims.push([ant.id, s]);
      }
      const ref = antSlot(sim, ant)!;
      // the dig behaviour walks to the slot; here the digger is put there
      ant.pos = { ...ref.slot.pos };
      const feet = { ...ref.slot.pos };
      const slope = planDigAim(sim, ant, feet, heading);
      if (slope === null) { releaseDigSite(sim, ant); continue; }
      const res = digBite(sim, ant, feet, heading, Math.max(-80, Math.min(80, slope)));
      if (res.pelletId >= 0) removeItem(sim, res.pelletId, 'test');
      if (res.ok) bites++;
    }
    sim.tick();
  }
  return { claims, bites };
}

describe('plan frontier and completion', () => {
  it('acceptance 6: a chamber plan expands to spheres; claims never share a slot or reuse a sphere; it completes into a nursery of its size', () => {
    const { sim, nest, c, y } = tunnelNest();
    const id = createPlan(sim, { ...nurserySpec(nest.id, c, y), confirmWarnings: true }, 'player');
    expect(id).toBeGreaterThan(0);
    const { plan } = planById(sim, id)!;
    expect(plan.spheres.length).toBeGreaterThan(20);
    expect(plan.window.length).toBeGreaterThan(0);
    expect(plan.slots.length).toBeGreaterThan(0);
    const diggers = [0, 1, 2, 3].map((n) => placeWorker(sim, { x: c - 4 * BU + n * 2 * BU, y, z: c }, { x: 0, y: 0, z: 1 }, nest.id));
    const { claims } = digPlan(sim, id, diggers, 3000);
    expect(plan.status).toBe('complete');
    expect(claims.length).toBeGreaterThan(diggers.length);
    // claims moved on through the spheres: no digger was handed the same sphere twice in a row
    for (let n = 1; n < claims.length; n++) {
      const prev = claims.slice(0, n).reverse().find(([a]) => a === claims[n][0]);
      if (prev) expect(prev[1]).not.toBe(claims[n][1]);
    }
    // the registered chamber: planned type, size of the planned ellipsoid (8 x 2.5 x 12 = 125.7 BU^3)
    const room = nest.chambers.find((ch) => ch.type === 'nursery');
    expect(room).toBeDefined();
    expect(Math.abs(room!.volume - 125.7) / 125.7).toBeLessThan(0.15);
    // and detection keeps it (same id, same type)
    detectNestChambers(sim, nest);
    const again = nest.chambers.find((ch) => ch.id === room!.id);
    expect(again?.type).toBe('nursery');
    expect(Math.abs(again!.volume - 125.7) / 125.7).toBeLessThan(0.15);
  });

  it('two diggers never hold the same slot at the same time', () => {
    const { sim, nest, c, y } = tunnelNest();
    const id = createPlan(sim, { ...nurserySpec(nest.id, c, y, 's'), confirmWarnings: true }, 'player');
    const diggers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => placeWorker(sim, { x: c - 5 * BU + n * BU, y, z: c }, { x: 0, y: 0, z: 1 }, nest.id));
    for (const a of diggers) claimDigSite(sim, a);
    const { plan } = planById(sim, id)!;
    const held = plan.slots.filter((s) => s.antId >= 0).map((s) => s.antId);
    expect(new Set(held).size).toBe(held.length);
    expect(held.length).toBe(plan.slots.length);
    expect(diggers.filter((a) => antSlot(sim, a)).length).toBe(plan.slots.length);
  });

  it('check 15: a queued plan nobody digs stalls with no-diggers within 150 ticks', () => {
    const { sim, nest, c, y } = tunnelNest();
    const id = createPlan(sim, { ...nurserySpec(nest.id, c, y), confirmWarnings: true }, 'player');
    runTicks(sim, 150);
    const { plan } = planById(sim, id)!;
    expect(plan.status).toBe('stalled');
    expect(plan.blockedReason).toBe('no-diggers');
  });

  it('check 16: cancelling a plan at >= 40 % frees its slots and nothing in its volume changes afterwards', () => {
    const { sim, nest, c, y } = tunnelNest();
    const id = createPlan(sim, { ...nurserySpec(nest.id, c, y), confirmWarnings: true }, 'player');
    const diggers = [0, 1, 2].map((n) => placeWorker(sim, { x: c - 2 * BU + n * 2 * BU, y, z: c }, { x: 0, y: 0, z: 1 }, nest.id));
    const { plan } = planById(sim, id)!;
    for (let k = 0; k < 40 && plan.removedVolume < 0.4 * plan.targetVolume; k++) digPlan(sim, id, diggers, 10);
    expect(plan.removedVolume).toBeGreaterThanOrEqual(0.4 * plan.targetVolume);
    expect(cancelPlan(sim, id, 'player')).toBe(true);
    expect(plan.status).toBe('cancelled');
    expect(plan.slots.every((s) => s.antId < 0)).toBe(true);
    expect(diggers.every((a) => !antSlot(sim, a))).toBe(true);
    const version = sim.carve.version;
    runTicks(sim, 1000);
    expect(sim.carve.version).toBe(version);
  });

  it('priority, pause and resume through commands', () => {
    const { sim, nest, c, y } = tunnelNest();
    const id = createPlan(sim, { ...nurserySpec(nest.id, c, y), confirmWarnings: true }, 'player');
    sim.enqueue({ type: 'setPlanPriority', planId: id, priority: 'high' });
    sim.enqueue({ type: 'pausePlan', planId: id });
    runTicks(sim, 1);
    const { plan } = planById(sim, id)!;
    expect(plan.priority).toBe('high');
    expect(plan.status).toBe('paused');
    const a = placeWorker(sim, { x: c, y, z: c }, { x: 0, y: 0, z: 1 }, nest.id);
    expect(claimDigSite(sim, a)).toBe(false);
    sim.enqueue({ type: 'resumePlan', planId: id });
    runTicks(sim, 1);
    expect(plan.status).toBe('queued');
    expect(claimDigSite(sim, a)).toBe(true);
    setMoisture(sim, 0.4);
  });
});
