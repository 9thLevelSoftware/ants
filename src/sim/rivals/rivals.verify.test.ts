// Adversarial checks of the rivals module (independent review). Tests that pass are regression tests; a failing
// test here demonstrates a real defect and stays in place for the fixer (see the review report).
import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { commandsSystem } from '@/sim/systems';
import { amountOf } from '@/sim/ecology/sources/def';
import { createSource } from '@/sim/ecology/sources/spawn';
import { TICKS_PER_HOUR, calendarTickAt } from '@/sim/time';
import { rivalProfile } from '@/sim/species/rivals/profiles';
import { DIFFICULTY_PARAMS } from '@/sim/balance';
import { RIVAL_LEVERS } from '@/sim/balance/rivals';
import './wiring';
import { rivalsSystem } from './index';
import { abstractStep, type AbstractNumbers } from './model';
import { allocateBudget } from './fielding';
import { activityOf } from './env';
import { claimAt } from './claims';
import { ensureRelation, findRelation } from './relations';
import { isIncipient, launchBroodRaids, launchRaids } from './raids';
import { homeNest, setupRivalNest, syncDisplayBrood } from './setup';
import { colExt, JOB, rmod, slotBit } from './state';
import { player, record, rivalSim, rivalsOf } from './testkit';

/** Moves the calendar to a summer noon (no systems run in between). */
function toSummerNoon(sim: Sim): void {
  sim.state.tick = calendarTickAt('summer', 3, 12, sim.state.config) - sim.state.env.calendar.startTick;
  sim.state.tick -= sim.state.tick % TICKS_PER_HOUR;
}

describe('abstract model: carrying capacity bound (I6: N <= K_max x rivalKMult)', () => {
  // full territory, endless active summer, ample harvest: the brood pipeline must not push N past K_max x kMult
  for (const species of ['lasius-niger', 'tetramorium-immigrans', 'myrmica-rubra', 'formica-rufa', 'solenopsis-fugax', 'lasius-flavus'] as const) {
    for (const preset of ['naturalist', 'harsh'] as const) {
      it(`${species} on ${preset} for 200 gd`, () => {
        const p = rivalProfile(species);
        const kMult = DIFFICULTY_PARAMS[preset].rivalKMult;
        const m: AbstractNumbers = { n: p.n0, b: 0.2 * p.n0, cS: 200, pS: 100, agg: p.aggression };
        let maxN = 0;
        for (let h = 0; h < 200 * 24; h++) {
          abstractStep(m, {
            profile: p, queens: p.queens, orphaned: false, claimedCells: p.aRef, season: 'summer', dayOfSeason: 3,
            activity: 1, kMult, growthMult: RIVAL_LEVERS[preset].rivalGrowthMult, aggMult: DIFFICULTY_PARAMS[preset].rivalAggMult,
            realC: 0, realP: 0,
          }, 1 / 24);
          maxN = Math.max(maxN, m.n);
          for (const v of [m.n, m.b, m.cS, m.pS, m.agg]) expect(Number.isFinite(v) && v >= 0).toBe(true);
        }
        expect(maxN).toBeLessThanOrEqual(p.kMax * kMult);
      });
    }
  }

  it('an empty colony (N 0, B 0, no stores) stays finite and non-negative', () => {
    const p = rivalProfile('lasius-niger');
    const m: AbstractNumbers = { n: 0, b: 0, cS: 0, pS: 0, agg: 0 };
    for (let h = 0; h < 48; h++) {
      abstractStep(m, {
        profile: p, queens: 1, orphaned: false, claimedCells: 0, season: 'summer', dayOfSeason: 3, activity: 1, kMult: 1,
        growthMult: 1, aggMult: 1, realC: 0, realP: 0,
      }, 1 / 24);
    }
    for (const v of [m.n, m.b, m.cS, m.pS, m.agg]) expect(Number.isFinite(v) && v >= 0).toBe(true);
  });
});

describe('virtual harvest drawn from real nodes', () => {
  it('a node that offers nothing the colony still needs is not consumed', () => {
    // The colony's C need is covered by real deliveries this hour (hourC), so only P is wanted. A sugar pile (C only,
    // no P) in its claimed core must not be drained to "pay" for protein.
    const sim = rivalSim({ sizeBu: 384, rivals: [{ species: 'lasius-niger', dx: 90, dz: 0 }], systems: [commandsSystem] });
    const r = rivalsOf(sim)[0];
    setupRivalNest(sim, r);
    toSummerNoon(sim);
    expect(activityOf(sim, r)).toBeGreaterThan(0);
    const nest = homeNest(sim, r)!;
    const pos = { x: nest.origin.x + 12 * sim.world.bu, y: 0, z: nest.origin.z };
    pos.y = sim.field.height(pos.x, pos.z);
    const sugar = createSource(sim, { variant: 'sugar-granules', pos, units: 100 });
    sim.index.refresh();
    expect(claimAt(sim, pos).owner).toBe(r.id);
    expect(sugar.p).toBe(0);
    const ext = colExt(sim.state, r.id);
    ext.hourC = 1000; // every C load of this hour came from real deliveries
    const before: AbstractNumbers = { n: r.rival.n, b: r.rival.b, cS: r.rival.cS, pS: r.rival.pS, agg: r.rival.agg };
    const a = activityOf(sim, r);
    rivalsSystem.run(sim);
    // the same step on a copy: a P harvest was wanted this hour (births in summer), no C harvest
    const p = rivalProfile(r.species), d = sim.state.config.difficulty;
    const res = abstractStep(before, {
      profile: p, queens: r.queens.length, orphaned: false, claimedCells: ext.claimedCells, season: 'summer', dayOfSeason: 3,
      activity: a, kMult: d.params.rivalKMult, growthMult: RIVAL_LEVERS[d.preset].rivalGrowthMult, aggMult: d.params.rivalAggMult,
      realC: 1000, realP: 0,
    }, 1 / 24);
    expect(res.harvestC).toBe(0);
    expect(res.harvestP).toBeGreaterThan(0);
    // ...but a C-only node cannot supply protein: it must not be drained for it
    expect(amountOf(sugar)).toBe(100);
  }, 60_000);
});

describe('incipient rivals grow up', () => {
  it('a colony founded as incipient is no longer incipient once N is far above INCIPIENT_MAX (60)', () => {
    const sim = rivalSim({ sizeBu: 384, rivals: [{ species: 'lasius-niger', dx: 90, dz: 0, incipient: true }], systems: [commandsSystem] });
    const r = rivalsOf(sim)[0];
    setupRivalNest(sim, r);
    colExt(sim.state, r.id).firstWorkersTick = -1;
    r.rival.n = 300;
    r.rival.b = 40;
    toSummerNoon(sim);
    for (let h = 0; h < 3; h++) { rivalsSystem.run(sim); sim.state.tick += TICKS_PER_HOUR; }
    // GDD 05 §3.8: incipient = N <= INCIPIENT_MAX; "then the normal model" (field cap 6 only for the incipient phase,
    // counts as established for the 0-4 setting, may launch war raids)
    expect(isIncipient(sim, r)).toBe(false);
  }, 60_000);
});

describe('player rally raids', () => {
  it('a rally attack marker with no worker free to go does not start raid after raid (+10 E each)', () => {
    const sim = rivalSim({ sizeBu: 384, nest: 'small', workers: 0, rivals: [{ species: 'lasius-niger', dx: 70, dz: 0 }] });
    sim.tick();
    const r = rivalsOf(sim)[0], col = player(sim);
    rmod(sim.state).playerKnowsNest |= slotBit(sim.state, r.id);
    const e = homeNest(sim, r)!.entrances[0];
    const ev = record(sim, ['rival-raid-started']);
    sim.enqueue({ type: 'placeMarker', kind: 'rally', pos: { x: e.pos.x - 10 * sim.world.bu, y: 0, z: e.pos.z }, radius: 8 * sim.world.bu, params: { mode: 'attack' } });
    for (let t = 0; t < 200; t++) sim.tick();
    sim.events.flush();
    const starts = ev.filter((x) => (x as { attacker: number }).attacker === col.id);
    const rel = findRelation(sim.state, col.id, r.id);
    // eslint-disable-next-line no-console
    console.log(`rally with no free worker: ${starts.length} raids started in 200 ticks, E ${rel?.e.toFixed(1)}, state ${rel?.state}`);
    expect(starts.length).toBeLessThanOrEqual(1);
    expect(rel?.state ?? 'peace').not.toBe('war');
  }, 60_000);
});

describe('brood raid launch rule (GDD 05 §3.8: "A was not raided in the last 1 gd")', () => {
  it('a colony that was itself brood-raided less than 1 gd ago does not launch one', () => {
    const sim = rivalSim({ seed: 2, nest: 'small', workers: 12, rivals: [{ species: 'lasius-niger', dx: 40, dz: 8, incipient: true }] });
    sim.tick();
    const r = rivalsOf(sim)[0], col = player(sim);
    r.rival.n = 6; r.rival.b = 30; r.rival.cS = 10;
    syncDisplayBrood(sim, r);
    col.directives.stance = 'aggressive';
    rmod(sim.state).playerKnowsNest |= slotBit(sim.state, r.id);
    // the player (A) was brood-raided a moment ago
    colExt(sim.state, col.id).broodRaidedTick = sim.state.tick;
    launchBroodRaids(sim);
    expect(rmod(sim.state).raids.filter((x) => x.attacker === col.id).length).toBe(0);
    // control: with A's last raid long past it does launch
    colExt(sim.state, col.id).broodRaidedTick = -1;
    launchBroodRaids(sim);
    expect(rmod(sim.state).raids.filter((x) => x.attacker === col.id && x.kind === 'brood').length).toBe(1);
  }, 60_000);
});

describe('war raids and predatory raids (launchRaids)', () => {
  function twoRivals(attacker: 'tetramorium-immigrans' | 'formica-rufa') {
    const sim = rivalSim({
      sizeBu: 640, rivals: [{ species: attacker, dx: -150, dz: 0 }, { species: 'lasius-niger', dx: 150, dz: 0 }], systems: [commandsSystem],
    });
    const [a, b] = rivalsOf(sim);
    setupRivalNest(sim, a);
    setupRivalNest(sim, b);
    return { sim, a, b };
  }

  it('war + R >= 2 + nest known: a raid starts (p 0.25 per hourly check) with min(war cap, 0.25 N, budget)', () => {
    const { sim, a, b } = twoRivals('tetramorium-immigrans');
    b.rival.n = 100; // S 600 x 0.8 x 0.875 = 420 vs 100 x 1 x 0.8 = 80
    ensureRelation(sim.state, a.id, b.id).state = 'war';
    // without nest knowledge: never
    for (let i = 0; i < 40; i++) launchRaids(sim, () => 1);
    expect(rmod(sim.state).raids.length).toBe(0);
    a.rival.knowsNest |= slotBit(sim.state, b.id);
    let tries = 0;
    while (rmod(sim.state).raids.length === 0 && tries < 60) { launchRaids(sim, () => 1); tries++; }
    const rd = rmod(sim.state).raids[0];
    expect(rd).toBeDefined();
    expect(rd.kind).toBe('raid');
    expect(rd.attacker).toBe(a.id);
    expect(rd.toSend).toBe(Math.floor(Math.min(250, 0.25 * a.rival.n, 900)));
    expect(findRelation(sim.state, a.id, b.id)!.e).toBeGreaterThanOrEqual(10); // +10 per raid
  }, 60_000);

  it('no raid when R < 2, when not at war (non-Formica) or when inactive', () => {
    const { sim, a, b } = twoRivals('tetramorium-immigrans');
    a.rival.knowsNest |= slotBit(sim.state, b.id);
    ensureRelation(sim.state, a.id, b.id).state = 'war';
    b.rival.n = 300; // R = 420 / 240 = 1.75
    for (let i = 0; i < 40; i++) launchRaids(sim, () => 1);
    b.rival.n = 100;
    ensureRelation(sim.state, a.id, b.id).state = 'skirmish';
    for (let i = 0; i < 40; i++) launchRaids(sim, () => 1);
    ensureRelation(sim.state, a.id, b.id).state = 'war';
    for (let i = 0; i < 40; i++) launchRaids(sim, () => 0);
    expect(rmod(sim.state).raids.length).toBe(0);
  }, 60_000);

  it('Formica launches predatory raids at peace on a colony with S_def <= 0.5 S_formica', () => {
    const { sim, a, b } = twoRivals('formica-rufa');
    a.rival.knowsNest |= slotBit(sim.state, b.id);
    expect(findRelation(sim.state, a.id, b.id)?.state ?? 'peace').toBe('peace');
    let tries = 0;
    while (rmod(sim.state).raids.length === 0 && tries < 60) { launchRaids(sim, () => 1); tries++; }
    expect(rmod(sim.state).raids[0]?.kind).toBe('predatory');
  }, 60_000);
});

describe('budget sharing by priority', () => {
  it('never hands out more than the budget or more than a target', () => {
    let s = 12345;
    const rnd = (n: number): number => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s % n; };
    for (let trial = 0; trial < 200; trial++) {
      const cols = 1 + rnd(5);
      const t = Array.from({ length: cols }, () => Array.from({ length: 13 }, () => (rnd(3) === 0 ? rnd(80) : 0)));
      const budget = rnd(300);
      const a = allocateBudget(t, budget);
      let sum = 0;
      for (let c = 0; c < cols; c++) for (let j = 0; j < 13; j++) { expect(a[c][j]).toBeGreaterThanOrEqual(0); expect(a[c][j]).toBeLessThanOrEqual(t[c][j]); sum += a[c][j]; }
      expect(sum).toBeLessThanOrEqual(budget);
    }
  });

  it('a lower priority gets nothing while a higher priority is left short', () => {
    // two colonies each want one defender; the budget is 1 (one slot left under the cap)
    const t = [new Array(13).fill(0), new Array(13).fill(0)];
    t[0][JOB.defend] = 1; t[1][JOB.defend] = 1; t[0][JOB.raid] = 5;
    const a = allocateBudget(t, 1);
    const defenders = a[0][JOB.defend] + a[1][JOB.defend];
    expect(defenders).toBe(1);
    expect(a[0][JOB.raid]).toBe(0);
  });
});

describe('cheat.setRival input hygiene', () => {
  it('ignores NaN / Infinity and clamps negatives and agg', () => {
    const sim = rivalSim({ sizeBu: 256, rivals: [{ species: 'lasius-niger', dx: 60, dz: 0 }], systems: [commandsSystem] });
    const r = rivalsOf(sim)[0];
    const n0 = r.rival.n;
    sim.enqueue({ type: 'cheat.setRival', colonyId: r.id, values: { N: Number.NaN, B: -5, agg: 7, C_s: Number.POSITIVE_INFINITY } });
    sim.applyPendingCommands();
    expect(r.rival.n).toBe(n0);
    expect(r.rival.b).toBe(0);
    expect(r.rival.agg).toBe(1);
    expect(Number.isFinite(r.rival.cS)).toBe(true);
  });
});
