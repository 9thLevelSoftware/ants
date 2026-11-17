// Reviewer tests (adversarial) for the loco task. Tests that fail demonstrate a bug and stay in place for the fixer;
// the passing ones are regression tests.
import { describe, expect, it } from 'vitest';
import type { Ant, PheromoneField, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { collectInvariants } from '@/sim/testing/invariants';
import { locoStats, navFollowTrail, navRetrace, navStop, navTo, navToTarget, navWander, placeOnSurface, setLocoObserver } from './index';
import { rt } from './runtime';
import { clearance, deepestChamber, locoSim, placeInChamber, playerNest, runUntilDone, v3, workers } from './testkit';

function teleport(sim: Sim, ant: Ant, x: number, z: number): void {
  sim.enqueue({ type: 'cheat.teleport', antId: ant.id, pos: v3(x, 0, z) });
  sim.tick();
}

describe('reviewer: arrival', () => {
  // BLOCKER. DEFAULT_ARRIVE_BU is 0.5 BU (2 mm). tripArrived needs dist3 <= 0.4 x arriveDist from the jittered
  // goal (0.8 mm) or <= 0.25 x arriveDist from the destination (0.5 mm), measured in 3D although the walker's
  // centre is footOffset (0.4 mm) above the ground point it was sent to, and the walker moves 2.4 mm per tick.
  // followSeek already reports 'done' within 1.25 BU, the replanned seek is 'done' again, the desired direction
  // becomes zero but the speed stays, so the ant walks on blindly and orbits the goal. Every replan resets the
  // stuck window, so no stuck episode is ever counted: the request only ends by its timeout (~100 s for 30 BU).
  it('navTo with the default arrival radius arrives on flat ground (8 approach directions)', () => {
    const sim = locoSim({ sizeBu: 300 });
    const bu = sim.world.bu, c = sim.world.size / 2;
    const ant = sim.state.ants[0];
    const results: string[] = [];
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * 2 * Math.PI;
      teleport(sim, ant, c + Math.cos(ang) * 30 * bu, c + Math.sin(ang) * 30 * bu);
      ant.fwd = { x: 0, y: 0, z: 1 };
      expect(navTo(sim, ant, v3(c + 3 * bu, sim.field.height(c, c), c - 2 * bu))).toBe(true);
      const ticks = runUntilDone(sim, [ant], 3000);
      results.push(`${ant.nav.status}@${ticks}`);
    }
    const st = locoStats(sim);
    // 30 BU at 6 BU/s is 5 s = 50 ticks; allow 4x
    expect(results, JSON.stringify(st)).toEqual(results.map(() => expect.stringMatching(/^arrived@([0-9]|[0-9][0-9]|1[0-9][0-9])$/)));
  });

  // MAJOR. A walker that circles its goal never counts as stuck (see above), so the ladder is bypassed and only the
  // request timeout (60 s + 8 x the straight-line time) ends it.
  it('a walker that cannot satisfy the arrival test is detected as stuck long before the request timeout', () => {
    const sim = locoSim({ sizeBu: 300 });
    const bu = sim.world.bu, c = sim.world.size / 2;
    const ant = sim.state.ants[0];
    teleport(sim, ant, c - 30 * bu, c + 7 * bu);
    ant.fwd = { x: 0, y: 0, z: 1 };
    navTo(sim, ant, v3(c, 0, c), 0.2 * bu, { speed: 6 * bu });
    const ticks = runUntilDone(sim, [ant], 3000);
    if (ant.nav.status === 'failed') {
      expect(locoStats(sim).stuckEpisodes).toBeGreaterThan(0);
      expect(ticks).toBeLessThan(300);
    }
  });
});

describe('reviewer: steering composition', () => {
  // MAJOR. Leg desired directions are raw mm offsets (towardXZ / toward3: tens to hundreds of mm) and the unitless
  // separation / floor-bias / edge / avoid terms (weights 0.35-1.5) are added to them unnormalised, so those terms
  // are 1-5 % of their intended weight. Two ants 0.6 BU apart near their goals barely separate.
  it('light separation pushes two side-by-side ants near their goals apart (spike-nest §5 item 12)', () => {
    const sim = locoSim({ sizeBu: 300, nest: 'small', workers: 2 });
    const bu = sim.world.bu, c = sim.world.size / 2 - 60 * bu;
    const [a, b] = workers(sim);
    teleport(sim, a, c, c);
    teleport(sim, b, c, c + 0.6 * bu);
    a.fwd = { x: 1, y: 0, z: 0 };
    b.fwd = { x: 1, y: 0, z: 0 };
    navTo(sim, a, v3(c + 11 * bu, 0, c), 0.05 * bu, { speed: 6 * bu });
    navTo(sim, b, v3(c + 11 * bu, 0, c + 0.6 * bu), 0.05 * bu, { speed: 6 * bu });
    for (let t = 0; t < 12; t++) sim.tick();
    // with sepW 0 the gap stays 0.59 BU; at the default weight it only grows to ~0.64 BU (would be ~1 BU if the
    // separation term were weighed against a unit desired direction)
    expect((b.pos.z - a.pos.z) / bu).toBeGreaterThan(0.8);
  });

  // Fixer's note: the metric was "up.y < 0.5" (any steep surface). The small test nest is mostly vertical shafts,
  // where every position is steep and "down" is along the way, so no floor bias can change that share (after the
  // normalisation fix: 58.2 % without, 57.5 % with it). Helix drift shows as time on the upper half of tunnels
  // (walls past vertical and ceilings, up.y < 0): 13.7 % without the bias, 9.7 % with it. steer.test.ts adds a
  // straight horizontal tunnel case.
  it('the prefer-floor bias changes how much time walkers spend on steep tunnel walls (spike-nest §5 item 4)', () => {
    const steepShare = (floorW: number) => {
      const sim = locoSim({ sizeBu: 300, nest: 'small', workers: 40 });
      const bu = sim.world.bu;
      const P = rt(sim).P, old = P.floorW;
      P.floorW = floorW;
      try {
        const nest = playerNest(sim), e = nest.entrances[0];
        const ants = workers(sim);
        placeInChamber(sim, ants, nest, deepestChamber(nest));
        for (const a of ants) navTo(sim, a, v3(e.pos.x - 40 * bu, 0, e.pos.z), 3 * bu, { speed: 6 * bu });
        let cav = 0, steep = 0;
        runUntilDone(sim, ants, 3000, () => {
          for (const a of ants) if (a.medium === 'cavity') { cav++; if (a.up.y < 0) steep++; }
        });
        return steep / cav;
      } finally {
        P.floorW = old;
      }
    };
    const off = steepShare(0), on = steepShare(rt(locoSim({ sizeBu: 128 })).P.floorW);
    // measured: 50.4 % without the bias, 50.9 % with it: the bias is a no-op
    expect(Math.abs(on - off)).toBeGreaterThan(0.02);
  }, 60_000);
});

describe('reviewer: level of detail', () => {
  // MAJOR. Walker.prevPos is "the previous tick's pos" (render interpolation). A LOD-skipped walker keeps the
  // prevPos of its last step, so on every skipped tick the renderer re-plays the same prevPos -> pos motion
  // (far ants rubber-band 2-4 times per step).
  it('a walker skipped by LOD has prevPos == pos on the skipped tick', () => {
    const sim = locoSim({ sizeBu: 700 });
    const bu = sim.world.bu;
    const ant = sim.state.ants[0];
    teleport(sim, ant, 350 * bu, 350 * bu);
    setLocoObserver(sim, v3(40 * bu, 0, 40 * bu)); // > lodFar away: steps every 4th tick
    navWander(sim, ant, ant.pos, 30 * bu, { speed: 6 * bu });
    let skippedStale = 0, skipped = 0;
    for (let t = 0; t < 40; t++) {
      const before = { ...ant.pos };
      sim.tick();
      const moved = ant.pos.x !== before.x || ant.pos.z !== before.z;
      if (!moved) {
        skipped++;
        if (ant.prevPos.x !== ant.pos.x || ant.prevPos.z !== ant.pos.z) skippedStale++;
      }
    }
    expect(skipped).toBeGreaterThan(10);
    expect(skippedStale).toBe(0);
  });
});

describe('reviewer: edge cases', () => {
  it('a NaN destination is rejected (or fails) and never puts NaN into the walker', () => {
    const sim = locoSim({ sizeBu: 200 });
    const ant = sim.state.ants[0];
    const ok = navTo(sim, ant, v3(Number.NaN, 0, 10));
    for (let t = 0; t < 50; t++) sim.tick();
    expect(Number.isFinite(ant.pos.x + ant.pos.y + ant.pos.z + ant.fwd.x + ant.fwd.y + ant.fwd.z)).toBe(true);
    expect(ok ? ant.nav.status !== 'moving' : ant.nav.status === 'failed').toBe(true);
  });

  it('an infinite destination never puts NaN into the walker and the request ends', () => {
    const sim = locoSim({ sizeBu: 200 });
    const ant = sim.state.ants[0];
    navTo(sim, ant, v3(Number.POSITIVE_INFINITY, 0, 10));
    const ticks = runUntilDone(sim, [ant], 3000);
    expect(Number.isFinite(ant.pos.x + ant.pos.y + ant.pos.z + ant.fwd.x + ant.fwd.y + ant.fwd.z)).toBe(true);
    expect(ticks).toBeLessThan(3000);
  });

  it('a destination outside the map ends (failed or arrived at the limit) within a bounded time', () => {
    const sim = locoSim({ sizeBu: 200 });
    const bu = sim.world.bu;
    const ant = sim.state.ants[0];
    navTo(sim, ant, v3(sim.world.size + 500 * bu, 0, 100 * bu), 2 * bu, { speed: 6 * bu });
    const ticks = runUntilDone(sim, [ant], 6000);
    expect(ticks).toBeLessThan(6000);
    const lo = 8 * bu, hi = sim.world.size - lo;
    expect(ant.pos.x).toBeGreaterThanOrEqual(lo - 1e-6);
    expect(ant.pos.x).toBeLessThanOrEqual(hi + 1e-6);
  });

  it('a point goal inside a nest chamber (point field) is reached with a 1 BU radius', () => {
    const sim = locoSim({ nest: 'small', workers: 6, sizeBu: 300 });
    const bu = sim.world.bu;
    const nest = playerNest(sim);
    const ants = workers(sim);
    const deep = deepestChamber(nest);
    placeInChamber(sim, ants, nest, nest.chambers.find((c) => c.id !== deep.id)!);
    // a point on the deepest chamber's floor
    const goal = v3(deep.center.x, deep.center.y - deep.radii.y + 0.3 * bu, deep.center.z);
    for (const a of ants) expect(navTo(sim, a, goal, bu, { speed: 6 * bu })).toBe(true);
    runUntilDone(sim, ants, 3000);
    for (const a of ants) {
      expect(a.nav.status).toBe('arrived');
      expect(Math.hypot(a.pos.x - goal.x, a.pos.y - goal.y, a.pos.z - goal.z)).toBeLessThan(1.5 * bu);
    }
  });

  it('navStop holds a walker still and idle', () => {
    const sim = locoSim({ sizeBu: 200 });
    const bu = sim.world.bu;
    const ant = sim.state.ants[0];
    navTo(sim, ant, v3(ant.pos.x + 30 * bu, 0, ant.pos.z), 2 * bu, { speed: 6 * bu });
    for (let t = 0; t < 10; t++) sim.tick();
    navStop(sim, ant);
    const p = { ...ant.pos };
    for (let t = 0; t < 10; t++) sim.tick();
    expect(ant.nav.status).toBe('idle');
    expect(Math.hypot(ant.pos.x - p.x, ant.pos.z - p.z)).toBeLessThan(1e-6);
  });

  it('the world-bounds, finite and free-space invariants hold for walkers pushed against every map edge', () => {
    const sim = locoSim({ sizeBu: 300, nest: 'small', workers: 40 });
    const bu = sim.world.bu, size = sim.world.size;
    const ants = workers(sim);
    ants.forEach((a, i) => {
      const side = i % 4, f = ((i >> 2) + 1) / 12;
      const x = side === 0 ? 10 * bu : side === 1 ? size - 10 * bu : f * size;
      const z = side === 2 ? 10 * bu : side === 3 ? size - 10 * bu : f * size;
      teleport(sim, a, x, z);
      const out = v3(side === 0 ? -100 * bu : side === 1 ? size + 100 * bu : x, 0, side === 2 ? -100 * bu : side === 3 ? size + 100 * bu : z);
      navTo(sim, a, out, 2 * bu, { speed: 6 * bu });
    });
    const invs = collectInvariants().filter((i) => ['walker-finite', 'walker-free-space', 'walker-in-bounds'].includes(i.name));
    const bad: string[] = [];
    for (let t = 0; t < 400; t++) {
      sim.tick();
      if (t % 20 === 0) for (const inv of invs) inv.check(sim, (d) => bad.push(d));
    }
    expect(bad).toEqual([]);
    for (const a of ants) expect(clearance(sim, a)).toBeGreaterThanOrEqual(0.3);
  });
});

describe('reviewer: trips to one of several nests of a colony', () => {
  // MAJOR. The surface leg toward a nest uses the colony-wide flow field (every open entrance of every nest of the
  // colony), so a walker bound for nest A is led to the nearest entrance of nest B instead; there followFlow says
  // 'done', planLeg (straight-line nearest entrance of A, far away) picks the flow again, and the walker stands at
  // B's entrance until the request times out (each replan resets the stuck window).
  it('a walker on the surface heading into nest A is not captured by the entrance of the colony\'s nest B', () => {
    const sim = locoSim({ nest: 'small', workers: 1, sizeBu: 400 });
    const bu = sim.world.bu;
    const nestA = playerNest(sim);
    const deep = deepestChamber(nestA);
    const eA = nestA.entrances[0];
    // a second nest of the same colony, its open entrance 60 BU west of A's, between the walker and A
    const nestB = structuredClone(nestA);
    nestB.id = nestA.id + 1000;
    nestB.chambers = [];
    nestB.entrances = [{ ...structuredClone(eA), id: eA.id + 1000, pos: v3(eA.pos.x - 60 * bu, 0, eA.pos.z) }];
    nestB.entrances[0].pos.y = sim.field.height(nestB.entrances[0].pos.x, nestB.entrances[0].pos.z);
    nestB.origin = { ...nestB.entrances[0].pos };
    sim.state.nests.push(nestB);
    sim.stores.nests.rebuild();
    sim.state.colonies[0].nestIds.push(nestB.id);
    const ant = workers(sim)[0];
    teleport(sim, ant, eA.pos.x - 120 * bu, eA.pos.z);
    expect(ant.medium).toBe('surface');
    expect(navTo(sim, ant, deep.center, bu, { speed: 6 * bu }) || true).toBe(true);
    const ticks = runUntilDone(sim, [ant], 2500);
    expect(ant.nav.status, `after ${ticks} ticks at ${JSON.stringify(ant.pos)}, B entrance ${JSON.stringify(nestB.entrances[0].pos)}`).toBe('arrived');
    expect(ant.nestId).toBe(nestA.id);
  });
});

describe('reviewer: entrance next to a stone', () => {
  // Lasius entrances are often at the edge of a stone. A walker coming home from behind the stone reaches the
  // entrance's nav cell (flow 'done'), the direct seek is refused because the stone blocks the lifted segment, the
  // planner picks the flow field again, which is 'done' again: the walker must still get in.
  it('a walker returning from behind a stone next to the entrance gets in', () => {
    const probe = locoSim({ nest: 'small', workers: 1, sizeBu: 300 });
    const e0 = playerNest(probe).entrances[0];
    const bu = probe.world.bu;
    const stone = {
      id: 1, shape: 'ellipsoid' as const, pos: { x: e0.pos.x - 6 * bu, y: e0.pos.y, z: e0.pos.z }, rot: { x: 0, y: 0, z: 0, w: 1 },
      size: { x: 3.5 * bu, y: 4 * bu, z: 5 * bu }, round: 0, material: 'stone' as const, flags: 0, objectId: -1,
    };
    const sim = locoSim({ nest: 'small', workers: 1, sizeBu: 300, prims: [stone] });
    const nest = playerNest(sim), e = nest.entrances[0];
    expect(e.pos.x).toBeCloseTo(e0.pos.x, 6);
    const ant = workers(sim)[0];
    const deep = deepestChamber(nest);
    const results: string[] = [];
    for (const dz of [0, 1.5, -1.5]) {
      teleport(sim, ant, e.pos.x - 60 * bu, e.pos.z + dz * bu);
      expect(ant.medium).toBe('surface');
      navToTargetChamber(sim, ant, deep.id, deep.center, bu);
      const ticks = runUntilDone(sim, [ant], 3000);
      results.push(`${ant.nav.status}@${ticks}`);
    }
    expect(results).toEqual(results.map(() => expect.stringMatching(/^arrived/)));
  });
});

function navToTargetChamber(sim: Sim, ant: Ant, id: number, pos: { x: number; y: number; z: number }, arrive: number): void {
  expect(navToTarget(sim, ant, { kind: 'chamber', id, pos }, arrive, { speed: 6 * sim.world.bu })).toBe(true);
}

describe('reviewer: relocation on the ladder', () => {
  // MAJOR. legTarget() returns the walker's OWN position for a surface leg that follows the colony's entrance flow
  // field (update.ts, case 'path' with flowKey), so rung 5 "relocate along the route" places the walker where it
  // already is, counts a relocation and emits ant-unstuck with from == to. Every homeward surface trip uses that leg.
  it('a stuck walker on the homeward flow-field leg is relocated forward, not onto itself', () => {
    const sim = locoSim({ nest: 'small', workers: 1, sizeBu: 300 });
    const bu = sim.world.bu;
    const nest = playerNest(sim), deep = deepestChamber(nest), e = nest.entrances[0];
    const ant = workers(sim)[0];
    teleport(sim, ant, e.pos.x - 80 * bu, e.pos.z);
    const moves: number[] = [];
    sim.events.on('ant-unstuck', (ev) => moves.push(Math.hypot(ev.to.x - ev.from.x, ev.to.z - ev.from.z) / bu));
    // speed 0: the walker cannot make progress, so the ladder climbs to the relocation rung. Since loco-fix3 review a
    // walker that cannot move at all is not stuck (stuckTravel: it waits for its timeout), so the test also tells the
    // ladder that the walker could have moved (as one wedged at cruise would have)
    expect(navToTarget(sim, ant, { kind: 'chamber', id: deep.id, pos: deep.center }, bu, { speed: 0 })).toBe(true);
    const s = ant.nav.loco!;
    for (let t = 0; t < 400 && moves.length === 0; t++) { s.stallFrom = s.bestTick; s.stallTravel = Infinity; sim.tick(); }
    expect(ant.nav.mode).toBe('path');
    expect(moves.length).toBeGreaterThan(0);
    expect(moves[0]).toBeGreaterThan(1);
  });
});

describe('reviewer: possessed ant input robustness', () => {
  it('a NaN intent direction leaves the possessed ant finite and standing', () => {
    const sim = locoSim({ sizeBu: 200 });
    const ant = sim.state.ants[0];
    teleport(sim, ant, 100 * sim.world.bu, 100 * sim.world.bu);
    ant.flags |= AntFlag.POSSESSED;
    sim.state.player.possessedAntId = ant.id;
    sim.setPlayerIntent({ dir: { x: Number.NaN, y: 0, z: 0 }, hurry: false, grip: false, held: [], flight: null });
    for (let t = 0; t < 5; t++) sim.tick();
    expect(Number.isFinite(ant.pos.x + ant.pos.y + ant.pos.z + ant.fwd.x + ant.speed)).toBe(true);
  });
});

describe('reviewer: avoid markers placed while walkers are under way (GDD 02 App. E 20)', () => {
  // MAJOR. Plans react to avoid markers only when a leg is planned; nothing replans when a marker appears, and the
  // steering repulsion is too weak against mm-scale leg directions (see steering composition), so a walker that is
  // already under way walks straight through a freshly placed avoid disc.
  it('a walker already under way does not walk through an avoid marker placed across its route', () => {
    const sim = locoSim({ sizeBu: 400, nest: 'small', workers: 1 });
    const bu = sim.world.bu, c = sim.world.size / 2;
    const ant = workers(sim)[0];
    teleport(sim, ant, c - 80 * bu, c);
    expect(navTo(sim, ant, v3(c + 80 * bu, 0, c), 2 * bu, { speed: 6 * bu })).toBe(true);
    for (let t = 0; t < 20; t++) sim.tick();
    sim.state.markers.push({
      id: 7778, alive: true, kind: 'avoid', pos: v3(c, 0, c), radius: 30 * bu, colony: ant.colony, targetChamberId: -1,
      sourceChamberId: -1, expiresTick: -1, params: { mode: null, priority: null, chamberType: null, planId: -1 }, placedTick: sim.state.tick,
    });
    sim.stores.markers.rebuild();
    let minD = Infinity;
    runUntilDone(sim, [ant], 3000, () => { minD = Math.min(minD, Math.hypot(ant.pos.x - c, ant.pos.z - c)); });
    expect(ant.nav.status).toBe('arrived');
    expect(minD / bu).toBeGreaterThan(28);
  });
});

describe('reviewer: homing by breadcrumbs after a long looping outbound walk (GDD 02 App. E 17, at loco level)', () => {
  it('300 BU out on a looping path (crumb thinning at CRUMB_CAP), retrace home <= 1.4 x straight line', () => {
    const sim = locoSim({ sizeBu: 900, nest: 'small', workers: 1 });
    const bu = sim.world.bu;
    const nest = playerNest(sim), e = nest.entrances[0];
    const ant = workers(sim)[0];
    // outbound: a looping walk (a spiral of loops drifting away from the entrance), ending 300 BU away
    const pts = [];
    for (let i = 1; i <= 24; i++) {
      const base = (i / 24) * 300 * bu, a = i * 1.9;
      pts.push(v3(e.pos.x - base + Math.cos(a) * 25 * bu, 0, e.pos.z + Math.sin(a) * 25 * bu + 0.4 * base));
    }
    const end = pts[pts.length - 1];
    for (const p of pts) {
      p.y = sim.field.height(p.x, p.z);
      expect(navTo(sim, ant, p, 3 * bu, { speed: 6 * bu })).toBe(true);
      runUntilDone(sim, [ant], 3000);
      expect(ant.nav.status).toBe('arrived');
    }
    expect(ant.nestId).toBe(-1);
    const straight = Math.hypot(ant.pos.x - e.pos.x, ant.pos.z - e.pos.z);
    expect(straight / bu).toBeGreaterThan(250);
    expect(Math.hypot(ant.pos.x - end.x, ant.pos.z - end.z)).toBeLessThan(3 * bu);
    expect(ant.mem.crumbLen).toBeGreaterThan(3);
    expect(navRetrace(sim, ant, { speed: 6 * bu })).toBe(true);
    let walked = 0, prev = { ...ant.pos };
    const plansBefore = locoStats(sim).plans;
    runUntilDone(sim, [ant], 6000, () => { walked += Math.hypot(ant.pos.x - prev.x, ant.pos.z - prev.z); prev = { ...ant.pos }; });
    expect(ant.nav.status).toBe('arrived');
    expect(Math.hypot(ant.pos.x - e.pos.x, ant.pos.z - e.pos.z) / bu).toBeLessThan(3);
    expect(walked / straight).toBeLessThan(1.4);
    expect(locoStats(sim).plans).toBe(plansBefore); // no planner use
  }, 60_000);
});

describe('reviewer: trail following at coarse LOD', () => {
  /** A straight trail of 4 BU cells along `pts` (no gap), read bilinearly like trail.test.ts's fake field. */
  function trailField(pts: { x: number; z: number }[], cell: number, value: number): PheromoneField {
    const cells = new Map<string, number>();
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], L = Math.hypot(b.x - a.x, b.z - a.z);
      for (let t = 0; t <= L; t += cell / 4) cells.set(`${Math.floor((a.x + ((b.x - a.x) * t) / L) / cell)},${Math.floor((a.z + ((b.z - a.z) * t) / L) / cell)}`, value);
    }
    const at = (ix: number, iz: number) => cells.get(`${ix},${iz}`) ?? 0;
    const read = (p: { x: number; z: number }) => {
      const fx = p.x / cell - 0.5, fz = p.z / cell - 0.5, ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
      return at(ix, iz) * (1 - tx) * (1 - tz) + at(ix + 1, iz) * tx * (1 - tz) + at(ix, iz + 1) * (1 - tx) * tz + at(ix + 1, iz + 1) * tx * tz;
    };
    return {
      deposit() {}, sample: (_c, _ch, p) => read(p), decay() {}, scaleRegion() {}, clearColony() {},
      sense: (_c, _ch, p, _f, _u, out) => { out.x = 0; out.y = 0; out.z = 0; return read(p); },
    };
  }

  // The trail-steering offset is applied once per evaluation and not scaled by dt, so a walker that LOD steps every
  // 4th tick turns 4x slower per game second along a trail than one near the camera.
  for (const far of [false, true]) {
    it(`follows a 60 deg bend ${far ? 'far from the observer (LOD every 4th tick)' : 'near the observer'}`, () => {
      const sim = locoSim({ sizeBu: 700 });
      const bu = sim.world.bu, c = sim.world.size / 2;
      const A = { x: c - 60 * bu, z: c + 2 * bu }, B = { x: c, z: c + 2 * bu };
      const C = { x: B.x + Math.cos(Math.PI / 3) * 60 * bu, z: B.z + Math.sin(Math.PI / 3) * 60 * bu };
      (sim as { phero: PheromoneField }).phero = trailField([A, B, C], 4 * bu, 10);
      setLocoObserver(sim, far ? v3(20 * bu, 0, 20 * bu) : v3(c, 0, c));
      const ant = sim.state.ants[0];
      teleport(sim, ant, A.x + 2 * bu, A.z);
      ant.fwd = { x: 1, y: 0, z: 0 };
      navFollowTrail(sim, ant, ant.colony, 'trail', 'any', { speed: 6 * bu });
      let minToEnd = Infinity;
      runUntilDone(sim, [ant], 600, () => { minToEnd = Math.min(minToEnd, Math.hypot(ant.pos.x - C.x, ant.pos.z - C.z)); });
      expect(minToEnd / bu).toBeLessThan(5);
    });
  }
});

describe('reviewer: walkers in carved space that belongs to no nest', () => {
  // MAJOR. planLeg returns false ("underground in no known nest") for any walker whose medium is 'cavity' outside a
  // registered nest, so every trip fails at once from a natural cavity, an asphalt crack or a pit carved into the
  // ground (GDD 04 §6-7 micro-connections and pre-existing cavities are carve-grid space).
  it('a walker standing in an open carved pit (no nest) can walk out to a surface point', () => {
    const sim = locoSim({ sizeBu: 300 });
    const bu = sim.world.bu, c = sim.world.size / 2;
    const ant = sim.state.ants[0];
    sim.kernel.carveSphere(v3(c, 0, c), 4 * bu, { force: true });
    sim.tick();
    expect(placeOnSurface(sim, ant, v3(c, -2 * bu, c), v3(0, -1, 0))).toBe(true);
    sim.tick();
    expect(ant.medium).toBe('cavity');
    expect(ant.nestId).toBe(-1);
    expect(navTo(sim, ant, v3(c + 30 * bu, 0, c), 2 * bu, { speed: 6 * bu })).toBe(true);
    runUntilDone(sim, [ant], 2000);
    expect(ant.nav.status).toBe('arrived');
  });
});
