// Placement (GDD 03 §8.4): composite candidates when no wall spot lies in the band (b), cover candidates toward the
// underside of a stone (c), and the score terms.

import { describe, expect, it } from 'vitest';
import { rngFork } from '@/core/rng';
import type { Nest, Primitive, Sim } from '@/sim/types';
import { PrimFlag } from '@/sim/types';
import { commandsSystem } from '@/sim/systems';
import { carveCapsule } from '../carveOps';
import { nestSim, playerNest, runTicks } from '../nestTestKit';
import { createPlanImpl, instantCarvePlan } from '../plans/plans';
import { nestSystem } from '../system';
import type { NeedRequest } from './needs';
import { choosePlacement, type Placement } from './place';
import { bandOf, coveredAbove, curve, depthFit } from './score';

/** A nest that is only a straight shaft `depthBu` deep at the world centre (an entrance, no chamber). */
function shaftNest(depthBu: number, prims: Primitive[] = []): { sim: Sim; nest: Nest } {
  const sim = nestSim({ sizeBu: 220, prims, systems: [commandsSystem, nestSystem] });
  const bu = sim.world.bu, c = sim.world.size / 2, g = sim.field.height(c, c);
  const nest = playerNest(sim, { x: c, y: g, z: c });
  carveCapsule(sim, { x: c, y: g + 0.5 * bu, z: c }, { x: c, y: g - depthBu * bu, z: c }, 1.1 * bu);
  runTicks(sim, 20);
  return { sim, nest };
}

/** Places, carves at once and repeats until a chamber is placed (connectors first); the chain of placements. */
function placeUntilChamber(sim: Sim, nest: Nest, req: NeedRequest, max = 5): Placement[] {
  const chain: Placement[] = [];
  for (let n = 0; n < max; n++) {
    const p = choosePlacement(sim, nest, req, rngFork(n, 'placement-test'));
    if (!p) break;
    chain.push(p);
    const id = createPlanImpl(sim, p.spec, 'architect');
    expect(id).toBeGreaterThanOrEqual(0);
    instantCarvePlan(sim, id);
    runTicks(sim, 60);
    if (!p.connector) break;
  }
  return chain;
}

describe('architect placement', () => {
  it('(b) no wall spot in the band: a connector (tunnel or shaft) toward it first, then the chamber in the band', () => {
    const { sim, nest } = shaftNest(4);
    const req: NeedRequest = { need: 'missing-type', priority: 'normal', type: 'royal', size: 's', pressure: 1 };
    const chain = placeUntilChamber(sim, nest, req);
    expect(chain.length).toBeGreaterThan(1);
    expect(chain[0].connector).toBe(true);
    expect(['tunnel', 'shaft']).toContain(chain[0].spec.kind);
    const last = chain[chain.length - 1];
    expect(last.connector).toBe(false);
    expect(last.spec.chamberType).toBe('royal');
    const room = nest.chambers.find((c) => c.type === 'royal');
    expect(room).toBeDefined();
    const band = bandOf('lasius-niger', 'royal');
    expect(room!.depthBu).toBeGreaterThanOrEqual(band[0] - 4);
    expect(room!.depthBu).toBeLessThanOrEqual(band[1] + 4);
    expect(sim.nestNav.distance(nest.id, { kind: 'exit', id: -1 }, room!.center)).toBeGreaterThan(0);
  });

  it('(c) a stone slab near the nest: the nursery (cover weight 2.5) goes under it', () => {
    const bu = 4, c = 110 * bu;
    const slab: Primitive = {
      id: 1, shape: 'box', pos: { x: c + 16 * bu, y: -1 * bu, z: c }, rot: { x: 0, y: 0, z: 0, w: 1 },
      size: { x: 7 * bu, y: 1.5 * bu, z: 7 * bu }, round: 0, material: 'stone', flags: PrimFlag.CLIMBABLE | PrimFlag.SHELTER, objectId: -1,
    };
    const { sim, nest } = shaftNest(12, [slab]);
    const req: NeedRequest = { need: 'missing-type', priority: 'normal', type: 'nursery', size: 's', pressure: 1 };
    const chain = placeUntilChamber(sim, nest, req);
    const room = nest.chambers.find((x) => x.type === 'nursery');
    expect(room).toBeDefined();
    const top = room!.center.y + room!.radii.y;
    expect(coveredAbove(sim, room!.center.x, top, room!.center.z)).toBe(true);
    expect(chain.length).toBeGreaterThan(0);
    expect(Math.abs(room!.center.x - slab.pos.x)).toBeLessThan(slab.size.x); // under the slab, not by the shaft
  });

  it('score terms: depthFit falls off over 8 BU outside the band, curves interpolate', () => {
    expect(depthFit(20, [10, 30])).toBe(1);
    expect(depthFit(6, [10, 30])).toBeCloseTo(0.5, 9);
    expect(depthFit(50, [10, 30])).toBe(0);
    expect(curve([[0, 0], [10, 1]], 5)).toBeCloseTo(0.5, 9);
    expect(curve([[0, 0], [10, 1]], -3)).toBe(0);
  });
});
