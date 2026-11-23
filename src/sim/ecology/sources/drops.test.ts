// Deliverable 2 / 5: sources from placement tables at New Game, runtime carrion drops, the T1 crumb rule.
// The game runs Tier 2 (R1, ECOLOGY_TIER = 2): the T1 cases pass tier 1 explicitly (gate-sim-2, integrator ruling 1).

import { describe, expect, it } from 'vitest';
import { v3DistanceSq } from '@/core/math/vec3';
import { calendarNow } from '@/sim/environment';
import { makeTestWorld } from '@/sim/testing';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '@/sim/time';
import { DIFFICULTY_PARAMS } from '@/sim/balance';
import { CARRION_DROP_MIN_ANT_BU, CARRION_MULT } from '@/sim/balance/ecology';
import { retireSource } from './remove';
import { carrionDropsPerGd, zonePlots } from './drops';
import { addWorker, anchor, makeSourceSim, stepTicks } from './testkit';

describe('sources from food anchors (New Game)', () => {
  it('creates one source per anchor that makes one at T1, with the anchor id, season mask and start state', () => {
    const sim = makeSourceSim({
      tier: 1,
      anchors: [
        anchor('nectar', 100, 100), anchor('nectar', 120, 100, 'empty'), anchor('honeydew', 140, 100),
        anchor('crumb', 160, 100), anchor('crumb', 180, 100), anchor('crumb', 200, 100), anchor('crumb', 220, 100),
        anchor('crumb', 240, 100, 'crumb-starch'), anchor('sugar', 260, 100, 'full', 1 << 1),
        anchor('carrion', 280, 100, 'area'), anchor('carrion', 300, 100), anchor('fruit', 320, 100),
        anchor('prey', 340, 100), anchor('seed', 360, 100), anchor('carrion', 380, 100, 'insect-medium'),
      ],
    });
    const live = sim.stores.sources.list.filter((s) => s.alive);
    const byAnchor = new Map(live.map((s) => [s.anchorId, s]));
    expect(byAnchor.get(0)?.variant).toBe('flower');
    expect(byAnchor.get(0)?.units).toBe(1.5);
    expect(byAnchor.get(1)?.units).toBe(0); // 'empty'
    expect(byAnchor.get(2)?.variant).toBe('honeydew-film');
    expect(byAnchor.get(2)?.refillPerGd).toBe(1);
    // crumb anchors without a hint: every 4th is protein (1 protein per 3 starch)
    expect([3, 4, 5, 6].map((i) => byAnchor.get(i)?.variant)).toEqual(['crumb-starch', 'crumb-starch', 'crumb-starch', 'crumb-protein']);
    expect(byAnchor.get(7)?.variant).toBe('crumb-starch');
    expect(byAnchor.get(8)?.seasonMask).toBe(2);
    expect(byAnchor.has(9)).toBe(false); // spawn area
    expect(byAnchor.has(10)).toBe(false); // bare carrion anchor = area
    expect(byAnchor.has(11)).toBe(false); // fruit is T2
    expect(byAnchor.has(12)).toBe(false); // prey patches: creatures
    expect(byAnchor.has(13)).toBe(false); // elaiosome seeds are T2
    expect(byAnchor.get(14)?.variant).toBe('insect-medium');
    expect(live).toHaveLength(10);
    for (const s of live) {
      const units = s.units;
      expect(Number.isFinite(units) && units >= 0).toBe(true);
      expect(units).toBeLessThanOrEqual(s.capacity);
    }
  });

  it('cluster sizes are rolled within the catalogue range and scaled by foodAbundanceMult', () => {
    const anchors = Array.from({ length: 40 }, (_, i) => anchor('sugar', 50 + i * 10, 200));
    const nat = makeSourceSim({ anchors, tier: 1 });
    const units = nat.stores.sources.list.map((s) => s.units);
    expect(Math.min(...units)).toBeGreaterThanOrEqual(50);
    expect(Math.max(...units)).toBeLessThanOrEqual(300);
    const difficulty = { preset: 'gentle' as const, params: { ...DIFFICULTY_PARAMS.gentle }, custom: {} };
    const gentle = makeSourceSim({ anchors: [anchor('nectar', 100, 100), anchor('honeydew', 200, 100)], config: { difficulty }, tier: 1 });
    const [flower, site] = gentle.stores.sources.list;
    expect(flower.capacity).toBeCloseTo(1.5 * 1.3, 9); // pools x foodAbundanceMult
    expect(flower.refillPerGd).toBeCloseTo(4 * 1.3, 9); // refill x foodAbundanceMult
    expect(site.capacity).toBeCloseTo(0.5 * 1.3, 9);
  });
});

describe('carrion drops', () => {
  it('drops the expected T1 numbers per day (x4 small and medium), placed in the zone and away from ants', () => {
    const world = makeTestWorld({ sizeBu: 2000 });
    const sim = makeSourceSim({ world, tier: 1 });
    const ant = addWorker(sim, { x: world.size / 2, y: 0, z: world.size / 2 });
    const plots = zonePlots(world).lawn;
    expect(plots).toBeCloseTo(400, 6);
    const season = calendarNow(sim).season;
    const mult = CARRION_MULT.naturalist;
    const small = carrionDropsPerGd(0, 'lawn', plots, season, mult, 1);
    const medium = carrionDropsPerGd(1, 'lawn', plots, season, mult, 1);
    expect(small).toBeCloseTo(0.02 * 4 * 400 * (season === 'summer' ? 1 : season === 'spring' ? 0.8 : 0.7), 9);
    expect(carrionDropsPerGd(2, 'lawn', plots, season, mult, 1)).toBe(0); // insect-large is T2
    stepTicks(sim, TICKS_PER_DAY);
    const live = sim.stores.sources.list.filter((s) => s.alive);
    const nSmall = live.filter((s) => s.variant === 'insect-small').length;
    const nMedium = live.filter((s) => s.variant === 'insect-medium').length;
    expect(Math.abs(nSmall - small)).toBeLessThanOrEqual(1);
    expect(Math.abs(nMedium - medium)).toBeLessThanOrEqual(1);
    const min2 = (CARRION_DROP_MIN_ANT_BU * world.bu) ** 2;
    for (const s of live) {
      expect(v3DistanceSq(s.pos, ant.pos)).toBeGreaterThanOrEqual(min2);
      expect(s.pos.x >= 0 && s.pos.x <= world.size && s.pos.z >= 0 && s.pos.z <= world.size).toBe(true);
    }
  });

  it('no drops in winter', () => {
    expect(carrionDropsPerGd(0, 'forest', 100, 'winter', 1)).toBe(0);
    expect(carrionDropsPerGd(0, 'forest', 100, 'summer', 1, 2)).toBeCloseTo(0.02 * 1.5 * 100, 12);
  });
});

describe('T1 crumb rule', () => {
  it('re-places 30 % of the consumed clusters at 12:00 and respects the 60-cluster cap', () => {
    const anchors = Array.from({ length: 10 }, (_, i) => anchor('crumb', 100 + i * 20, 300, 'crumb-starch'));
    const sim = makeSourceSim({ anchors, tier: 1 });
    for (const s of sim.stores.sources.list.slice()) retireSource(sim, s, 'depleted');
    expect(sim.state.worldDelta.consumedAnchors).toHaveLength(10);
    let replacedAt = -1;
    for (let h = 0; h < 24 && replacedAt < 0; h++) {
      stepTicks(sim, TICKS_PER_HOUR);
      if (sim.stores.sources.list.some((s) => s.alive)) replacedAt = calendarNow(sim).hour;
    }
    expect(replacedAt).toBeGreaterThan(12); // the hourly run whose hour covers 12:00
    expect(replacedAt).toBeLessThanOrEqual(13);
    expect(sim.stores.sources.list.filter((s) => s.alive)).toHaveLength(3);
    expect(sim.state.worldDelta.consumedAnchors).toHaveLength(7);
  });

  it('does not exceed 60 live clusters', () => {
    const anchors = Array.from({ length: 70 }, (_, i) => anchor('crumb', 20 + (i % 35) * 25, 200 + Math.floor(i / 35) * 50, 'crumb-starch'));
    const sim = makeSourceSim({ anchors, tier: 1 });
    const live = sim.stores.sources.list.filter((s) => s.alive);
    for (const s of live.slice(0, 10)) retireSource(sim, s, 'depleted');
    stepTicks(sim, TICKS_PER_DAY);
    expect(sim.stores.sources.list.filter((s) => s.alive && s.kind === 'crumb')).toHaveLength(60);
  });
});
