// Regression tests of the species-harvester fix round (review findings): seed rain on emptied nodes, the morning
// patrol trip, soft-seed milling by small workers, granary-state events, seed relocation, cut-seed-head by the AI,
// the put-down chamber rule and the summer-lull reference.

import { describe, expect, it } from 'vitest';
import type { Ant, FoodSource, Sim } from '@/sim/types';
import { setClimateOverride } from '@/sim/colony/envAdapter';
import { retireSource } from '@/sim/ecology/sources/remove';
import { spawnItem } from '@/sim/entities';
import { begin } from '@/sim/ants/actions';
import { walkerPlace } from '@/sim/locomotion/walker';
import { K, PHASE } from '@/sim/ants/behaviours/outdoor/keys';
import { secondsToTicks, TICKS_PER_DAY } from '@/sim/time';
import { GATE_PATROL_TRIP_S, PATROL_FAILSAFE_TICKS, PATROL_HOLD_TICKS, SEED_RAIN_PER_GD } from '@/sim/balance/species-harvester';
import { addAnts, addLarvae, messorKit } from './testkit';
import { newPatchSite, refreshSeedSites } from './seeds';
import { addSeeds, totalsOf } from './cohorts';
import { millSecondsPerLoad } from './paste';
import { gateOf, lullMult, setTrailTempOverride } from './rhythm';
import { noteSeedDay } from './counters';
import { ensureGranary, stockOf } from './state';
import { granaryDeliverySystem, putDownChamberId } from './delivery';
import { cutHeadNow } from './behaviourForage';
import { relocateTarget } from './relocate';
import { ti } from '@/sim/colony/taskIdx';
import { syncDisplay } from './display';
import { patrolDiag } from './diagnostics';

function run(sim: Sim, ticks: number, each?: () => void): void {
  for (let i = 0; i < ticks; i++) { sim.tick(); each?.(); }
}

function quietKit(seed = 1) {
  const k = messorKit({ tempC: 24, seed });
  setClimateOverride(k.sim, { chamberTemp: () => 24, rh: () => 0.3, pointTemp: () => 24, surfaceActivity: () => 1 });
  setTrailTempOverride(k.sim, () => 26);
  return k;
}

/** One seed patch 20 BU from the entrance, stocked. */
function onePatch(k: ReturnType<typeof quietKit>) {
  const sim = k.sim, col = sim.state.colonies[0], mod = col.granary!;
  const e = k.nest.entrance.pos, bu = sim.world.bu;
  const site = newPatchSite(sim, { x: e.x + 20 * bu, y: 0, z: e.z });
  site.pos.y = sim.field.height(site.pos.x, site.pos.z);
  site.seedClass = 'M';
  site.hardness = 0.3;
  mod.seedSites = [site];
  refreshSeedSites(sim, col, k.g);
  return { sim, col, mod, site, source: sim.stores.sources.get(site.sourceId)! as FoodSource };
}

describe('F1 seed rain on an emptied node', () => {
  it('an emptied node comes back only with the rain that fell since (ticking half a game day)', () => {
    const k = quietKit();
    const { sim, col, site } = onePatch(k);
    let created = 0;
    const counted = new Set<number>();
    run(sim, Math.round(0.5 * TICKS_PER_DAY), () => {
      const s = sim.stores.sources.get(site.sourceId);
      if (s && s.alive && !counted.has(s.id) && s.id !== -1) {
        if (counted.size > 0) created += s.units; // the first node is the starting seed bank
        counted.add(s.id);
        retireSource(sim, s, 'depleted'); // a forager took the last seed
      }
      if (sim.state.tick % 250 === 0) refreshSeedSites(sim, col, k.g);
    });
    const rain = SEED_RAIN_PER_GD * site.capacity * 0.5;
    expect(created).toBeGreaterThan(0); // the rain does bring seed back
    expect(created).toBeLessThanOrEqual(Math.ceil(rain));
  }, 60_000);
});

describe('F2 morning patrol', () => {
  it('the gate opens on returning patrollers well before the fail-safe', () => {
    const k = quietKit();
    const col = k.sim.state.colonies[0];
    col.stores.c = 4; col.stores.p = 1;
    addAnts(k, 'media', 18, k.nest.chambers[1], 'idle');
    let opened = -1, closed = -1;
    for (let t = 0; t < 2 * PATROL_FAILSAFE_TICKS && opened < 0; t++) {
      k.sim.tick();
      const g = gateOf(col);
      if (closed < 0 && g.closedTick >= 0) closed = g.closedTick;
      if (g.open && g.openedTick >= 0) opened = g.openedTick;
    }
    expect(opened).toBeGreaterThan(closed);
    expect(gateOf(col).returns.length).toBeGreaterThanOrEqual(3);
    expect(opened - closed).toBeLessThan(PATROL_FAILSAFE_TICKS);
  }, 60_000);
});

describe('F2 diag-mb-patrol', () => {
  it('a normal morning round is not a hold; a patroller more than an hour late is', () => {
    const k = messorKit();
    const col = k.sim.state.colonies[0];
    const [p] = addAnts(k, 'media', 1, k.nest.chambers[1], 'patrol');
    const gate = gateOf(col);
    run(k.sim, 5);
    Object.assign(gate, { open: false, closedTick: 0, out: [p.id], returns: [], holdUntilTick: -1 });
    p.nestId = -1;
    p.bb['mb.pt.out'] = k.sim.state.tick - secondsToTicks(GATE_PATROL_TRIP_S);
    expect(patrolDiag(k.sim, col).status).toBe('ok');
    p.bb['mb.pt.out'] = k.sim.state.tick - secondsToTicks(GATE_PATROL_TRIP_S) - PATROL_HOLD_TICKS - 1;
    expect(patrolDiag(k.sim, col).status).toBe('warn');
  });
});

describe('F3 small workers mill soft seed (deviation from GDD 07 §6.3.6)', () => {
  it('a minor mills seed up to her crack limit at SMALL_MILL_TIME_MULT x the major time, nothing harder', () => {
    const k = messorKit();
    addSeeds(k.granary, k.g, 'S', 0.2, 10, 0.3, 0);
    addSeeds(k.granary, k.g, 'S', 0.5, 10, 0.3, 0);
    const [soft, hard] = k.granary.cohorts;
    const major = millSecondsPerLoad(k.g, { caste: 'major', lengthBu: 1.6 }, soft);
    expect(millSecondsPerLoad(k.g, { caste: 'minor', lengthBu: 0.6 }, soft)).toBeCloseTo(3 * major, 6);
    expect(millSecondsPerLoad(k.g, { caste: 'media', lengthBu: 1.0 }, soft)).toBeCloseTo(3 * major, 6);
    expect(millSecondsPerLoad(k.g, { caste: 'minor', lengthBu: 0.6 }, hard)).toBe(Infinity);
  });

  it('a colony of 3 nanitic-size minors with soft seed in the granary feeds its larvae paste', () => {
    const k = messorKit({ tempC: 26 });
    addSeeds(k.granary, k.g, 'S', 0.2, 20, 0.3, 0);
    const col = k.sim.state.colonies[0];
    col.stores.c = 0; col.stores.p = 0;
    addAnts(k, 'minor', 3, k.nest.chambers[1], 'idle', 0.6);
    addLarvae(k, 3, k.nest.chambers[1]);
    run(k.sim, Math.round(0.6 * TICKS_PER_DAY));
    const fed = k.sim.state.brood.filter((b) => b.alive && b.stage === 'larva').reduce((a, b) => a + b.fedC + b.fedP, 0);
    expect(totalsOf(k.granary).loads).toBeLessThan(20);
    expect(fed).toBeGreaterThan(0.02);
  }, 60_000);
});

describe('F3 the loop in a 2-worker colony (allocation gathererFloor)', () => {
  it('with the granary empty one of 2 first workers goes out: a scout while no seed is known', () => {
    const k = quietKit();
    const col = k.sim.state.colonies[0];
    col.granary!.seedSites = []; // no seed anywhere yet
    col.stores.c = 4; col.stores.p = 0.3; // a fed pool: the base allocator sees no need
    addAnts(k, 'minor', 2, k.nest.chambers[1], 'idle', 0.6);
    addLarvae(k, 2, k.nest.chambers[1]);
    run(k.sim, 200);
    const t = col.alloc.target;
    expect(t[ti('scout')] + t[ti('forage')]).toBeGreaterThanOrEqual(1);
    expect(t[ti('scout')]).toBeGreaterThanOrEqual(1);
  }, 60_000);
});

describe('F5 granary-state', () => {
  it('fires once when the first seed is stored and not again while nothing changes', () => {
    const k = messorKit();
    let n = 0;
    k.sim.events.on('granary-state', () => { n++; });
    run(k.sim, 30);
    expect(n).toBe(0);
    addSeeds(k.granary, k.g, 'S', 0.2, 0.2, 0.3, 0);
    run(k.sim, 60);
    expect(n).toBe(1);
  });
});

describe('F7 seed relocation (GDD 07 §6.3.4)', () => {
  it('care workers move seed out of a proto-granary into the granary chamber, none lost', () => {
    const k = messorKit();
    const col = k.sim.state.colonies[0];
    const proto = ensureGranary(k.sim, col.granary!, k.g, k.nest.chambers[1].id);
    addSeeds(proto, k.g, 'M', 0.7, 6, 0.3, 0);
    col.granary!.pasteLoads = 50; // paste plentiful: nobody mills
    col.stores.c = 4; col.stores.p = 1;
    expect(relocateTarget(k.sim, col, col.granary!, k.g, proto)?.chamberId).toBe(k.granaryChamber.id);
    addAnts(k, 'media', 4, k.nest.chambers[1], 'idle');
    run(k.sim, Math.round(0.3 * TICKS_PER_DAY));
    expect(stockOf(k.granary)).toBeGreaterThanOrEqual(1);
    const carried = k.sim.stores.ants.list.reduce((a, x) => a + (x.bb['mb.rl.n'] ?? 0), 0);
    const foraged = col.granary!.seedInToday ?? 0; // the media also forage the test world's seed
    expect(stockOf(proto)).toBeLessThan(1);
    expect(stockOf(proto) + stockOf(k.granary) + carried).toBeCloseTo(6 + foraged, 6);
  }, 60_000);
});

describe('F8 cut-seed-head by the AI', () => {
  it('a major collecting at a nearly bare plant node cuts a seed head; a minor does not', () => {
    const k = quietKit();
    const { sim, site, source } = onePatch(k);
    site.objectId = 1; // a plant's node
    site.seedHeads = 2;
    source.units = 1;
    const place = (a: Ant) => {
      walkerPlace(sim.field, a, source.pos, { dir: { x: 0, y: -1, z: 0 } }, sim.kernel.walker);
      a.nestId = -1; a.chamberId = -1;
      a.bb[K.phase] = PHASE.collect; a.bb[K.src] = source.id;
    };
    const [minor] = addAnts(k, 'minor', 1, k.nest.chambers[1], 'forage');
    const [major] = addAnts(k, 'major', 1, k.nest.chambers[1], 'forage', 1.6);
    place(minor); place(major);
    expect(cutHeadNow(sim, minor)).toBe(false);
    expect(cutHeadNow(sim, major)).toBe(true);
    expect(major.action?.id).toBe('cut-seed-head');
  });
});

describe('F9 summer-lull reference', () => {
  it('the reference is the mean of this year\'s seed days, so the lull can happen without spring seed', () => {
    const k = messorKit();
    const col = k.sim.state.colonies[0], mod = col.granary!;
    for (const x of [10, 12, 0, 8]) noteSeedDay(mod, 0, x);
    expect(mod.seedDayMean).toBeCloseTo(10, 9);
    expect(mod.seedDayCount).toBe(3);
    noteSeedDay(mod, 1, 4); // a new year starts a new mean
    expect(mod.seedDayMean).toBeCloseTo(4, 9);
    expect(typeof lullMult(k.sim, col, k.g)).toBe('number');
  });
});

describe('F10 put-down chamber', () => {
  it('a seed put down from outside a chamber onto its floor goes into the granary, not the pool', () => {
    const k = messorKit();
    const col = k.sim.state.colonies[0];
    const ch = k.granaryChamber;
    const [ant] = addAnts(k, 'media', 1, ch, 'idle');
    const per = k.g.pasteYield;
    const it = spawnItem(k.sim, { kind: 'seed', pos: ant.pos, init: { c: per * k.g.pasteC, p: per * k.g.pasteP, hardness: 0.3, colony: col.id } });
    it.carrierIds = [ant.id];
    ant.carry = { kind: 'item', id: it.id };
    expect(begin(k.sim, ant, 'put-down', null)).toBe(true); // onto the floor ahead of her head, inside the chamber
    ant.chamberId = -1; // as if she stood in the tunnel mouth
    expect(putDownChamberId(k.sim, ant)).toBe(ch.id);
    granaryDeliverySystem.run(k.sim);
    expect(stockOf(k.granary)).toBeCloseTo(1, 6);
  });
});

describe('F4 display seeds lie on the granary floor', () => {
  it('each display seed is in open space with solid floor just below it', () => {
    const k = messorKit();
    addSeeds(k.granary, k.g, 'S', 0.2, 12, 0.3, 0);
    syncDisplay(k.sim, k.sim.state.colonies[0]);
    const seeds = k.sim.state.items.filter((it) => it.alive && it.kind === 'seed' && it.chamberId === k.granaryChamber.id);
    expect(seeds.length).toBeGreaterThan(0);
    const bu = k.sim.world.bu;
    for (const it of seeds) {
      expect(k.sim.field.sampleXYZ(it.pos.x, it.pos.y, it.pos.z)).toBeGreaterThan(0);
      expect(k.sim.field.sampleXYZ(it.pos.x, it.pos.y - 0.3 * bu, it.pos.z)).toBeLessThanOrEqual(0);
    }
  });
});
