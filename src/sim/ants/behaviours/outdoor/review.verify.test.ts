// Reviewer tests (beh-forage review): unit-level probes of rules that the implementation's own tests do not
// reach. A failing test here documents a defect for the fixer; a passing one stays as a regression test.

import { describe, expect, it } from 'vitest';
import type { Ant, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { placeOnSurface } from '@/sim/locomotion';
import { restore, snapshot, stateHash } from '@/sim/save';
import { createSim } from '@/sim/sim';
import { makeTestSim } from '@/sim/testing';
import { daysToTicks } from '@/sim/time';
import { isDepletedFor, markDepleted } from './choice';
import { FORAGE } from './flavours';
import { K, PHASE } from './keys';
import { noteTrailLost } from './monitor';
import { updateCollect } from './phaseCollect';
import { commitRoute, prepareRoute, routeFor } from './routes';
import { startCollect } from './transitions';
import { forageScenario } from './testkit';

function crumbs(ant: Ant, pts: [number, number][]): void {
  const m = ant.mem;
  pts.forEach(([x, z], i) => { m.crumbs[3 * i] = x; m.crumbs[3 * i + 1] = 0; m.crumbs[3 * i + 2] = z; });
  m.crumbLen = pts.length - 1;
  m.crumbHead = m.crumbLen;
  const [x, z] = pts[pts.length - 1];
  ant.pos = { x, y: 0, z };
}

describe('review: depleted-source memory (GDD 02 §9.3)', () => {
  it('a source found empty on two consecutive visits clears its route slot', () => {
    // The depleted entry blocks the source for DEPLETED_GD (1 gd), so the ant's next visit to it necessarily comes
    // after the entry expired. "Twice in a row" must still be recognised then; otherwise the rule never fires in play.
    const sim: Sim = makeTestSim({ sizeBu: 300, nest: 'small', workers: 2, systems: [] });
    const ant = sim.state.ants.find((a) => a.caste === 'worker')!;
    crumbs(ant, Array.from({ length: 10 }, (_, i) => [100 + i * 24, 100] as [number, number]));
    prepareRoute(sim, ant, 9);
    commitRoute(sim, ant);
    expect(routeFor(ant, 9)).not.toBeNull();
    markDepleted(sim, ant, 9); // first empty visit
    sim.state.tick += daysToTicks(1) + 1; // the entry expired: the ant may try again
    expect(isDepletedFor(sim, ant, 9)).toBe(false);
    markDepleted(sim, ant, 9); // second consecutive empty visit
    expect(routeFor(ant, 9)).toBeNull();
  });
});

describe('review: trail laying only with a full crop (GDD 02 §8.3)', () => {
  it('a forager leaving an exhausted source with a 0.6 crop does not lay trail to it', () => {
    // §8.3: a forager lays on the return leg only with crop >= CROP_RETURN_FRACTION (0.8) of capacity or a solid item.
    const { sim, col, sources } = forageScenario({
      seed: 3, workers: 20,
      sources: [{ kind: 'sugar', variant: 'sugary-spill', distBu: 60, bearingDeg: 0, units: 300 }],
    });
    const s = sources[0];
    col.needs.needC = 1; col.needs.needP = 1;
    let laying = 0, tried = 0;
    for (const ant of sim.state.ants.filter((a) => a.caste === 'worker')) {
      placeOnSurface(sim, ant, { x: s.pos.x - 6 * sim.world.bu, y: s.pos.y, z: s.pos.z });
      ant.nestId = -1;
      ant.chamberId = -1;
      ant.task = 'forage';
      ant.bb[K.trip0] = sim.state.tick;
      ant.cropC = 0.6 * ant.cropCap;
      ant.cropP = 0;
      startCollect(sim, ant, FORAGE, s.id);
      s.units = 0; // the source ran dry
      updateCollect(sim, ant, FORAGE);
      expect(ant.bb[K.phase]).toBe(PHASE.return);
      tried++;
      if ((ant.flags & AntFlag.TRAIL_ON) !== 0) laying++;
    }
    console.log(`review §8.3: ${laying} of ${tried} foragers with a 0.6 crop lay trail home from an exhausted source`);
    expect(laying).toBe(0);
  });
});

describe('review: save -> load -> continue equals the uninterrupted run (trail-lost window)', () => {
  it('a third trail loss after a load still raises trail-lost (it feeds colony state)', () => {
    const mk = () => forageScenario({ seed: 2, workers: 4 });
    const a = mk();
    const pos = { ...a.entrance.pos };
    // two ants lose the same trail, then the game is saved
    noteTrailLost(a.sim, a.col.id, 5, pos, 1);
    noteTrailLost(a.sim, a.col.id, 5, pos, 2);
    a.sim.tick();
    const saved = snapshot(a.sim);
    const b = createSim(restore(saved).state, a.sim.world, { systems: a.sim.systems });
    let lostA = 0, lostB = 0;
    a.sim.events.on('trail-lost', () => { lostA++; });
    b.events.on('trail-lost', () => { lostB++; });
    // a third ant loses it within the 60 s window, in both runs
    noteTrailLost(a.sim, a.col.id, 5, pos, 3);
    noteTrailLost(b, a.col.id, 5, pos, 3);
    a.sim.tick();
    b.tick();
    console.log(`review: trail-lost events after the third loss: uninterrupted ${lostA}, loaded ${lostB}`);
    // colony/deaths.ts books every trail-lost into persisted colony state (trailLost.today)
    expect(stateHash(b.state)).toBe(stateHash(a.sim.state));
    expect(lostB).toBe(lostA);
  });
});

describe('review: a lasting threat on the way does not keep a forager outside for ever (acceptance 4)', () => {
  it('an alarm spot that stays on the path to the source: home or dead within the trip bound', async () => {
    const { ALARM_STRONG } = await import('@/sim/balance');
    const { requestTask } = await import('@/sim/colony');
    const { SYSTEMS } = await import('@/sim/systems');
    const { announce } = await import('./testkit');
    const { OUTBOUND_MAX_S, RETURN_LOST_S } = await import('@/sim/balance/foraging');
    const sim = makeTestSim({
      sizeBu: 400, nest: 'small', workers: 2, seed: 5, systems: SYSTEMS.filter((s) => s.phase !== 'colony-allocation'),
      config: { startSeason: 'summer', startDayOfSeason: 2, startHour: 10 },
    });
    const col = sim.state.colonies[0];
    const e = sim.stores.nests.get(col.nestIds[0])!.entrances[0];
    const bu = sim.world.bu;
    sim.enqueue({ type: 'cheat.addFood', colonyId: col.id, c: 3, p: 0.5, toxin: 0 });
    sim.enqueue({ type: 'cheat.spawnFood', kind: 'sugar', variant: 'sugar-granules', pos: { x: e.pos.x + 120 * bu, y: 0, z: e.pos.z }, units: 50, stage: null });
    sim.applyPendingCommands();
    announce(sim, col, sim.state.sources[sim.state.sources.length - 1]);
    const ant = sim.state.ants.find((a) => a.caste === 'worker')!;
    requestTask(sim, ant, 'forage', 'job:test');
    // a persistent alarm patch (e.g. a fight in Tier 2) 60 BU out on the straight way to the source
    const spot = { x: e.pos.x + 60 * bu, y: 0, z: e.pos.z };
    spot.y = sim.field.height(spot.x, spot.z);
    let out = -1, maxOutS = 0, flees = 0, last = '';
    for (let t = 0; t < 30000; t++) {
      if (ant.state === 'forage.wait') ant.activation = 1;
      if (t % 5 === 0) sim.phero.deposit(-1, 'alarm', spot, ALARM_STRONG);
      sim.tick();
      if (!ant.alive) break;
      if (ant.state === 'flee.run' && last !== 'flee.run') flees++;
      last = ant.state;
      if (ant.nestId < 0 && out < 0) out = sim.state.tick;
      if (ant.nestId >= 0 && out >= 0) { maxOutS = Math.max(maxOutS, (sim.state.tick - out) / 10); out = -1; }
    }
    if (out >= 0) maxOutS = Math.max(maxOutS, (sim.state.tick - out) / 10);
    console.log(`review flee: alive ${ant.alive}, longest stay outside ${maxOutS.toFixed(0)} s, flee runs ${flees}, state ${ant.state}`);
    expect(maxOutS).toBeLessThanOrEqual(OUTBOUND_MAX_S + RETURN_LOST_S);
  }, 600000);
});

describe('review: a recruit follows the trail of its own source (GDD 02 §6.7)', () => {
  it('foragers bound for source B do not walk the colony trail to another source A', async () => {
    const { requestTask } = await import('@/sim/colony');
    const { SYSTEMS } = await import('@/sim/systems');
    const { announce } = await import('./testkit');
    const sim = makeTestSim({
      sizeBu: 500, nest: 'small', workers: 6, seed: 4, systems: SYSTEMS.filter((s) => s.phase !== 'colony-allocation'),
      config: { startSeason: 'summer', startDayOfSeason: 2, startHour: 10 },
    });
    const col = sim.state.colonies[0];
    const e = sim.stores.nests.get(col.nestIds[0])!.entrances[0];
    const bu = sim.world.bu;
    const at = (dBu: number, deg: number) => {
      const a = (deg * Math.PI) / 180, x = e.pos.x + Math.cos(a) * dBu * bu, z = e.pos.z + Math.sin(a) * dBu * bu;
      return { x, y: sim.field.height(x, z), z };
    };
    sim.enqueue({ type: 'cheat.addFood', colonyId: col.id, c: 3, p: 0.5, toxin: 0 });
    sim.enqueue({ type: 'cheat.spawnFood', kind: 'sugar', variant: 'sugary-spill', pos: at(150, 0), units: 300, stage: null }); // A
    sim.enqueue({ type: 'cheat.spawnFood', kind: 'sugar', variant: 'sugary-spill', pos: at(150, 40), units: 300, stage: null }); // B
    sim.applyPendingCommands();
    const [A, B] = sim.state.sources.slice(-2);
    announce(sim, col, B); // only B is known; A carries an older colony trail
    const layA = () => { for (let d = 1; d <= 150; d += 1.5) sim.phero.deposit(col.id, 'trail', at(d, 0), 6); };
    const workers = sim.state.ants.filter((a) => a.caste === 'worker');
    for (const a of workers) requestTask(sim, a, 'forage', 'job:test');
    const nearA = new Set<number>();
    let reachedB = 0;
    const atB = new Set<number>();
    for (let t = 0; t < 4000; t++) {
      if (t % 50 === 0) layA();
      for (const a of workers) if (a.state === 'forage.wait') a.activation = 1;
      sim.tick();
      for (const a of workers) {
        if (a.nestId >= 0) continue;
        if (Math.hypot(a.pos.x - A.pos.x, a.pos.z - A.pos.z) < 15 * bu && (a.bb[K.src] ?? -1) === B.id && a.bb[K.phase] === PHASE.outbound) nearA.add(a.id);
        if (Math.hypot(a.pos.x - B.pos.x, a.pos.z - B.pos.z) < 15 * bu && !atB.has(a.id)) { atB.add(a.id); reachedB++; }
      }
    }
    console.log(`review trails: ${nearA.size} of ${workers.length} B-bound foragers walked out to A on its trail; ${reachedB} reached B`);
    expect(nearA.size).toBe(0);
  }, 600000);
});
