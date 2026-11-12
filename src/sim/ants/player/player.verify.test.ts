// Independent review tests for possession, release inference and prompts (GDD 01 §3, §9). Passing tests are
// regression guards; a failing test here demonstrates a real defect and stays in place for the fixer.
import { afterEach, describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { ports } from '../actions/ports';
import { canDo } from '../actions/runner';
import { capture, installFakes, makeAntSim, source, step, worker } from '../actions/testkit';
import { promptCandidates } from './targeting';

const saved = { ...ports };
afterEach(() => { Object.assign(ports, saved); });

function setup(): { sim: Sim; fake: ReturnType<typeof installFakes>['fake'] } {
  const sim = makeAntSim();
  const f = installFakes(sim);
  return { sim, fake: f.fake };
}

describe('prompt candidates (GDD 01 §9.1: "entities in reach")', () => {
  it('a large liquid source whose edge is in reach is offered, as canDo accepts it', () => {
    const { sim } = setup();
    const w = worker(sim, 50, 50);
    sim.enqueue({ type: 'possess', antId: w.id });
    const s = source(sim, { x: 0, y: 0, z: 0 }, 'sugar', 5, { variant: 'sugary-spill', capacity: 5 });
    const bu = sim.world.bu;
    const r = ports.sourceFootprintMm(s, bu);
    expect(r).toBeGreaterThan(2 * bu); // a spill is wider than the prompt query radius around the head
    const d = 0.5 * w.lengthBu * bu + r + 0.3 * bu; // edge 0.3 BU in front of the mandibles
    s.pos = { x: w.pos.x + d, y: 0, z: w.pos.z };
    step(sim, 1); // refreshes the spatial index
    const t = { kind: 'source' as const, id: s.id, pos: s.pos };
    expect(canDo(sim, w, 'harvest-liquid', t).ok).toBe(true);
    const offered = promptCandidates(sim, w).some((c) => c.target.kind === 'source' && c.target.id === s.id);
    expect(offered).toBe(true);
  });
});

describe('release rule 2 (GDD 01 §3.5: land, then re-run the whole table)', () => {
  it('after landing, rule 15 still resumes the suspended task', () => {
    const { sim, fake } = setup();
    fake.demand = { dig: 0.2, forage: 0.9 };
    const w = worker(sim, 50, 50, 'worker', 'dig');
    sim.enqueue({ type: 'possess', antId: w.id });
    step(sim, 1);
    expect(w.suspendedTask).toBe('dig');
    w.medium = 'air';
    sim.enqueue({ type: 'release', reason: 'player' });
    step(sim, 2);
    w.medium = 'surface';
    step(sim, 2);
    // nothing carried, no dig frontier, no source: rule 15 (dig is still wanted) must win over rule 16 (forage)
    expect(w.task).toBe('dig');
  });
});

describe('possession edge cases', () => {
  it('possessing an ant killed earlier in the same command batch is rejected as dead', () => {
    const { sim } = setup();
    const w = worker(sim, 50, 50);
    const ev = capture(sim, ['possess-rejected', 'possession-started'], () => {
      sim.enqueue({ type: 'cheat.kill', id: w.id, cause: 'combat' });
      sim.enqueue({ type: 'possess', antId: w.id });
      step(sim, 1);
    });
    expect(ev.map((e) => e.type)).toEqual(['possess-rejected']);
    expect(sim.state.player.possessedAntId).toBe(-1);
  });

  it('releasing with nothing possessed is a no-op (no events)', () => {
    const { sim } = setup();
    const ev = capture(sim, ['possession-ended'], () => {
      sim.enqueue({ type: 'release', reason: 'player' });
      step(sim, 1);
    });
    expect(ev).toHaveLength(0);
  });

  it('re-possessing the same ant changes nothing (no second possession-started, suspendedTask kept)', () => {
    const { sim } = setup();
    const w = worker(sim, 50, 50, 'worker', 'forage');
    sim.enqueue({ type: 'possess', antId: w.id });
    step(sim, 1);
    const ev = capture(sim, ['possession-started', 'possession-ended'], () => {
      sim.enqueue({ type: 'possess', antId: w.id });
      step(sim, 1);
    });
    expect(ev).toHaveLength(0);
    expect(w.suspendedTask).toBe('forage');
  });
});
