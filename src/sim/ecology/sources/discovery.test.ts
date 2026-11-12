// Deliverable 4: per-colony discovery flags, odour-based detection, nearestSource with filters, quality scoring.

import { describe, expect, it } from 'vitest';
import type { SimEvent } from '@/sim/types';
import { placeMarker } from '@/sim/entities';
import { nearestSource as nearestFromIndex, discoverSource as discoverFromIndex } from '@/sim/ecology';
import { createSource } from './spawn';
import { discoverSource, findSources, isDiscoveredBy, sourceQuality, sourcesSmelledFrom } from './discovery';
import { syncAvoidBits } from './system';
import { takeFromSource } from './harvest';
import { addWorker, centre, makeSourceSim } from './testkit';

describe('discovery', () => {
  it('sets the colony bit and emits food-source-discovered only the first time', () => {
    const sim = makeSourceSim();
    const seen: SimEvent[] = [];
    sim.events.onAny((_t, e) => seen.push(e as SimEvent));
    const s = createSource(sim, { variant: 'flower', pos: centre(sim) });
    const colony = sim.state.player.colonyId;
    expect(discoverSource(sim, colony, s.id, 42)).toBe(true);
    expect(discoverFromIndex(sim, colony, s.id, 43)).toBe(false);
    expect(isDiscoveredBy(sim, s, colony)).toBe(true);
    expect(s.discoveredBy).toBe(1);
    sim.events.flush();
    const d = seen.filter((e) => e.type === 'food-source-discovered');
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ sourceId: s.id, kind: 'nectar', variant: 'flower', colonyId: colony, byAntId: 42 });
  });

  it('a colony without a territory slot cannot discover (no bit to set)', () => {
    const sim = makeSourceSim();
    const s = createSource(sim, { variant: 'flower', pos: centre(sim) });
    expect(discoverSource(sim, 9999, s.id, 1)).toBe(false);
    expect(s.discoveredBy).toBe(0);
  });
});

describe('smell', () => {
  it('detects sources within their odour radius (12 BU x odour), nearest first', () => {
    const sim = makeSourceSim();
    const bu = sim.world.bu;
    const c = centre(sim);
    const flower = createSource(sim, { variant: 'flower', pos: c }); // 10 BU
    const carcass = createSource(sim, { variant: 'insect-medium', pos: { x: c.x + 15 * bu, y: 0, z: c.z } }); // 20 BU
    const at = (dxBu: number): number[] => sourcesSmelledFrom(sim, { x: c.x + dxBu * bu, y: 0, z: c.z });
    expect(at(0)).toEqual([flower.id, carcass.id]);
    expect(at(9.9)).toEqual([carcass.id, flower.id]);
    expect(at(-10.5)).toEqual([]); // 10.5 BU from the flower, 25.5 from the carcass
    expect(at(-4.9)).toEqual([flower.id, carcass.id]); // 19.9 BU from the carcass
    expect(at(36)).toEqual([]);
  });

  it('a single crumb smells at 6 BU, a cluster at 15 BU; empty or out-of-season sources are not smelled', () => {
    const sim = makeSourceSim();
    const bu = sim.world.bu;
    const c = centre(sim);
    const s = createSource(sim, { variant: 'crumb-starch', pos: c, units: 10 });
    const p = { x: c.x + 10 * bu, y: 0, z: c.z };
    expect(sourcesSmelledFrom(sim, p)).toEqual([s.id]);
    s.units = 1;
    expect(sourcesSmelledFrom(sim, p)).toEqual([]);
    expect(sourcesSmelledFrom(sim, { x: c.x + 5 * bu, y: 0, z: c.z })).toEqual([s.id]);
    s.units = 0;
    expect(sourcesSmelledFrom(sim, c)).toEqual([]);
  });
});

describe('nearestSource and quality', () => {
  it('finds the nearest usable source, by kind or nutrient, discovered only on request', () => {
    const sim = makeSourceSim();
    const bu = sim.world.bu;
    const c = centre(sim);
    const colony = sim.state.player.colonyId;
    const near = createSource(sim, { variant: 'flower', pos: { x: c.x + 5 * bu, y: 0, z: c.z } });
    const far = createSource(sim, { variant: 'insect-small', pos: { x: c.x + 30 * bu, y: 0, z: c.z } });
    expect(nearestFromIndex(sim, colony, c, 100 * bu)).toBe(near.id);
    expect(nearestFromIndex(sim, colony, c, 100 * bu, 'carrion')).toBe(far.id);
    expect(nearestFromIndex(sim, colony, c, 100 * bu, undefined, { nutrient: 'p' })).toBe(far.id);
    expect(nearestFromIndex(sim, colony, c, 20 * bu, 'carrion')).toBe(-1);
    expect(nearestFromIndex(sim, colony, c, 100 * bu, undefined, { discoveredOnly: true })).toBe(-1);
    discoverSource(sim, colony, far.id, -1);
    expect(nearestFromIndex(sim, colony, c, 100 * bu, undefined, { discoveredOnly: true })).toBe(far.id);
    expect(findSources(sim, colony, c, 100 * bu)).toEqual([near.id, far.id]);
  });

  it('an avoid marker of the colony sets quality 0 and hides the source from that colony (GDD 05 §1.8)', () => {
    const sim = makeSourceSim();
    const c = centre(sim);
    const colony = sim.state.player.colonyId;
    const bait = createSource(sim, { variant: 'bait-gel', pos: c, tier: 2 });
    expect(sourceQuality(sim, colony, bait.id)).toBe(1.2);
    placeMarker(sim, { kind: 'avoid', pos: c, radius: 30 * sim.world.bu, colony });
    expect(sourceQuality(sim, colony, bait.id)).toBe(0);
    expect(nearestFromIndex(sim, colony, c, 1000)).toBe(-1);
    syncAvoidBits(sim);
    expect(bait.avoidBy).toBe(1);
  });

  it('an exhausted renewable source scores 0 for the colony until it refills', () => {
    const sim = makeSourceSim();
    const c = centre(sim);
    const film = createSource(sim, { variant: 'honeydew-film', pos: c, tier: 1 });
    const ant = addWorker(sim, c);
    takeFromSource(sim, ant, film.id, 1e6);
    expect(sourceQuality(sim, ant.colony, film.id)).toBe(0);
    film.units = 0.3;
    film.exhaustedBy = 0;
    expect(sourceQuality(sim, ant.colony, film.id)).toBe(0.6);
  });

  it('water-only sources are skipped unless asked for (no water need in T1-T2 for Lasius)', () => {
    const sim = makeSourceSim();
    const c = centre(sim);
    const colony = sim.state.player.colonyId;
    const w = createSource(sim, { variant: 'water', pos: c, tier: 2 });
    expect(nearestFromIndex(sim, colony, c, 1000)).toBe(-1);
    expect(nearestFromIndex(sim, colony, c, 1000, undefined, { water: true })).toBe(w.id);
  });
});
