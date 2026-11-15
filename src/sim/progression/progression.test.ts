// Module-level checks: plain-data state, determinism of the whole progression state, deaths and losses, queen loss
// and extinction (GDD 06 E24 parts at this level), the queries the interface uses.

import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { findNonPlain } from '@/sim/testing';
import { killAnt } from '@/sim/entities';
import { stateHash } from '@/sim/save';
import { TICKS_PER_HOUR } from '@/sim/time';
import {
  deathSummary, eventLog, journalEntries, milestoneList, publishDiagnostic, queenHandedOver, stageInfo,
} from './index';
import { MILESTONE_FIXTURES, addWorkers } from './fixtures';
import { makeProgSim, pollOnce, recordEvents } from './testkit';

function script(sim: Sim): void {
  sim.state.player.opening!.phase = 'handover';
  addWorkers(sim, 30);
  for (const id of ['ms-first-food', 'ms-first-worker', 'ms-first-trail', 'ms-first-frost'] as const) MILESTONE_FIXTURES[id](sim);
  publishDiagnostic(sim, {
    id: 'diag-nest-space', system: 'nest', status: 'warn', label: 'Nest space', value: Infinity, remedies: ['remedy.dig.general'],
    factors: [{ cause: 'crowding', weight: 1, detail: '140 %', diagId: null }], sinceTick: sim.state.tick, focus: null,
  });
  for (let i = 0; i < 6 * TICKS_PER_HOUR; i++) sim.tick();
}

describe('progression state', () => {
  it('is plain data and deterministic', () => {
    const a = makeProgSim({ seed: 5 });
    const b = makeProgSim({ seed: 5 });
    script(a);
    script(b);
    expect(findNonPlain(a.state.progression)).toEqual([]);
    expect(stateHash(a.state)).toBe(stateHash(b.state));
    expect(JSON.stringify(a.state.progression)).toBe(JSON.stringify(b.state.progression));
  });

  it('counts deaths by cause and season, writes a loss entry for a burst, and journals the queen loss', () => {
    const sim = makeProgSim({ workers: 12 });
    const col = sim.state.colonies[0];
    const workers = sim.stores.ants.list.filter((a) => a.alive && a.colony === col.id && a.caste === 'worker');
    for (const a of workers.slice(0, 6)) killAnt(sim, a.id, 'predation');
    killAnt(sim, col.queenId, 'old-age');
    pollOnce(sim);
    const d = deathSummary(sim);
    expect(d.total).toBe(7);
    expect(d.top[0]).toEqual({ cause: 'predation', n: 6 });
    expect(Object.values(d.bySeason).reduce((x, y) => x + y, 0)).toBe(7);
    // one burst entry and the queen's own loss entry (GDD 06 §9.1)
    expect(journalEntries(sim, ['loss']).map((e) => e.key)).toEqual(['loss', 'loss.queen']);
    expect(journalEntries(sim, ['loss'])[1].tokens).toEqual({ cause: 'old-age' });
    expect(sim.state.progression.milestones['ms-queen-lost']).toBeDefined();
    expect(eventLog(sim).some((r) => r.kind === 'death' && r.key === 'queen-died')).toBe(true);
    expect(sim.state.progression.history.hourly['deaths-by-cause:predation']).toBeUndefined(); // until the next hourly sample
  });

  it('records the game over with the event cause chain, or the worst diagnostic chain when it has none', () => {
    const sim = makeProgSim();
    const col = sim.state.colonies[0];
    sim.emit({ type: 'colony.extinct', colonyId: col.id, cause: 'starvation', causeChain: ['diag-stores', 'starvation'] });
    sim.tick();
    expect(sim.state.progression.gameOver).toBe(true);
    expect(sim.state.progression.finalCauses).toEqual(['diag-stores', 'starvation']);
    const other = makeProgSim();
    publishDiagnostic(other, {
      id: 'diag-food-intake-c', system: 'colony', status: 'bad', label: 'C', value: 0.1, remedies: [], sinceTick: 0, focus: null,
      factors: [{ cause: 'foragers', weight: 1, detail: '', diagId: null }],
    });
    other.emit({ type: 'colony.extinct', colonyId: other.state.colonies[0].id, cause: 'starvation', causeChain: [] });
    other.tick();
    expect(other.state.progression.finalCauses).toEqual(['diag-food-intake-c', 'foragers']);
  });

  it('answers the interface queries with copies', () => {
    const sim = makeProgSim({ workers: 4 });
    const ev = recordEvents(sim, ['journal.entry']);
    expect(queenHandedOver(sim)).toBe(false);
    sim.state.player.opening!.phase = 'done';
    expect(queenHandedOver(sim)).toBe(true);
    pollOnce(sim);
    const list = milestoneList(sim);
    expect(list.map((m) => m.id)).toContain('ms-second-chamber');
    list[0].tick = -99;
    expect(sim.state.progression.milestones[list[0].id].tick).not.toBe(-99);
    expect(stageInfo(sim).stage.id).toBe('first-workers');
    expect(ev.length).toBeGreaterThan(0);
  });
});
