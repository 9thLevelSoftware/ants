// Reviewer tests (task overwinter-repro): extinction rules and the epitaph record after a winter.
import { describe, expect, it } from 'vitest';
import type { SimEvent } from '@/sim/types';
import { findNonPlain } from '@/sim/testing/plainData';
import { killAnt } from '@/sim/entities';
import { daysToTicks } from '@/sim/time';
import { EXTINCTION_GRACE_GD } from '@/sim/balance/lifecycle';
import { buildEpitaph } from './epitaph';
import { colonyOf, living, makeLifeSim, send, step } from './testLife';

function events(sim: ReturnType<typeof makeLifeSim>, types: SimEvent['type'][]): SimEvent[] {
  const out: SimEvent[] = [];
  for (const t of types) sim.events.on(t, (e) => out.push(e as SimEvent));
  return out;
}

describe('succession edge cases (reviewer)', () => {
  it('custom rule extinctionEndsGame = false: no extinction, the clock keeps running', () => {
    const sim = makeLifeSim();
    sim.state.config.rules.extinctionEndsGame = false;
    const ev = events(sim, ['colony.extinct', 'epitaph.ready']);
    send(sim, { type: 'cheat.killAll', colonyId: colonyOf(sim).id });
    step(sim, daysToTicks(EXTINCTION_GRACE_GD) * 3);
    expect(ev).toHaveLength(0);
    expect(sim.state.env.time.paused).toBe(false);
  });

  it('brood alone does not count as living: extinction follows even with larvae and pupae left', () => {
    const sim = makeLifeSim({ larvae: 10, pupae: 5 });
    const ev = events(sim, ['colony.extinct']);
    const col = colonyOf(sim);
    for (const a of [...sim.state.ants]) if (a.alive && a.colony === col.id) killAnt(sim, a.id, 'starvation');
    expect(living(sim)).toBe(0);
    expect(sim.state.brood.filter((b) => b.alive && b.colony === col.id).length).toBeGreaterThan(0);
    step(sim, daysToTicks(EXTINCTION_GRACE_GD) + 10);
    expect(ev).toHaveLength(1);
  });

  it('a queen death is booked once; a second queen death event does not re-orphan', () => {
    const sim = makeLifeSim();
    const ev = events(sim, ['queen.died', 'colony.orphaned']);
    const col = colonyOf(sim);
    send(sim, { type: 'cheat.killQueen', colonyId: col.id, cause: 'old-age' });
    send(sim, { type: 'cheat.killQueen', colonyId: col.id, cause: 'predation' });
    step(sim, 5);
    expect(ev.filter((e) => e.type === 'queen.died')).toHaveLength(1);
    expect(ev.filter((e) => e.type === 'colony.orphaned')).toHaveLength(1);
    expect(col.lifecycle!.succession.queenCause).toBe('old-age');
  });

  it('the epitaph after a winter counts it and stays plain data', () => {
    const sim = makeLifeSim({ chamberC: 4 });
    send(sim, { type: 'cheat.triggerWinter' });
    send(sim, { type: 'overwinterChoice', choice: 'begin' });
    send(sim, { type: 'overwinterChoice', choice: 'close-report' });
    send(sim, { type: 'retireColony' });
    const e = buildEpitaph(sim);
    expect(e.figures.winters).toBe(1);
    expect(e.cause).toBe('retired');
    expect(findNonPlain(JSON.parse(JSON.stringify(e)))).toEqual([]);
    expect(findNonPlain(colonyOf(sim).lifecycle)).toEqual([]);
  });
});
