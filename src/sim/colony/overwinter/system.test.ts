// The overwintering sequence in a running sim (GDD 06 §6.2, App. E 20): banner on winter day 1, Begin applies the
// aggregate step to real ants, brood and stores and moves the clock to spring; the report; closing it resumes 1x;
// heated nests skip the lapse; the same state whether the banner times out or Begin is pressed.
import { describe, expect, it } from 'vitest';
import { stateHash } from '@/sim/save/hash';
import { calendarTickAt, currentDayOfYear, currentSeason, currentYear, TICKS_PER_DAY, ticksPerYear } from '@/sim/time';
import { OVERWINTER_BANNER_AUTO_S } from '@/sim/balance/lifecycle';
import { colonyOf, living, makeLifeSim, send, step } from '../succession/testLife';
import { bannerAutoTicks } from './system';
import { clusterOf } from './climate';
import { addBrood } from '../testkit';
import { popOf } from '../population';

describe('overwintering in the sim (GDD 06 §6)', () => {
  it('banner, Begin, spring: losses on real ants, stores, report, paused lapse, close resumes 1x', () => {
    const sim = makeLifeSim({ chamberC: 4 });
    const year = currentYear(sim.state);
    send(sim, { type: 'cheat.triggerWinter' });
    expect(sim.state.env.winter.phase).toBe('banner');
    expect(currentSeason(sim.state)).toBe('winter');
    send(sim, { type: 'overwinterChoice', choice: 'begin' });
    const w = sim.state.env.winter;
    expect(w.phase).toBe('lapse');
    expect(currentSeason(sim.state)).toBe('spring');
    expect(currentDayOfYear(sim.state)).toBe(1);
    expect(currentYear(sim.state)).toBe(year + 1);
    expect(sim.state.env.time.paused).toBe(true);
    expect(sim.state.player.timelapse?.kind).toBe('winter');
    const rec = colonyOf(sim).lifecycle!.winters[0];
    expect(rec.workers0).toBe(18);
    expect(rec.workers1).toBe(living(sim, 'worker'));
    // the numbers of App. E 20 are checked on the model (model.test.ts); here the sim's shallow test chamber (40 mm)
    // follows the soil's winter wave, so cold adds losses: they must add up on real ants
    const lost = Object.values(rec.losses).reduce((a, b) => a + b, 0);
    expect(rec.workers1).toBe(rec.workers0 - lost);
    expect(rec.workers1).toBeGreaterThan(9);
    expect(rec.c0 - rec.c1).toBeGreaterThan(2);
    expect(rec.c0 - rec.c1).toBeLessThan(8);
    expect(colonyOf(sim).stores.c).toBeCloseTo(rec.c1, 2); // the rest of the Begin tick still runs the economy
    expect(rec.days).toHaveLength(7);
    expect(w.report?.workersLost).toBe(rec.workers0 - rec.workers1);
    // the report's blocks: population, stores, climate, why (top causes)
    expect(rec.why.length).toBeLessThanOrEqual(3);
    expect(rec.coldestC).toBeLessThan(10);
    send(sim, { type: 'overwinterChoice', choice: 'close-report' }, 0);
    sim.applyPendingCommands();
    expect(sim.state.env.winter.phase).toBe('none');
    expect(sim.state.env.time.paused).toBe(false);
    expect(sim.state.env.time.speed).toBe(1);
    expect(sim.state.player.timelapse).toBeNull();
  });

  it('starving colony: C 0 at Begin halves the workers at least (App. E 20)', () => {
    const sim = makeLifeSim({ chamberC: 4, c: 0, p: 0 });
    send(sim, { type: 'cheat.triggerWinter' });
    send(sim, { type: 'overwinterChoice', choice: 'begin' });
    const rec = colonyOf(sim).lifecycle!.winters[0];
    expect(rec.workers1).toBeLessThanOrEqual(9);
    expect(rec.losses.starvation).toBeGreaterThan(0);
    expect(rec.why[0].cause).toBe('starvation');
  });

  it('heated nest (Tmean >= 14 C): winterActive, no banner (App. E 20)', () => {
    const sim = makeLifeSim({ chamberC: 18 });
    send(sim, { type: 'cheat.triggerWinter' });
    expect(sim.state.env.winter.phase).not.toBe('banner');
    expect(sim.state.env.winter.winterActive).toBe(true);
  });

  it('delay one day, at most twice', () => {
    const sim = makeLifeSim();
    send(sim, { type: 'cheat.triggerWinter' });
    send(sim, { type: 'overwinterChoice', choice: 'delay' });
    expect(sim.state.env.winter.phase).toBe('none');
    expect(sim.state.env.winter.delaysUsed).toBe(1);
  });

  it('Begin by command is deterministic', () => {
    const a = makeLifeSim({ chamberC: 4 });
    const b = makeLifeSim({ chamberC: 4 });
    send(a, { type: 'cheat.triggerWinter' });
    send(b, { type: 'cheat.triggerWinter' });
    send(a, { type: 'overwinterChoice', choice: 'begin' });
    send(b, { type: 'overwinterChoice', choice: 'begin' });
    expect(stateHash(a.state)).toBe(stateHash(b.state));
  });

  it('an unanswered banner begins on its own after 8 real seconds, with the outcome of a Begin at that moment', () => {
    const wait = bannerAutoTicks(makeLifeSim({ chamberC: 4 }));
    expect(wait).toBe(OVERWINTER_BANNER_AUTO_S * 10);
    // timed out
    const c = makeLifeSim({ chamberC: 4 });
    send(c, { type: 'cheat.triggerWinter' });
    step(c, wait + 10);
    expect(c.state.env.winter.phase).toBe('lapse');
    expect(currentSeason(c.state)).toBe('spring');
    // by command, sent when the timeout would fire
    const d = makeLifeSim({ chamberC: 4 });
    send(d, { type: 'cheat.triggerWinter' });
    const bannerTick = colonyOf(d).lifecycle!.bannerTick;
    step(d, bannerTick + wait - d.state.tick);
    send(d, { type: 'overwinterChoice', choice: 'begin' });
    const rc = colonyOf(c).lifecycle!.winters[0];
    const rd = colonyOf(d).lifecycle!.winters[0];
    expect(rd.workers0).toBe(rc.workers0);
    expect(rd.larvae0).toBe(rc.larvae0);
    expect(rd.losses).toEqual(rc.losses);
    expect(rd.broodLosses).toEqual(rc.broodLosses);
    expect(rd.workers1).toBe(rc.workers1);
    expect(rd.c1).toBeCloseTo(rc.c1, 1);
  });

  it('at 8x the banner waits 8 real seconds too (640 ticks)', () => {
    const sim = makeLifeSim({ chamberC: 4 });
    sim.state.env.time.speed = 8;
    send(sim, { type: 'cheat.triggerWinter' });
    step(sim, 300);
    expect(sim.state.env.winter.phase).toBe('banner');
    step(sim, 400);
    expect(sim.state.env.winter.phase).toBe('lapse');
  });

  it('after two delays the record covers winter days 3-7', () => {
    const sim = makeLifeSim({ chamberC: 4 });
    send(sim, { type: 'cheat.triggerWinter' });
    for (let i = 0; i < 2; i++) {
      send(sim, { type: 'overwinterChoice', choice: 'delay' });
      step(sim, TICKS_PER_DAY);
    }
    send(sim, { type: 'overwinterChoice', choice: 'begin' });
    const rec = colonyOf(sim).lifecycle!.winters[0];
    expect(rec.days).toHaveLength(5);
    expect(rec.firstWinterDay).toBe(3);
  });
});

describe('nest humidity of the winter model (GDD 06 §6.3 fungus x3)', () => {
  it('a moist nest is below the threshold, a waterlogged or flooded one above it', () => {
    const sim = makeLifeSim({ chamberC: 4 });
    const col = colonyOf(sim);
    const moist = clusterOf(sim, col).humidity;
    expect(moist).toBeLessThan(0.9);
    const m = sim.state.env.moisture;
    m.theta0.fill(250);
    m.theta1.fill(250);
    expect(clusterOf(sim, col).humidity).toBeGreaterThan(0.9);
    m.theta0.fill(100);
    m.theta1.fill(100);
    const cluster = clusterOf(sim, col);
    for (const c of cluster.chambers) c.wetUntilTick = sim.state.tick + 1000;
    expect(clusterOf(sim, col).humidity).toBe(1);
  });
});

describe('a winter that leaves no worker (GDD 06 §6.6)', () => {
  it('the report closes into the Epitaph with the leading loss cause', () => {
    const sim = makeLifeSim({ chamberC: 4, workers: 6, c: 0, p: 0, larvae: 0 });
    const col = colonyOf(sim);
    const extinct: string[] = [];
    sim.events.on('colony.extinct', (e) => extinct.push(e.cause));
    send(sim, { type: 'cheat.triggerWinter' });
    // no stores and a hard frost: nobody survives
    sim.state.config.difficulty.params.winterLossMult = 50;
    send(sim, { type: 'overwinterChoice', choice: 'begin' });
    const rec = col.lifecycle!.winters[0];
    expect(rec.workers1).toBe(0);
    expect(extinct).toHaveLength(0); // the report shows first
    send(sim, { type: 'overwinterChoice', choice: 'close-report' });
    expect(extinct).toHaveLength(1);
    expect(living(sim)).toBe(0);
    expect(col.lifecycle!.succession.extinct).toBe(true);
    expect(Object.keys(rec.losses)).toContain(extinct[0] === 'cold' && !rec.losses.cold ? 'outdoors' : extinct[0]);
  });
});

describe('heated nests (GDD 06 §6.1)', () => {
  it('the brood chambers are sampled hourly and the 2 GD mean decides, not the temperature of the moment', () => {
    const sim = makeLifeSim({ chamberC: 18 });
    const life = colonyOf(sim).lifecycle ?? (step(sim, 5), colonyOf(sim).lifecycle!);
    step(sim, 3 * 250 + 10);
    expect(life.broodTempLog!.length).toBeGreaterThanOrEqual(3);
    expect(life.broodTempLog!.every((t) => t === 18)).toBe(true);
    // a nest that was cold for the last two days and is warm only now is not a heated nest
    life.broodTempLog = Array(48).fill(8);
    const ws = sim.state.env.winter;
    ws.lastYearResolved = 0;
    // the banner opens from the system at winter day 1; walk the calendar there without a jump: the log stays fresh
    sim.state.env.calendar.startTick += calendarTickAt('winter', 1, 0, sim.state.config) - (sim.state.tick + sim.state.env.calendar.startTick) % ticksPerYear(sim.state.config);
    life.broodTempCal = (sim.state.tick + sim.state.env.calendar.startTick);
    life.broodTempTick = sim.state.tick;
    step(sim, 10);
    expect(ws.winterActive).toBe(false);
    expect(ws.phase).toBe('banner');
  });

  it('after a calendar jump (the winter cheat from summer) the stale summer log is not used', () => {
    const sim = makeLifeSim({ chamberC: 4 });
    step(sim, 5);
    const life = colonyOf(sim).lifecycle!;
    life.broodTempLog = Array(48).fill(22); // a warm summer nest
    life.broodTempTick = sim.state.tick;
    life.broodTempCal = sim.state.tick + sim.state.env.calendar.startTick;
    send(sim, { type: 'cheat.triggerWinter' });
    expect(sim.state.env.winter.phase).toBe('banner');
  });
});

describe('the brood fix at Begin (GDD 06 §6.3)', () => {
  it('eggs hatch into larvae through the brood bookkeeping: counter, empty gut, fresh clocks', () => {
    const sim = makeLifeSim({ chamberC: 4, larvae: 0 });
    const col = colonyOf(sim);
    const nursery = sim.state.nests[0].chambers.find((c) => c.type === 'nursery')!;
    addBrood(sim, 'egg', 4, nursery, 0.5);
    const hatched0 = popOf(col).eggsHatched;
    send(sim, { type: 'cheat.triggerWinter' });
    send(sim, { type: 'overwinterChoice', choice: 'begin' });
    expect(popOf(col).eggsHatched - hatched0).toBe(4);
    const larvae = sim.state.brood.filter((b) => b.alive && b.colony === col.id && b.stage === 'larva');
    expect(larvae.length).toBeGreaterThan(0);
    for (const b of larvae) expect(b.gutC + b.gutP).toBe(0);
  });
});
