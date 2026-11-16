// Queen death, orphan phase, extinction and the epitaph record (GDD 06 §13, App. E 24).
import { describe, expect, it } from 'vitest';
import type { SimEvent } from '@/sim/types';
import { daysToTicks } from '@/sim/time';
import { EXTINCTION_GRACE_GD } from '@/sim/balance/lifecycle';
import { buildEpitaph } from './epitaph';
import { colonyOf, living, makeLifeSim, send, step } from './testLife';

function record(sim: ReturnType<typeof makeLifeSim>): { e: SimEvent; tick: number }[] {
  const out: { e: SimEvent; tick: number }[] = [];
  for (const t of ['queen.died', 'colony.orphaned', 'colony.extinct', 'epitaph.ready', 'egg-laid', 'ant-eclosed', 'brood-stage'] as const) {
    sim.events.on(t, (e) => out.push({ e: e as SimEvent, tick: sim.state.tick }));
  }
  return out;
}

describe('succession (GDD 06 §13, App. E 24)', () => {
  it('killQueen: orphaned, no new eggs, larvae still pupate and eclose; killAll: extinct after the grace, epitaph.ready', () => {
    const sim = makeLifeSim({ workers: 40, larvae: 0, pupae: 0, chamberC: 25, care: true, c: 60, p: 40 });
    const ev = record(sim);
    step(sim, 3000); // the queen lays under the scripted care
    expect(ev.some((x) => x.e.type === 'egg-laid')).toBe(true);
    const col = colonyOf(sim);
    send(sim, { type: 'cheat.killQueen', colonyId: col.id, cause: 'predation' });
    step(sim, 1);
    expect(ev.find((x) => x.e.type === 'queen.died')).toBeTruthy();
    expect(ev.find((x) => x.e.type === 'colony.orphaned')).toBeTruthy();
    expect(col.queenId).toBe(-1);
    expect(col.orphanedAtTick).toBeGreaterThanOrEqual(0);
    const diedAt = ev.find((x) => x.e.type === 'queen.died')!.tick;
    const broodBefore = sim.state.brood.filter((b) => b.alive && b.colony === col.id).length;
    expect(broodBefore).toBeGreaterThan(0);
    step(sim, daysToTicks(6));
    expect(ev.filter((x) => x.e.type === 'egg-laid' && x.tick > diedAt)).toHaveLength(0);
    expect(ev.some((x) => x.e.type === 'brood-stage' && x.tick > diedAt && (x.e as { to: string }).to === 'pupa')).toBe(true);
    expect(ev.some((x) => x.e.type === 'ant-eclosed' && x.tick > diedAt)).toBe(true);
    expect(colonyOf(sim).lifecycle!.succession.queenCause).toBe('predation');

    send(sim, { type: 'cheat.killAll', colonyId: col.id });
    const killTick = sim.state.tick;
    expect(living(sim)).toBe(0);
    step(sim, daysToTicks(EXTINCTION_GRACE_GD) + 20);
    const ext = ev.find((x) => x.e.type === 'colony.extinct');
    expect(ext).toBeTruthy();
    expect(Math.abs(ext!.tick - killTick - daysToTicks(EXTINCTION_GRACE_GD))).toBeLessThanOrEqual(5);
    expect(ev.find((x) => x.e.type === 'epitaph.ready')).toBeTruthy();
    const chain = (ext!.e as { causeChain: string[] }).causeChain;
    expect(chain[0]).toBe('unknown'); // killAll books cause `unknown`
    expect(chain).toContain('queen:predation');
    expect(sim.state.env.time.paused).toBe(true);
    // brood alone does not keep the colony alive
    const e = buildEpitaph(sim);
    expect(e.queenCause).toBe('predation');
    expect(e.orphanDays).toBeGreaterThan(5);
    expect(e.figures.born).toBeGreaterThan(0);
    expect(e.chain).toEqual(chain);
  });

  it('retireColony ends the colony at once with cause retired', () => {
    const sim = makeLifeSim();
    const ev = record(sim);
    send(sim, { type: 'retireColony' });
    const ext = ev.find((x) => x.e.type === 'colony.extinct');
    expect((ext!.e as { cause: string }).cause).toBe('retired');
    expect(colonyOf(sim).lifecycle!.succession.retired).toBe(true);
    expect(buildEpitaph(sim).cause).toBe('retired');
  });

  it('the epitaph record falls back when nothing was recorded', () => {
    const sim = makeLifeSim();
    const e = buildEpitaph(sim);
    expect(e.cause).toBe('unknown');
    expect(e.orphanDays).toBeNull();
    expect(e.figures.peakWorkers).toBeGreaterThanOrEqual(0);
  });
});

describe('the epitaph graph across a winter (GDD 06 §13.5)', () => {
  it('samples carry their calendar day: autumn before the jump, spring after; marks and the queen year follow', () => {
    const sim = makeLifeSim({ workers: 20, chamberC: 8, c: 40, p: 20 });
    send(sim, { type: 'cheat.setTime', tick: daysToTicks(19) + 10 }); // autumn day 6 (doy 20)
    step(sim, daysToTicks(1.5));
    send(sim, { type: 'cheat.triggerWinter' });
    send(sim, { type: 'overwinterChoice', choice: 'begin' });
    send(sim, { type: 'overwinterChoice', choice: 'close-report' });
    step(sim, daysToTicks(1.5));
    send(sim, { type: 'cheat.killQueen', colonyId: colonyOf(sim).id, cause: 'predation' });
    step(sim, daysToTicks(1));
    const e = buildEpitaph(sim);
    const g = e.graph;
    expect(g.sampleDays).toHaveLength(g.days);
    const L = g.seasonLength;
    const season = (d: number): number => Math.floor((d % (4 * L)) / L);
    const tracked = g.sampleDays.slice(-5);
    for (let i = 1; i < tracked.length; i++) expect(tracked[i]).toBeGreaterThan(tracked[i - 1]);
    // the days filed before the winter are autumn (2) or winter day 1 (3); after it, spring (0) of year 2
    const seasons = tracked.map(season);
    expect(seasons).toContain(2);
    expect(seasons[seasons.length - 1]).toBe(0);
    expect(seasons.filter((x) => x === 0).length).toBeGreaterThanOrEqual(2);
    expect(e.queenDiedYear).toBe(2);
    expect(season(g.sampleDays[g.queenDeathDay!])).toBe(0);
  });
});
