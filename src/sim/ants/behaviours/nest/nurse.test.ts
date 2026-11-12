// Nurse unit scenarios: GDD 02 App. E 4 (a `ready` pupa and a nurse: an adult with `callow` ecloses within 30 game
// s and a cocoon lies there) and the nursery board's job priorities (GDD 02 §10.4).
import { describe, expect, it } from 'vitest';
import { AntFlag, BroodFlag } from '@/sim/types';
import { boardOf, Job } from './board';
import { makeNestColony } from './testkit';

describe('nurse (GDD 02 §10.4)', () => {
  it('E4: a ready pupa with nurses about ecloses within 30 s as a callow, leaving a cocoon', () => {
    const k = makeNestColony({ workers: 12, stores: { c: 50, p: 50 }, brood: [{ stage: 'pupa', n: 1, chamber: 'nursery', progress: 0.999 }] });
    const { sim } = k;
    // watched from the start: the allocation puts nurses on the pupa while it finishes its stage
    const pupa = sim.stores.brood.list.find((b) => b.stage === 'pupa')!;
    let readyAt = -1, eclosedAt = -1, adult = -1;
    sim.events.on('ant-eclosed', (e) => { eclosedAt = sim.state.tick; adult = e.antId; });
    for (let t = 0; t < 3600 && eclosedAt < 0; t++) {
      sim.tick();
      if (readyAt < 0 && pupa.alive && (pupa.flags & BroodFlag.READY) !== 0) readyAt = sim.state.tick;
    }
    expect(readyAt).toBeGreaterThan(0);
    expect(eclosedAt - readyAt).toBeLessThanOrEqual(300);
    const a = sim.stores.ants.get(adult)!;
    expect((a.flags & AntFlag.CALLOW) !== 0).toBe(true);
    expect(sim.stores.items.list.some((it) => it.kind === 'waste' && it.wasteKind === 'cocoon')).toBe(true);
  }, 300_000);

  it('the board ranks jobs: assist-eclosion over tending, feed by urgency, one job per brood item', () => {
    const k = makeNestColony({ workers: 0, brood: [{ stage: 'larva', n: 3, chamber: 'nursery' }, { stage: 'pupa', n: 2, chamber: 'nursery' }] });
    const { sim } = k;
    const [p1, p2] = sim.stores.brood.list.filter((b) => b.stage === 'pupa');
    p1.flags |= BroodFlag.READY;
    p2.lastTendedTick = sim.state.tick - 6000; // long untended
    sim.state.tick += 1;
    const jobs = boardOf(sim, sim.state.colonies[0].id)!.jobs;
    const kindOf = (id: number) => jobs.filter((j) => j.id === id).map((j) => j.kind);
    expect(kindOf(p1.id)).toEqual([Job.assist]);
    expect(kindOf(p2.id)).toEqual([Job.tend]);
    const feeds = jobs.filter((j) => j.kind === Job.feed);
    expect(feeds.length).toBe(3); // hungry larvae (empty guts) request food
    const assist = jobs.find((j) => j.kind === Job.assist)!, tend = jobs.find((j) => j.kind === Job.tend)!;
    expect(assist.prio).toBe(6);
    expect(tend.prio).toBe(6); // 2 + 4 when untended longer than TEND_URGENT_GD
    for (const f of feeds) expect(f.prio).toBeGreaterThan(5);
  });
});
