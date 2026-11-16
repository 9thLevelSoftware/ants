// Independent review of nest-fix3 (fleeing water, GDD 03 §11.3, task acceptance 2). Same small test nest as
// fleeWater.scenario.test.ts (food, nursery and royal chambers one below the other, one open entrance; wall drainage
// off, the test sets the water volume each flood second), but with the water rising at rates a flood-prone site
// reaches in a storm (Q_in = 1.2 x I x c x hydro: 1.8 and 3.6 BU^3/s here) instead of the scenario test's 0.36.
//
// Red tests in this file demonstrate review findings (left for the fixer):
//   - an ant (or the queen) "waits at the dry place" standing in water for game hours: the dry place is an exit-field
//     cavity sample 1 BU above the level, locomotion reports `arrived` up to ~1.5 BU short of it, and the wait is
//     never re-checked against her own feet (fleeWater.ts driveFleeing / checkFleeing);
//   - the possessed ant's water card shares kind + subject with combat's "Pinned" card: after a pin, a stale
//     wx.pAlert flag leaves her next submersion silent (flood/diagnostics.ts possessedFloodAlert).
import { describe, expect, it } from 'vitest';
import type { Ant, Sim } from '@/sim/types';
import { FLEE_WATER_DEPTH_BU, FLOOD_STEP_TICKS } from '@/sim/balance/weather';
import { floodCheats } from '@/sim/nest/flood/cheats';
import { spillFor } from '@/sim/nest/flood/runtime';
import { spillVolume } from '@/sim/nest/flood/spill';
import { depthOver, waterView } from '@/sim/nest/flood/dryPlace';
import { fillSphere } from '@/sim/nest/carveOps';
import { clearAlert, raiseAlert } from '@/sim/progression/alerts';
import { navTo } from '@/sim/locomotion';
import { TICKS_PER_HOUR } from '@/sim/time';
import { FW, isFleeingWater } from './fleeWater';
import { makeNestColony, run, type NestColony } from './testkit';

function colony(workers = 12, brood = true): NestColony {
  const k = makeNestColony({
    workers, seed: 3, stores: { c: 100, p: 100 },
    brood: brood ? [
      { stage: 'egg', n: 3, chamber: 'royal' }, { stage: 'larva', n: 3, chamber: 'royal' }, { stage: 'pupa', n: 2, chamber: 'royal', progress: 0.1 },
    ] : [],
  });
  floodCheats(k.sim.state).drainScale = 0;
  floodCheats(k.sim.state).rainI = 0;
  run(k.sim, 50);
  return k;
}

/** Water volume that fills the basin up to the given flooded share of one chamber (spill order). */
function waterForShare(sim: Sim, k: NestColony, chamberId: number, share: number): number {
  const cache = spillFor(sim, k.nest);
  const list = cache.chamberSamples.get(chamberId)!;
  const idx = list[Math.min(list.length - 1, Math.floor(share * list.length))];
  return cache.cumVol[idx + 1];
}

function ramp(sim: Sim, k: NestColony, target: number, seconds: number, each?: () => void): void {
  const start = k.nest.flood.water;
  for (let s = 0; s < seconds; s++) {
    k.nest.flood.water = start + ((target - start) * (s + 1)) / seconds;
    run(sim, FLOOD_STEP_TICKS);
    each?.();
  }
}

const feet = (a: Ant) => a.pos.y - a.up.y * a.footOffset;
const alive = (k: NestColony) => k.sim.stores.ants.list.filter((a) => a.alive && a.colony === k.queen.colony);

/** Water over the ant's feet, BU (-Infinity off the basin or when the nest is dry). */
function depthBu(k: NestColony, a: Ant): number {
  const w = waterView(k.sim, k.nest);
  return w ? depthOver(k.sim, w, a.pos, feet(a)) / k.sim.world.bu : -Infinity;
}

/** Ants that have finished their flight (waiting at "the dry place") yet stand in water deep enough to flee. */
function waitingInWater(k: NestColony): string[] {
  return alive(k)
    .filter((a) => isFleeingWater(a) && a.bb[FW.phase] === 1 && depthBu(k, a) >= FLEE_WATER_DEPTH_BU)
    .map((a) => `${a.id}:${a.caste}:${a.state}@ch${a.chamberId} depth ${depthBu(k, a).toFixed(2)} BU`);
}

describe('review nest-fix3: the dry place is dry', () => {
  it('royal chamber filled in 80 s (1.8 BU^3/s): an hour later no ant waits at her "dry place" in water', () => {
    const k = colony();
    const full = waterForShare(k.sim, k, k.royal.id, 1);
    ramp(k.sim, k, full, 80);
    run(k.sim, TICKS_PER_HOUR);
    // RED: worker 13 (queen-care) waits in flee.freeze in the tunnel above the royal chamber 0.21 BU deep, for as
    // long as the water stays (6 game hours in the probe), retargeted to the same unreachable sample every 25 s
    expect(waitingInWater(k)).toEqual([]);
  }, 60_000);

  it('royal chamber filled in 40 s (3.6 BU^3/s): the queen reaches a dry chamber above it within an hour', () => {
    const k = colony();
    const full = waterForShare(k.sim, k, k.royal.id, 1);
    ramp(k.sim, k, full, 40);
    run(k.sim, TICKS_PER_HOUR);
    const q = k.queen;
    // RED: she waits in flee.freeze in the tunnel 0.20 BU deep for 6+ game hours (the nursery above is dry and
    // reachable; GDD 03 §11.3 "moves to the highest dry chamber")
    expect({ state: q.state, chamber: q.chamberId, wet: depthBu(k, q) >= FLEE_WATER_DEPTH_BU })
      .toEqual({ state: 'queen.reside', chamber: expect.toSatisfy((c: number) => c === k.nursery.id || c === k.food.id), wet: false });
  }, 60_000);

  it('royal chamber filled in 80 s: every brood item is out of the water before the chamber is 25 % flooded', () => {
    const k = colony();
    const { sim } = k;
    const full = waterForShare(sim, k, k.royal.id, 1);
    let wetAt25 = -1;
    ramp(sim, k, full, 80, () => {
      const w = waterView(sim, k.nest);
      if (wetAt25 >= 0 || !w || k.royal.flooded < 0.25) return;
      wetAt25 = sim.stores.brood.list.filter((b) => b.alive && b.carriedBy < 0 && depthOver(sim, w, b.pos, b.pos.y) > 0).length;
    });
    expect(wetAt25).toBe(0);
    const deaths: string[] = [];
    sim.events.on('brood-died', (e) => deaths.push(e.cause));
    run(sim, TICKS_PER_HOUR);
    expect(deaths).toEqual([]);
  }, 60_000);
});

describe('review nest-fix3: no entrance open, water below the top (high-ground path)', () => {
  it('sealed nest half full: the ants climb to the dry part and nobody drowns', () => {
    const k = colony(8, false);
    const { sim } = k;
    const deaths: string[] = [];
    sim.events.on('ant-died', (e) => deaths.push(e.cause));
    fillSphere(sim, { ...k.entrance.pos, y: k.entrance.pos.y - 1.5 * sim.world.bu }, 2.5 * sim.world.bu);
    run(sim, 100);
    expect(k.entrance.status).toBe('sealed');
    // up to the nursery's top: royal and nursery flooded, the food chamber and the shaft stay dry
    ramp(sim, k, waterForShare(sim, k, k.nursery.id, 1), 120);
    expect(k.nursery.flooded).toBeGreaterThan(0.95);
    expect(k.food.flooded).toBe(0);
    expect(spillVolume(spillFor(sim, k.nest))).toBeGreaterThan(k.nest.flood.water);
    run(sim, 2 * TICKS_PER_HOUR);
    expect(deaths.filter((d) => d === 'drowning')).toEqual([]);
    expect(k.queen.alive).toBe(true);
  }, 60_000);
});

describe('review nest-fix3: surface ants do not walk into the flooded nest', () => {
  it('a worker outside sent to a point under water stops at the surface (held), and resumes once it drained', () => {
    const k = colony(6, false);
    const { sim } = k;
    const bu = sim.world.bu;
    ramp(sim, k, waterForShare(sim, k, k.nursery.id, 1), 30);
    const w = alive(k).find((a) => a.caste === 'worker' && !isFleeingWater(a))!;
    // put her on the ground 8 BU from the opening and send her to the royal floor (under water)
    const x = k.entrance.pos.x + 8 * bu, z = k.entrance.pos.z;
    w.pos = { x, y: sim.field.height(x, z) + w.footOffset, z };
    w.up = { x: 0, y: 1, z: 0 };
    w.nestId = -1; w.chamberId = -1;
    const dest = { x: k.royal.center.x, y: k.royal.center.y - k.royal.radii.y, z: k.royal.center.z };
    expect(navTo(sim, w, dest, bu)).toBe(true);
    run(sim, 2 * FLOOD_STEP_TICKS);
    expect(isFleeingWater(w)).toBe(true);
    expect(w.state).toBe('flee.freeze');
    run(sim, 200);
    expect(sim.field.substrate(w.pos)).toBeGreaterThanOrEqual(-0.5 * bu); // still at the surface
    k.nest.flood.water = 0;
    run(sim, 3 * FLOOD_STEP_TICKS);
    expect(isFleeingWater(w)).toBe(false);
  }, 60_000);
});

describe('review nest-fix3: the possessed ant\'s water card next to combat\'s "Pinned" card', () => {
  it('pinned while under water, then dried and unpinned: her next submersion raises the water card again', () => {
    const k = colony(6, false);
    const { sim } = k;
    const bu = sim.world.bu;
    const d = (a: Ant) => Math.hypot(a.pos.x - k.royal.center.x, a.pos.y - k.royal.center.y, a.pos.z - k.royal.center.z);
    const p = alive(k).filter((a) => a.caste === 'worker').sort((a, b) => d(a) - d(b))[0];
    sim.enqueue({ type: 'possess', antId: p.id });
    run(sim, 2);
    const card = () => sim.state.progression.alerts.find((a) => a.kind === 'possessed-danger' && a.subjectId === p.id);
    const cache = spillFor(sim, k.nest), v = sim.carve.voxel;
    const upTo = (y: number) => { let n = 0; while (n < cache.level.length && (cache.level[n] - 0.5) * v < y) n++; return cache.cumVol[n]; };
    const wet = upTo(feet(p) + bu);
    ramp(sim, k, wet, 10);
    run(sim, 30);
    expect(card()?.cause).toBe('under-water');
    // combat pins her (src/sim/combat/alerts.ts raises exactly this) ...
    raiseAlert(sim, {
      kind: 'possessed-danger', level: 'warning', subjectId: p.id, title: 'Pinned', cause: 'pinned',
      focus: { kind: 'ant', id: p.id, pos: { ...p.pos } }, diagnosticId: null, tokens: { cause: 'pinned' },
    });
    // ... the water drains, then combat lets go (unpin clears the shared card)
    k.nest.flood.water = 0;
    run(sim, 30);
    clearAlert(sim, 'possessed-danger', p.id);
    run(sim, 10);
    expect(card()).toBeUndefined();
    // the water comes back over her
    ramp(sim, k, wet, 10);
    run(sim, 30);
    expect((p.bb['wx.sub'] ?? 0)).toBeGreaterThan(0);
    // RED: wx.pAlert stayed 1 (the flood only clears it for a card whose cause is still 'under-water'), so the
    // possessed ant drowns without a card
    expect(card()?.cause).toBe('under-water');
  }, 60_000);
});
