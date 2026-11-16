// Adversarial review tests of the int-1B-sim gate (reviewer, not the implementer). Tests marked "BUG" fail on the
// current implementation and demonstrate a defect for the fixer; the rest are regression tests that pass.
import { describe, expect, it } from 'vitest';
import type { Ant, OpeningState, Sim } from '@/sim/types';
import { makeTestSim } from '@/sim/testing';
import { entranceToUnplug, sealEntrance } from '@/sim/nest';
import { checkEntrances } from '@/sim/nest/entrances';
import { homeEntranceStatus } from '@/sim/locomotion/nests';
import { forageScenario, announce, run } from '@/sim/ants/behaviours/outdoor/testkit';
import { makeProgSim, pollOnce } from '@/sim/progression/testkit';
import { TICKS_PER_DAY } from '@/sim/time';
import { midLifeReadout } from './midlifeKit';
import { EventCounter } from '../../../../tools/sim/lifeMetrics';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { restore, snapshot, stateHash } from '@/sim/save';
import { generateWorld } from '@/worldgen';

const workers = (sim: Sim): Ant[] => sim.state.ants.filter((a) => a.alive && a.caste === 'worker');

/** A minimal opening record in the given phase (only the fields the guards read matter). */
function openingIn(phase: OpeningState['phase']): OpeningState {
  return {
    phase, attempt: 1, retriesUsed: 0, startDoy: 9, siteFactors: [], siteQ: 0, siteWord: null, entranceId: -1, chamberId: -1,
    shaftDepthBu: 0, chamberVoxels: 0, sealed: true, layBatches: 1, threatsUsed: 0, lastThreatTick: -1, interruptsUsed: 0,
    hazardLog: [], lapse: null, garden: null, woodMoisture: -1, done: false,
  };
}

describe('int-1B-sim review: Addendum 5 request 2 (no last-ants while the opening runs)', () => {
  it('regression: the founding queen alone during the opening raises no last-ants', () => {
    const sim = makeProgSim({ workers: 0 });
    sim.state.player.opening = openingIn('timelapse');
    pollOnce(sim);
    expect(sim.state.progression.alerts.some((a) => a.kind === 'last-ants')).toBe(false);
  });

  // BUG: deaths.ts only suppresses the alert for `living <= 1`. During the time-lapse the first nanitics eclose one by
  // one (living = 2, 3 = LAST_ANTS_N) while the opening still runs, and the critical "last ants" alert is raised for a
  // healthy founding. Request 2 asked: "do not raise it while foundingInProgress".
  it('BUG: the queen with her first one or two nanitics during the opening raises no last-ants', () => {
    const sim = makeProgSim({ workers: 2 }); // queen + 2 first workers: living 3 <= LAST_ANTS_N
    sim.state.player.opening = openingIn('timelapse');
    pollOnce(sim);
    expect(sim.state.progression.alerts.filter((a) => a.kind === 'last-ants').map((a) => a.tokens)).toEqual([]);
  });
});

describe('int-1B-sim review: entrance home status', () => {
  it('regression: homeEntranceStatus prefers open, then reopening, then sealing; a nest with only sealed entrances says open', () => {
    const sim = makeTestSim({ nest: 'small', workers: 1, systems: [] });
    const nest = sim.stores.nests.get(sim.state.colonies[0].nestIds[0])!;
    const e = nest.entrances[0];
    const was = e.status;
    for (const [st, want] of [['open', 'open'], ['reopening', 'reopening'], ['sealing', 'sealing'], ['sealed', 'open']] as const) {
      e.status = st;
      expect(homeEntranceStatus(nest)).toBe(want);
    }
    e.status = was;
  });
});

describe('int-1B-sim review: dig.unplug vs a plug being built on purpose', () => {
  // BUG (design conflict): entranceToUnplug treats every `sealing` entrance with plug voxels as a plug to dig out,
  // unless a `seal` plan is live or an ant is running `seal-entrance` at this very tick. A plug placed by a possessed
  // ant (GDD 01 `seal-entrance`, press by press) is therefore handed to autonomous diggers between two presses.
  it('BUG: a plug just placed with seal-entrance (between two presses) is not offered to the unplug diggers', () => {
    const sim = makeTestSim({ nest: 'small', workers: 4, systems: [] });
    const col = sim.state.colonies[0];
    const nest = sim.stores.nests.get(col.nestIds[0])!;
    const e = nest.entrances[0];
    expect(e.status).toBe('open');
    // one plug from the default head point 2 BU inside (the test nest's narrow throat closes with it)
    sealEntrance(sim, e.id, -1);
    checkEntrances(sim);
    expect(e.plugVoxelCount).toBeGreaterThan(0);
    expect(entranceToUnplug(sim, nest.id)).toBeNull(); // sealed: correctly left alone
    // a wider throat (GDD 03 §4.2: a 2-2.5 BU throat takes about 3 plugs) is `sealing` after the first press; stand
    // in for it by the status the state machine would hold there (no seal plan, nobody is mid-action)
    e.status = 'sealing';
    // nobody asked for this entrance to be reopened: the colony should not dig the fresh plug out again
    expect(entranceToUnplug(sim, nest.id)).toBeNull();
  });
});

describe('int-1B-sim review: player-in-the-loop strength', () => {
  // The gate's directive test only asserts deliveries(forage-heavy) >= deliveries(nurse-heavy), which holds at 0 >= 0.
  // The spec asks "more foragers -> more deliveries": check the measurable outcome strictly.
  it('a forage-heavy allocation delivers strictly more than a nurse-heavy one (same world, 1/6 gd)', () => {
    const outcome = (shares: { forage: number; nurse: number; dig: number; defend: number }) => {
      const { sim, col, sources } = forageScenario({
        seed: 3, workers: 30, stores: { c: 1, p: 0.3 }, pinned: true, holdStores: { c: 1, p: 0.3 },
        sources: [{ kind: 'sugar', variant: 'sugary-spill', distBu: 60, bearingDeg: 30, units: 300 }],
      });
      sim.enqueue({ type: 'setDirectives', colonyId: col.id, allocation: shares });
      sources[0].discoveredBy |= 1;
      let delivered = 0;
      sim.events.on('delivery', (e) => { if (e.colonyId === col.id) delivered++; });
      run(sim, TICKS_PER_DAY / 6);
      return delivered;
    };
    const many = outcome({ forage: 70, nurse: 10, dig: 10, defend: 10 });
    const few = outcome({ forage: 5, nurse: 75, dig: 10, defend: 10 });
    expect(many).toBeGreaterThan(0);
    expect(many).toBeGreaterThan(few);
  }, 120000);
});

describe('int-1B-sim review: the mid-life save point really is mid-life', () => {
  // The report (section 8) says midlife.test asserts "a dig plan in progress and brood being fed" at the save; the
  // test computes livePlans but never asserts it. Check the conditions the task names (work item 7).
  it('at the save tick of midlife.test there is a dig plan in progress and larvae are present', () => {
    const { sim, col, sources } = forageScenario({
      seed: 4, workers: 40, stores: { c: 2, p: 0.5 },
      sources: [{ kind: 'sugar', variant: 'sugary-spill', distBu: 80, bearingDeg: 40, units: 300 }, { kind: 'carrion', variant: 'insect-medium', distBu: 60, bearingDeg: 200, units: 1 }],
    });
    announce(sim, col, sources[0]);
    sim.enqueue({ type: 'cheat.spawnBrood', colonyId: col.id, stage: 'larva', n: 6, chamberId: -1, progress: 0.3, destined: null });
    sim.enqueue({ type: 'cheat.spawnBrood', colonyId: col.id, stage: 'egg', n: 6, chamberId: -1, progress: 0.2, destined: null });
    for (let i = 0; i < 3000; i++) sim.tick();
    const at = midLifeReadout(sim);
    const larvae = sim.state.brood.filter((b) => b.alive && b.stage === 'larva').length;
    expect({ livePlans: at.livePlans > 0, larvae: larvae > 0 }).toEqual({ livePlans: true, larvae: true });
  }, 120000);
});

describe('int-1B-sim review: colony-life tool counters (tools/sim/lifeMetrics.ts)', () => {
  // BUG: EventCounter counts every `egg-laid` event, whoever laid it. Rival colonies lay eggs since Stage 1B (the gate
  // itself had to filter stage1a.e2e (a) by the player's queen), so the per-day "eggs laid" and the health verdict's
  // growth rule (`eggs > 0`) can be satisfied by a rival queen while the player's queen lays nothing.
  it('BUG: an egg laid by a queen that is not the player colony\'s is not counted as the player colony\'s egg', () => {
    const sim = makeTestSim({ nest: 'small', workers: 1, systems: [] });
    const counter = new EventCounter(sim);
    const playerQueen = sim.state.colonies[0].queenId;
    const rivalQueen = 987654; // not an ant of the player colony
    expect(rivalQueen).not.toBe(playerQueen);
    sim.emit({ type: 'egg-laid', broodId: 1, queenId: rivalQueen, destined: 'worker' });
    sim.tick();
    expect(counter.take().eggsLaid).toBe(0);
  });

  it('regression: deliveries of another colony are not counted', () => {
    const sim = makeTestSim({ nest: 'small', workers: 1, systems: [] });
    const counter = new EventCounter(sim);
    sim.emit({ type: 'delivery', antId: -1, colonyId: sim.state.player.colonyId + 1000, sourceId: -1, kind: 'sugar', c: 1, p: 0, toxin: 0 });
    sim.tick();
    expect(counter.take().deliveries).toBe(0);
  });
});

const LONG = !!(globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.FOUNDRESS_LONG;

describe.skipIf(!LONG)('int-1B-sim review: save -> restore -> continue on a generated world after the real hand-over (FOUNDRESS_LONG)', () => {
  // BUG: on woodland-edge #1 a rival nest's volumeOpen differs after the restore from tick 47 on (323.10120042466804 vs
  // 323.1012007166533: summation order of the per-chunk volume cache), and by 3000 ticks its architect record differs
  // too. Same class as stage1a.e2e (c). The gate's own midlife.test runs on the flat scenario world without rivals.
  it('BUG: the restored game keeps the uninterrupted run\'s stateHash for 300 ticks', () => {
    const base = defaultGameConfig('lasius-niger', 1, 'naturalist');
    const config = { ...base, cheats: true, world: { ...base.world, archetype: 'woodland-edge' as const } };
    const world = generateWorld(config.world);
    const a = createSim(createNewGame(config, world).state, world);
    a.enqueue({ type: 'cheat.completeFounding', workers: 10 });
    const end = a.state.tick + 16 * TICKS_PER_DAY;
    while (a.state.tick < end) {
      a.tick();
      const op = a.state.player.opening;
      if (op?.phase === 'handover' || op?.phase === 'failed' || op?.done) break;
    }
    for (let i = 0; i < 1500; i++) a.tick();
    const b = createSim(restore(snapshot(a)).state, world);
    let firstBad = -1;
    for (let t = 1; t <= 300 && firstBad < 0; t++) {
      a.tick(); b.tick();
      if (stateHash(a.state) !== stateHash(b.state)) firstBad = t;
    }
    expect(firstBad).toBe(-1);
  }, 600000);
});
