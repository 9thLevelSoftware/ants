// Command robustness, possession speed rules, index refresh after commands, and system staggering.
import { describe, expect, it } from 'vitest';
import type { Command, Sim, SpeedLevel, System } from '@/sim/types';
import { makeTestSim } from '@/sim/testing';
import { SIM_MODULES, SYSTEMS } from '@/sim/systems';
import { SPECIES_MODULES } from '@/sim/species/modules';
import { systemDue } from '@/sim/sim';

function rejections(sim: Sim): string[] {
  const out: string[] = [];
  sim.events.on('command-rejected', (e) => out.push(`${e.commandType}:${e.reason}`));
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
    // pos: null makes placeMarker read a property of null.
    sim.enqueue({ type: 'placeMarker', kind: 'forage', pos: null } as unknown as Command);
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
    sim.enqueue({ type: 'setSpeed', speed: level });
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
    slow.enqueue({ type: 'possess', role: 'queen', dropTo1x: false });
    slow.tick();
    expect(slow.state.player.possessedAntId).toBe(queen(slow));
    expect(slow.state.env.time.speed).toBe(2);
  });

  it('a pause stays a pause (the running speed still drops to 1x for when the player resumes)', () => {
    const sim = makeTestSim();
    sim.enqueue({ type: 'setSpeed', speed: 4 });
    sim.enqueue({ type: 'setSpeed', speed: 0 });
    sim.tick();
    expect(sim.state.env.time.paused).toBe(true);
    sim.enqueue({ type: 'possess', antId: queen(sim), via: 'command' });
    sim.tick();
    expect(sim.state.env.time.paused).toBe(true);
    expect(sim.state.env.time.speed).toBe(1);
  });

  it('switching from one possessed ant to another keeps the player-chosen 4x', () => {
    const sim = makeTestSim();
    const col = sim.state.colonies[0];
    sim.enqueue({ type: 'cheat.spawnAnts', colonyId: col.id, n: 1, caste: 'worker', ageGd: 1, task: null, pos: null });
    sim.enqueue({ type: 'possess', antId: col.queenId, via: 'command' });
    sim.enqueue({ type: 'setSpeed', speed: 4 });
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
  const LCM = 3000; // multiple of 50, 100, 250 and 600
  const periodicOf = (list: readonly System[]): System[] => list.filter((s) => (s.every ?? 1) >= 50);
  /** "tick: a, b" for every tick of the LCM where more than one of `list` runs. */
  function collisions(list: readonly System[]): string[] {
    const out: string[] = [];
    for (let t = 0; t < LCM; t++) {
      const due = list.filter((s) => systemDue(s, t)).map((s) => s.name);
      if (due.length > 1) out.push(`${t}: ${due.join(', ')}`);
    }
    return out;
  }
  const core = periodicOf(SIM_MODULES.filter((m) => !m.key.startsWith('species-')).flatMap((m) => [...m.mod.systems]));

  it('no two periodic core systems of 50 ticks or more run on the same tick', () => {
    expect(core.length).toBeGreaterThan(5);
    for (const s of periodicOf(SYSTEMS)) expect(LCM % (s.every ?? 1), s.name).toBe(0);
    expect(collisions(core)).toEqual([]);
  });

  // A game runs the core systems plus one species module's systems (the player's species). Every species module
  // with periodic systems collides with the core or with itself (granary and fungus use offset 0 throughout; wood's
  // offsets meet rivals and progression). Not this file's to fix: listed in the sim-seams report for the module
  // owners (src/sim/species/modules/**). This test keeps the core clean while species modules are present.
  for (const m of SPECIES_MODULES) {
    it(`${m.key}: every collision in a game of that species involves one of its own systems`, () => {
      const own = periodicOf(m.mod.systems);
      const names = new Set(own.map((s) => s.name));
      for (const c of collisions([...core, ...own])) {
        expect(c.split(': ')[1].split(', ').some((n) => names.has(n)), c).toBe(true);
      }
    });
  }
});
