// Reviewer tests (human-events verify pass): cheap worlds only. Tests that fail here demonstrate a defect against
// GDD 04 §15 and stay in place for the fixer; passing ones are regression tests.

import { describe, expect, it } from 'vitest';
import { rngFork } from '@/core/rng';
import type { HumanEventRun } from '@/sim/types';
import { GRASS_GROWTH_MM_GD, GRASS_MAX_MOWN_MM } from '@/sim/balance/human';
import { TICKS_PER_DAY } from '@/sim/time';
import { humanExtra } from './extra';
import { dayContext, drawDayEvents } from './schedule';
import { humanSites } from './sites';
import { grassDaily } from './effects/grass';
import { applyImpact } from './effects/kinds';
import type { HumanPlan, Impact } from './plan';
import { alive as aliveIds, humanSim, patioWorld, placeWorker, runToEnd, scheduleNow } from './testkit';
import { buildWorld } from '@/sim/testing';
import { defaultWorldParams } from '@/worldgen';
import { crushAnts } from './effects/ground';
import { contactPlane } from './effects/common';
import type { Footprint } from './plan';

function emptyRun(): HumanEventRun {
  return { instId: -1, progressS: 0, nextImpactTick: -1, cues: [], killed: 0, displaced: 0, itemsRemoved: 0 };
}

describe('human events: reviewer checks', () => {
  // GDD 04 §15.2 food-drop row: "car park 1 per 4 bays". The schedule row is a flat 1/4 per car-park site.
  it('car-park litter drops scale with the number of bays (1 per 4 bays per GD)', () => {
    const sim = humanSim(patioWorld({ zone: 'asphalt', variant: 'car-park', surface: 'asphalt', sizeMm: 16000 }));
    const park = humanSites(sim.world).list.find((s) => s.kind === 'car-park')!;
    expect(park.bays.length).toBeGreaterThanOrEqual(4);
    const rng = rngFork(3, 'verify.litter');
    const days = 56;
    let n = 0;
    for (let d = 0; d < days; d++) {
      n += drawDayEvents(sim, dayContext(sim, d), rng).filter((e) => e.kind === 'food-drop' && e.siteId === park.id).length;
    }
    const expected = (park.bays.length / 4) * days;
    // 4 sigma of a Poisson-like count
    expect(Math.abs(n - expected), `bays ${park.bays.length}: got ${n} drops, expected ${expected}`).toBeLessThanOrEqual(4 * Math.sqrt(expected) + 1);
  });

  // GDD 04 §15.4 children: "30 % per session `sweets` drop". The drop impact of a play session goes through the
  // generic food-drop path (crust / zone crumbs) instead of ecology's `children` food (CHILDREN_FOOD + sugar).
  it('a play session drop creates the children food set (sweets + sugar granules), not generic crumbs', () => {
    const sim = humanSim(patioWorld({ zone: 'sand', variant: 'sand-pit', surface: 'sand', sizeMm: 4000 }));
    const before = new Set(sim.stores.sources.list.filter((s) => s.alive).map((s) => s.id));
    const plan = { kind: 'children', variant: 'play-session', actors: [{ kind: 'crumb', scale: 1, side: 0, keys: [] }], siteId: -1, extent: 0 } as unknown as HumanPlan;
    const imp: Impact = { t: 0, fp: { x: 2000, y: 0, z: 2000, yaw: 0, hx: 20, hz: 20, disc: true }, contact: 'drop', actor: 0, value: 1 };
    applyImpact(sim, emptyRun(), plan, imp);
    const fresh = sim.stores.sources.list.filter((s) => s.alive && !before.has(s.id)).map((s) => s.variant);
    expect(fresh, `created ${JSON.stringify(fresh)}`).toContain('sugar-granules');
    expect(fresh.length).toBe(2);
  });

  // GDD 04 §15.5: grass grows 12 / 12 / 5 / 0 mm per GD (winter 0). The system is off during the overwintering
  // time-lapse, so the first spring day sees an 8-day gap and multiplies it by the spring rate.
  it('no grass growth is credited for the winter days skipped by the overwintering time-lapse', () => {
    const sim = humanSim(patioWorld({ zone: 'lawn', variant: 'mown', surface: 'loam', sizeMm: 3000 }));
    const days = 7; // default season length
    grassDaily(sim, 0); // initialise the sward
    const g = sim.state.worldDelta.grassHeightMm;
    const cells: number[] = [];
    for (let i = 0; i < g.length; i++) if (g[i] > 0) { g[i] = 50; cells.push(i); }
    expect(cells.length).toBeGreaterThan(0);
    const ex = humanExtra(sim);
    ex.grassDay = 3 * days - 1; // last autumn day of year 1
    // first spring day of year 2
    sim.state.env.calendar.startTick = 4 * days * TICKS_PER_DAY - sim.state.tick + 10;
    grassDaily(sim, 4 * days);
    const expectedMax = 50 + GRASS_GROWTH_MM_GD.spring; // only the spring day grows (winter 0)
    expect(g[cells[0]], `cap ${GRASS_MAX_MOWN_MM}`).toBeLessThanOrEqual(expectedMax);
  });

  // GDD 04 §15.4: a footprint is a 3 mm (sand 5 mm) depression; §15.4 children: sand deltas within ±100 mm. Every
  // footfall adds its depression to the saved delta tiles with no cap and no recovery, so a lane becomes a trench.
  it('repeated passes along one sand lane do not dig a trench deeper than the GDD sand bound (100 mm)', () => {
    const sim = humanSim(patioWorld({ zone: 'sand', variant: 'sand-pit', surface: 'sand', sizeMm: 8000 }));
    sim.state.config.difficulty.params.humanFreqMult = 0; // only these passes
    const lane = humanSites(sim.world).list.find((s) => s.kind === 'playground-lane')!;
    for (let n = 0; n < 60; n++) runToEnd(sim, scheduleNow(sim, 'footsteps', 'adult', lane.id, null));
    let deepest = 0;
    for (const t of sim.state.worldDelta.heightDeltas) for (let i = 0; i < t.data.length; i++) deepest = Math.min(deepest, t.data[i] / 16);
    expect(deepest, `deepest delta after 60 passes ${deepest.toFixed(1)} mm`).toBeGreaterThanOrEqual(-100);
  }, 60_000);

  // GDD 04 §15.4: only ants in a crevice / joint / crack / cavity >= 0.5 BU below the contact plane are safe. The
  // plane is the highest surface under the sole, so on a gentle slope every ant on the downhill part of the sole sits
  // "below the plane" and is spared, with no crevice at all.
  it('a sole on a 10 % loam slope crushes ants on its downhill half like on its uphill half', () => {
    const params = { ...defaultWorldParams('lasius-niger', 1), sizeClass: 'compact' as const, rivalCount: 0, incipientCount: 0 };
    const world = buildWorld({ params, size: 4000, bu: 4, height: (x) => 0.1 * x, zone: 'pavement', surface: 'loam' });
    world.zones[0].variant = 'path';
    const sim = humanSim(world);
    const fp: Footprint = { x: 2000, y: 200, z: 2000, yaw: 0, hx: 140, hz: 50, disc: false };
    const down: number[] = [], up: number[] = [];
    for (let i = 0; i < 120; i++) {
      const u = -130 + (i % 12) * 23.6, v = -45 + Math.floor(i / 12) * 10;
      const id = placeWorker(sim, fp.x + u, fp.z + v, 600);
      if (id >= 0) (u < 0 ? down : up).push(id);
    }
    sim.index.refresh();
    const run = emptyRun();
    crushAnts(sim, run, fp, contactPlane(sim, fp), 'adult-shoe');
    const deadDown = down.length - aliveIds(sim, down), deadUp = up.length - aliveIds(sim, up);
    // CRUSH_P adult shoe on bare soft ground is 0.45 everywhere under the sole
    expect(deadDown / down.length, `downhill ${deadDown}/${down.length}, uphill ${deadUp}/${up.length}`).toBeGreaterThan(0.25);
  });
});
