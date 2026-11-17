// Garden waste as task `haul` and refuse workers (GDD 07 §6.4.4, §6.4.6 stage 8, §5.4.6 waste dump) in the small
// test nest: media haulers take the waste out to the dump outside the open entrance and become refuse workers who
// never garden or nurse again; with nowhere to dump it the waste stays in the garden; minims never take it.

import { describe, expect, it } from 'vitest';
import { AntFlag } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';
import { begin, stepAction } from '@/sim/ants/actions/runner';
import { addAnts, attaKit, run } from './testkit';
import { isDisplayLump } from './display';
import { wasteDumpPoint } from './wasteDump';
import { TEND_MODE, TM } from './actions';
import { guardRefuse } from './refuse';

describe('garden waste and refuse workers', () => {
  it('media haul waste from an open nest to the dump outside the fungus chamber and become refuse workers', () => {
    const k = attaKit({ G: 2 });
    const col = k.sim.state.colonies[0];
    col.stores.c = 4; col.stores.p = 1;
    k.nest.entrance.status = 'open';
    k.garden.waste = 3;
    const media = addAnts(k, 'media', 3, k.room, 'garden', 0.7);
    run(k.sim, Math.round(0.3 * TICKS_PER_DAY), () => { k.nest.entrance.status = 'open'; });
    expect(k.garden.waste).toBeLessThan(3 - 0.5);
    const items = k.sim.stores.items.list.filter((it) => it.alive && it.kind === 'garden-waste' && !isDisplayLump(it, col.id));
    expect(items.some((it) => it.carrierIds.length === 0 && it.chamberId !== k.room.id)).toBe(true);
    expect(items.filter((it) => it.carrierIds.length === 0 && it.chamberId === k.room.id).length).toBe(0);
    const refuse = media.filter((a) => (a.flags & AntFlag.REFUSE) !== 0);
    expect(refuse.length).toBeGreaterThan(0);
    for (const a of refuse) expect(['garden', 'nurse', 'queen-care']).not.toContain(a.task);
  }, 120_000);

  it('the dump point: none in a closed nest without a midden; the heap beside an open entrance', () => {
    const k = attaKit({ G: 2 });
    const out = { x: 0, y: 0, z: 0 };
    k.nest.entrance.status = 'sealed';
    k.sim.state.tick += 1; // the dump point is memoised per tick
    expect(wasteDumpPoint(k.sim, k.nest.nest, out)).toBeNull();
    k.nest.entrance.status = 'open';
    k.sim.state.tick += 1;
    const p = wasteDumpPoint(k.sim, k.nest.nest, out);
    expect(p).not.toBeNull();
    const e = k.nest.entrance.pos;
    expect(Math.sqrt((p!.x - e.x) ** 2 + (p!.z - e.z) ** 2)).toBeGreaterThan(10 * k.sim.world.bu);
  });

  it('a minim may not take garden waste even when asked directly (possessed): caste', () => {
    const k = attaKit({ G: 2 });
    k.garden.waste = 2;
    const [m] = addAnts(k, 'minor', 1, k.room, 'idle', 0.35);
    m.bb[TEND_MODE] = TM.waste;
    expect(begin(k.sim, m, 'tend-fungus', null)).toBe(false);
    expect((m.flags & AntFlag.REFUSE) === 0).toBe(true);
    // a media may, and she is a refuse worker from that moment
    const [w] = addAnts(k, 'media', 1, k.room, 'idle', 0.9);
    w.bb[TEND_MODE] = TM.waste;
    expect(begin(k.sim, w, 'tend-fungus', null)).toBe(true);
    for (let i = 0; i < 400 && w.action; i++) { k.sim.state.tick++; stepAction(k.sim, w); }
    expect((w.flags & AntFlag.REFUSE) !== 0).toBe(true);
    expect(k.garden.waste).toBeLessThan(2);
  });

  it('the guard moves a refuse worker off nurse, queen-care and garden at once', () => {
    const k = attaKit({ G: 2 });
    const col = k.sim.state.colonies[0];
    const ants = addAnts(k, 'media', 3, k.room, 'nurse', 0.9);
    ants[1].task = 'queen-care'; ants[2].task = 'garden';
    for (const a of ants) a.flags |= AntFlag.REFUSE;
    k.sim.state.tick += 300; // past the cache's rescan
    expect(guardRefuse(k.sim, col)).toBe(3);
    for (const a of ants) expect(a.task).toBe('haul');
  });
});
