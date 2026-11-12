// Need evaluation (GDD 03 §8.3, Tier 1): measures, triggers, priorities, sizes, missing types, pending plans.

import { describe, expect, it } from 'vitest';
import type { Chamber, ChamberType, DigPlan, Nest } from '@/sim/types';
import { capacityOf } from '../chambers/registry';
import { evaluateNeeds, missingType, type NeedInputs } from './needs';
import { nestCapacity } from './capacity';

const LN = 'lasius-niger';

function chamber(id: number, type: ChamberType, volume: number): Chamber {
  const z = { x: 0, y: 0, z: 0 };
  return {
    id, type, designatedBy: 'auto', center: z, radii: { x: 1, y: 1, z: 1 }, volume, floorArea: 0, depthBu: 15, depthMm: 60,
    roofMin: 10, covered: false, seedVoxel: 0, voxelCount: 0, capacity: capacityOf(type, volume),
    occupancy: { adults: 0, brood: 0, food: 0, other: 0 }, temp: 20, humidity: 0.8, wetUntilTick: -1, flooded: 0, floodRisk: 0,
    flags: 0, createdTick: 0,
  };
}

function nestWith(chambers: Chamber[], volumeOpen = chambers.reduce((s, c) => s + c.volume, 0)): Nest {
  return { chambers, volumeOpen, digPlans: [] as DigPlan[] } as unknown as Nest;
}

const inputs = (o: Partial<NeedInputs>): NeedInputs => ({
  workers: 0, adultUnits: 0, broodUnits: 0, foodLoads: 0, looseFoodItems: 0, queenAlive: true, diggers: 10, ...o,
});

describe('architect needs', () => {
  it('crowding: rho > 0.85 triggers; 1.1 high, 1.5 urgent; rest from 40 workers (general below); size brings rho <= 0.7', () => {
    const nest = nestWith([chamber(1, 'royal', 20), chamber(2, 'rest', 100)]); // capacity 6 + 100
    const at = (adults: number) => evaluateNeeds(nest, LN, inputs({ workers: adults, adultUnits: adults })).requests.find((r) => r.need === 'crowding');
    expect(at(90)).toBeUndefined(); // 0.849
    expect(at(91)).toMatchObject({ priority: 'normal', type: 'rest' });
    expect(at(120)).toMatchObject({ priority: 'high', type: 'rest', size: 'm' }); // 1.13: S (62.8) is not enough for 0.7
    expect(at(160)).toMatchObject({ priority: 'urgent', size: 'm' });
    expect(at(200)).toMatchObject({ priority: 'urgent', size: 'l' }); // needs 180 more: only L (251)
    const small = nestWith([chamber(1, 'royal', 20)]); // capacity 6
    expect(evaluateNeeds(small, LN, inputs({ workers: 30, adultUnits: 30 })).requests[0]).toMatchObject({ need: 'crowding', type: 'general' });
  });

  it('crowding counts tunnel space (0.15 per BU^3 outside chambers)', () => {
    const cap = nestCapacity(nestWith([chamber(1, 'rest', 100)], 300), LN, false);
    expect(cap.adults).toBeCloseTo(100 + 0.15 * 200, 6);
  });

  it('brood space: rho_b over nursery, royal, founding, general; 0.8 trigger, 1.0 high, 1.3 urgent', () => {
    const nest = nestWith([chamber(1, 'royal', 20), chamber(2, 'nursery', 60), chamber(3, 'rest', 500)]); // brood cap 40 + 90
    const at = (b: number) => evaluateNeeds(nest, LN, inputs({ workers: 50, adultUnits: 50, broodUnits: b })).requests.find((r) => r.need === 'brood-space');
    expect(at(104)).toBeUndefined();
    expect(at(105)).toMatchObject({ priority: 'normal', type: 'nursery' });
    expect(at(130)).toMatchObject({ priority: 'high' });
    expect(at(170)).toMatchObject({ priority: 'urgent' });
  });

  it('food space: loads / (food + general) > 0.8, or 10 loose items', () => {
    const nest = nestWith([chamber(1, 'royal', 20), chamber(2, 'food', 50), chamber(3, 'rest', 500)]); // food cap 100
    const f = (o: Partial<NeedInputs>) => evaluateNeeds(nest, LN, inputs({ workers: 50, adultUnits: 50, ...o })).requests.find((r) => r.need === 'food-space');
    expect(f({ foodLoads: 80 })).toBeUndefined();
    expect(f({ foodLoads: 81 })).toMatchObject({ type: 'food', priority: 'normal' });
    expect(f({ looseFoodItems: 10 })).toMatchObject({ type: 'food' });
  });

  it('missing types follow the Lasius template (royal for a queen without one, 8 nursery S, 25 food S, 40 rest M, 150 a second nursery M)', () => {
    const big = (types: ChamberType[]) => nestWith([chamber(1, 'general', 2000), ...types.map((t, n) => chamber(n + 2, t, 60))]);
    const miss = (types: ChamberType[], workers: number, queenAlive = true) => missingType(big(types), LN, inputs({ workers, queenAlive }), true);
    expect(miss([], 5)).toMatchObject({ type: 'royal' });
    expect(miss([], 5, false)).toBeNull();
    expect(miss(['founding'], 7)).toBeNull();
    expect(miss(['royal'], 8)).toMatchObject({ type: 'nursery', size: 's' });
    expect(miss(['royal', 'nursery'], 25)).toMatchObject({ type: 'food', size: 's' });
    expect(miss(['royal', 'nursery', 'food'], 40)).toMatchObject({ type: 'rest', size: 'm', missing: 1 });
    expect(miss(['royal', 'nursery', 'food', 'rest'], 149)).toBeNull();
    expect(miss(['royal', 'nursery', 'food', 'rest'], 150)).toMatchObject({ type: 'nursery', size: 'm' });
  });

  it('a chamber plan in progress counts as built (no second order of the same room)', () => {
    const nest = nestWith([chamber(1, 'royal', 20), chamber(2, 'rest', 2000)]);
    expect(missingType(nest, LN, inputs({ workers: 10 }), true)).toMatchObject({ type: 'nursery' });
    nest.digPlans.push({ id: 9, kind: 'chamber', chamberType: 'nursery', size: 's', status: 'queued' } as DigPlan);
    expect(missingType(nest, LN, inputs({ workers: 10 }), true)).toBeNull();
    expect(missingType(nest, LN, inputs({ workers: 10 }), false)).toMatchObject({ type: 'nursery' });
  });

  it('requests are ordered by priority, then missing-type, brood-space, crowding, food-space', () => {
    const nest = nestWith([chamber(1, 'royal', 20), chamber(2, 'rest', 40)]);
    const r = evaluateNeeds(nest, LN, inputs({ workers: 30, adultUnits: 70, broodUnits: 40 })).requests; // 1.52, 1.0
    expect(r.map((x) => x.need)).toEqual(['crowding', 'brood-space', 'missing-type']);
    expect(r[0].priority).toBe('urgent');
  });
});
