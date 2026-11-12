// Command robustness, possession speed rules, index refresh after commands, and system staggering.
import { describe, expect, it } from 'vitest';
import type { Command, Sim, SpeedLevel, System } from '@/sim/types';
import { makeTestSim } from '@/sim/testing';
import { SYSTEMS } from '@/sim/systems';
import { systemDue } from '@/sim/sim';

function rejections(sim: Sim): string[] {
  const out: string[] = [];
  sim.events.on('command-rejected', (e) => out.push(`${e.command}:${e.reason}`));
  return out;
}

describe('bad commands never stop the simulation', () => {
  it('an unknown or malformed command becomes command-rejected and later commands still run', () => {
    const sim = makeTestSim();
    const seen = rejections(sim);
    sim.enqueue({ type: 'noSuchCommand' } as unknown as Command);
    sim.enqueue({ type: 'toString' } as unknown as Command); // inherited property names are not handlers
    sim.enqueue({} as unknown as Command);
    sim.enqueue({ type: 'cheat.addFood', colonyId: sim.state.colonies[0].id, c: 2, p: 0, toxin: 0 });
    expect(() => sim.tick()).not.toThrow();
    expect(seen).toEqual(['noSuchCommand:unknown-type', 'toString:unknown-type', 'undefined:unknown-type']);
    expect(sim.state.colonies[0].stores.c).toBe(2);
    expect(() => sim.tick()).not.toThrow();
  });

  it('a handler that throws is rejected with its message, applied once, and does not block later ticks', () => {
    const sim = makeTestSim();
    const details: string[] = [];
    sim.events.on('command-rejected', (e) => { if (e.reason === 'handler-error') details.push(e.detail ?? ''); });
    const seq0 = sim.state.env.time.commandSeq;
    // patch: null makes setDirectives read a property of null.
    sim.enqueue({ type: 'setDirectives', colonyId: sim.state.colonies[0].id, patch: null } as unknown as Command);
    sim.tick();
    sim.tick();
    expect(details.length).toBe(1);
    expect(details[0].length).toBeGreaterThan(0);
    expect(sim.state.env.time.commandSeq).toBe(seq0);
  });
});

describe('possession and time speed (GDD 01 §8, GDD 06 §4)', () => {
  function atSpeed(level: SpeedLevel): Sim {
    const sim = makeTestSim();
    sim.enqueue({ type: 'setSpeed', level });
    sim.tick();
    return sim;
  }
  const queen = (sim: Sim): number => sim.state.colonies[0].queenId;

  it('possession start drops 8x and 4x to 1x, with a speed-changed event, and release does not restore', () => {
    for (const level of [8, 4] as const) {
      const sim = atSpeed(level);
      const changes: string[] = [];
      sim.events.on('time.speed-changed', (e) => changes.push(`${e.from}->${e.to}:${e.reason}`));
      sim.enqueue({ type: 'possess', antId: queen(sim), via: 'command' });
      sim.tick();
      expect(sim.state.env.time.speed).toBe(1);
      expect(sim.state.env.time.requested).toBe(1);
      expect(changes).toEqual([`${level}->1:possession`]);
      sim.enqueue({ type: 'release', reason: 'player' });
      sim.tick();
      expect(sim.state.env.time.speed).toBe(1);
    }
  });

  it('with dropTo1x off, 8x is clamped to 4x and 2x is kept', () => {
    const fast = atSpeed(8);
    fast.enqueue({ type: 'possess', antId: queen(fast), via: 'command', dropTo1x: false });
    fast.tick();
    expect(fast.state.env.time.speed).toBe(4);
    const slow = atSpeed(2);
    slow.enqueue({ type: 'possessRole', role: 'queen', dropTo1x: false });
    slow.tick();
    expect(slow.state.player.possessedAntId).toBe(queen(slow));
    expect(slow.state.env.time.speed).toBe(2);
  });

  it('a pause stays a pause', () => {
    const sim = atSpeed(0);
    sim.enqueue({ type: 'possess', antId: queen(sim), via: 'command' });
    sim.tick();
    expect(sim.state.env.time.speed).toBe(0);
    expect(sim.state.env.time.paused).toBe(true);
  });

  it('switching from one possessed ant to another keeps the player-chosen 4x', () => {
    const sim = makeTestSim();
    const col = sim.state.colonies[0];
    sim.enqueue({ type: 'cheat.spawnAnts', colonyId: col.id, n: 1, caste: 'worker', ageGd: 1, task: null, pos: null });
    sim.enqueue({ type: 'possess', antId: col.queenId, via: 'command' });
    sim.enqueue({ type: 'setSpeed', level: 4 });
    sim.tick();
    const worker = sim.state.ants.find((a) => a.caste === 'worker');
    sim.enqueue({ type: 'possess', antId: worker!.id, via: 'cycle' });
    sim.tick();
    expect(sim.state.player.possessedAntId).toBe(worker!.id);
    expect(sim.state.env.time.speed).toBe(4);
  });
});

describe('entity index and commands', () => {
  it('entities spawned by commands are found through sim.index in the same tick', () => {
    let found = -1;
    const probe: System = {
      name: 'probe',
      run: (sim) => {
        const out: number[] = [];
        const q = sim.world.queenStart.pos;
        found = sim.index.queryCreatures({ x: q.x + 10, y: q.y, z: q.z }, 5, out).length;
      },
    };
    const sim = makeTestSim({ systems: [SYSTEMS[0], probe] });
    const q = sim.world.queenStart.pos;
    sim.enqueue({ type: 'cheat.spawnCreature', kind: 'springtail', variant: null, pos: { x: q.x + 10, y: q.y, z: q.z }, state: null });
    sim.tick();
    expect(found).toBe(1);
  });
});

describe('system staggering', () => {
  it('no two periodic systems of 50 ticks or more run on the same tick', () => {
    const periodic = SYSTEMS.filter((s) => (s.every ?? 1) >= 50);
    expect(periodic.length).toBeGreaterThan(5);
    const lcm = 3000; // multiple of 50, 100, 250 and 600
    for (const s of periodic) expect(lcm % (s.every ?? 1)).toBe(0);
    for (let t = 0; t < lcm; t++) {
      const due = periodic.filter((s) => systemDue(s, t)).map((s) => s.name);
      expect(due.length, `tick ${t}: ${due.join(', ')}`).toBeLessThanOrEqual(1);
    }
  });
});
