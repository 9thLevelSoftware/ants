// Every milestone row fires from a synthetic event or state through the real trigger path, exactly once; species
// rows only for their species; GDD 06 E21 (worker count, eclosion, reload).

import { describe, expect, it } from 'vitest';
import type { MilestoneId, Sim, SpeciesId } from '@/sim/types';
import { MILESTONE_IDS } from '@/sim/types';
import { createSim } from '@/sim/sim';
import { restore, snapshot } from '@/sim/save';
import { MILESTONE_RULES, attachProgression, systems } from './index';
import { MILESTONE_FIXTURES, addWorkers } from './fixtures';
import { makeProgSim, pollOnce, recordEvents } from './testkit';

const speciesOf = (id: MilestoneId): SpeciesId => MILESTONE_RULES.find((r) => r.id === id)?.species?.[0] ?? 'lasius-niger';

function fire(sim: Sim, id: MilestoneId): void {
  MILESTONE_FIXTURES[id](sim);
  pollOnce(sim);
}

describe('milestone table', () => {
  it('has exactly one rule per milestone id of the design index', () => {
    const ids = MILESTONE_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...MILESTONE_IDS].sort());
  });

  it.each([...MILESTONE_IDS])('%s fires from its synthetic trigger, exactly once', (id) => {
    const sim = makeProgSim({ species: speciesOf(id) });
    const reached = recordEvents(sim, ['milestone.reached']);
    fire(sim, id);
    expect(sim.state.progression.milestones[id], id).toBeDefined();
    fire(sim, id);
    expect(reached.filter((e) => e.type === 'milestone.reached' && e.id === id)).toHaveLength(1);
    const entries = sim.state.progression.journal.entries.filter((e) => e.kind === 'milestone' && e.key === id);
    expect(entries).toHaveLength(1);
  });

  it('species rows never fire for a species without the mechanic', () => {
    const rows = MILESTONE_RULES.filter((r) => r.species && !r.species.includes('lasius-niger'));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      const sim = makeProgSim({ species: 'lasius-niger' });
      fire(sim, r.id);
      expect(sim.state.progression.milestones[r.id], r.id).toBeUndefined();
    }
  });
});

describe('GDD 06 E21: milestones', () => {
  it('ms-workers-100 fires once when N first reaches 100, dated; ms-first-worker at the first eclosion only; reload does not refire', () => {
    const sim = makeProgSim();
    const reached = recordEvents(sim, ['milestone.reached']);
    addWorkers(sim, 99);
    pollOnce(sim);
    expect(sim.state.progression.milestones['ms-workers-100']).toBeUndefined();
    addWorkers(sim, 100);
    pollOnce(sim);
    const stamp = sim.state.progression.milestones['ms-workers-100'];
    expect(stamp).toBeDefined();
    expect(stamp.doy).toBeGreaterThanOrEqual(1);
    expect(stamp.year).toBe(1);
    const entry = sim.state.progression.journal.entries.find((e) => e.key === 'ms-workers-100')!;
    expect(entry.tick).toBe(stamp.tick);
    fire(sim, 'ms-first-worker');
    fire(sim, 'ms-first-worker');
    // reload: a new Sim over the restored state keeps every record and refires nothing
    const restored = createSim(restore(snapshot(sim)).state, sim.world, { systems });
    attachProgression(restored);
    const again = recordEvents(restored, ['milestone.reached']);
    addWorkers(restored, 150);
    MILESTONE_FIXTURES['ms-first-worker'](restored);
    pollOnce(restored);
    expect(again).toHaveLength(0);
    expect(reached.filter((e) => e.type === 'milestone.reached' && e.id === 'ms-workers-100')).toHaveLength(1);
    expect(reached.filter((e) => e.type === 'milestone.reached' && e.id === 'ms-first-worker')).toHaveLength(1);
  });

  it('ms-first-shaft carries {depth_mm}; ms-zone-crossed carries {zone_from} {zone_to}', () => {
    const sim = makeProgSim();
    fire(sim, 'ms-first-shaft');
    fire(sim, 'ms-zone-crossed');
    const shaft = sim.state.progression.journal.entries.find((e) => e.key === 'ms-first-shaft')!;
    expect(shaft.tokens).toEqual({ depth_mm: Math.round(8 * sim.world.bu) });
    const zone = sim.state.progression.journal.entries.find((e) => e.key === 'ms-zone-crossed')!;
    expect(Object.keys(zone.tokens!).sort()).toEqual(['zone_from', 'zone_to']);
    expect(zone.tokens!.zone_from).not.toBe(zone.tokens!.zone_to);
  });
});
