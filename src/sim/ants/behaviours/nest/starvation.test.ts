// beh-nest acceptance 6 (GDD 02 §5.7, App. E 9): with the stores at zero the in-nest behaviours follow the
// starvation sequence instead of deadlocking: queen-carers feed the queen from their own reserves (S2), nurses eat
// eggs before larvae (S3), the first adult to starve is an old worker, no pupa starves, the queen dies last, and
// no ant ever overstays a state's timeout.
import { describe, expect, it } from 'vitest';
import type { AgeBand } from '@/sim/types';
import { bandOf, reserveCap } from '@/sim/colony';
import { TICKS_PER_DAY } from '@/sim/time';
import { ownState, stateTimeoutTicks } from './fsm';
import { makeNestColony } from './testkit';

/** Timeouts act at the end of a running action or care act (assist: 10 s), so they may land this late, ticks. */
const OVERSTAY_SLACK = 120;

const AGES: Record<Exclude<AgeBand, 'callow'>, number> = { young: 3, mid: 8, old: 15 };

describe('beh-nest under starvation (acceptance 6)', () => {
  it('stores at zero: eggs eaten before larvae, old workers starve first, the queen last, no deadlock', () => {
    const k = makeNestColony({
      workers: 20, stores: { c: 0, p: 0 },
      brood: [
        { stage: 'egg', n: 20, chamber: 'nursery' }, { stage: 'larva', n: 10, chamber: 'nursery', progress: 0.2 },
        { stage: 'pupa', n: 10, chamber: 'nursery', progress: 0.1 },
      ],
    });
    const { sim, queen } = k;
    const col = sim.state.colonies[0];
    // 5 per age band (the callow band lasts 0.3 gd), empty crops, full reserves
    const workers = sim.stores.ants.list.filter((a) => a.caste === 'worker');
    workers.forEach((a, i) => {
      const band = (['young', 'mid', 'old', 'young'] as const)[i % 4];
      a.physioAgeGd = AGES[band];
      a.lifespanGd = 85;
      a.cropC = 0; a.cropP = 0;
      a.energy = reserveCap(a);
    });
    const bandAt = new Map<number, AgeBand>();
    const snapshotBands = () => { for (const a of sim.stores.ants.list) if (a.alive) bandAt.set(a.id, bandOf(a)); };
    snapshotBands();
    const adultDeaths: { task: string; id: number; cause: string; band: AgeBand | 'queen'; tick: number }[] = [];
    sim.events.on('ant-died', (e) => adultDeaths.push({ task: e.task, id: e.antId, cause: e.cause, band: e.antId === queen.id ? 'queen' : bandAt.get(e.antId) ?? 'young', tick: sim.state.tick }));
    const broodDeaths: Record<string, number> = {};
    const over: Record<string, number> = {};
    let larvaEatenWithEggs = 0, eggsEaten = 0, queenFedFromReserve = 0, overstays = 0;
    sim.events.on('brood-died', (e) => {
      broodDeaths[`${e.stage}:${e.cause}`] = (broodDeaths[`${e.stage}:${e.cause}`] ?? 0) + 1;
      if (e.cause !== 'cannibalised') return;
      if (e.stage === 'egg') eggsEaten++;
      else if (sim.stores.brood.list.some((b) => b.alive && b.stage === 'egg')) larvaEatenWithEggs++;
    });
    sim.events.on('feed', (e) => { if (e.receiverId === queen.id && sim.stores.ants.get(e.giverId)?.task === 'queen-care' && col.stores.c <= 1e-9) queenFedFromReserve++; });
    let t = 0;
    const workersLeft = () => sim.stores.ants.list.some((a) => a.alive && a.caste === 'worker');
    for (; t < 30 * TICKS_PER_DAY && workersLeft(); t++) {
      if (t % TICKS_PER_DAY === 0) { sim.enqueue({ type: 'setDirectives', stayIn: true }); }
      sim.tick();
      if (t % 100 !== 0) continue;
      snapshotBands();
      for (const a of sim.stores.ants.list) {
        if (a.alive && a.caste === 'worker' && ownState(a) && sim.state.tick - a.stateTick > stateTimeoutTicks(a.state) + OVERSTAY_SLACK) { overstays++; over[`${a.task}/${a.state}`] = (over[`${a.task}/${a.state}`] ?? 0) + 1; }
      }
    }
    const starved = adultDeaths.filter((d) => d.cause === 'starvation');
    const last = adultDeaths[adultDeaths.length - 1];
    console.log('[beh-nest AC6]', JSON.stringify({
      gd: +(t / TICKS_PER_DAY).toFixed(2), eggsEaten, larvaEatenWithEggs, queenFedFromReserve, overstays, over, broodDeaths, queenAlive: queen.alive,
      firstStarved: starved[0] ? { band: starved[0].band, gd: +(starved[0].tick / TICKS_PER_DAY).toFixed(2) } : null,
      deathOrder: adultDeaths.map((d) => `${d.band}:${d.cause}:${d.task}`).join(' '),
    }));
    expect(eggsEaten).toBeGreaterThan(0);
    expect(larvaEatenWithEggs).toBe(0);
    expect(queenFedFromReserve).toBeGreaterThan(0);
    expect(broodDeaths['pupa:starvation'] ?? 0).toBe(0);
    expect(starved.length).toBeGreaterThan(0);
    expect(starved[0].band).toBe('old');
    // every worker starved while the queen lived on (or she died last)
    expect(workersLeft()).toBe(false);
    expect(queen.alive || last.band === 'queen').toBe(true);
    expect(overstays).toBe(0);
  }, 1_200_000);
});
