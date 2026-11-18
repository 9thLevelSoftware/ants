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

  // A game runs the core systems plus one species module's systems (the player's species). The species modules'
  // periodic systems collide today (granary and fungus use offset 0 throughout; wood's offsets meet core systems):
  // not this file's to fix, listed in the sim-seams report for the module owners (src/sim/species/modules/**).
  // KNOWN_PAIRS is that list as of Nov 18 (test-output/sim-seams-fix/staggerPairs.txt); any other pair of systems
  // meeting on one tick fails. Remove a pair when its owner staggers it.
  const KNOWN_PAIRS: Record<string, readonly string[]> = {
    'species-honeydew': [],
    'species-wood': [
      'colony-stats + wood-brood', 'diagnostics + wood-brood', 'outdoor-marker-response + wood-castes',
      'outdoor-trail-monitor + wood-state', 'plants + wood-brood', 'rivals + wood-brood', 'sources + wood-brood',
    ],
    'species-granary': [
      'allocation + granary-allocation', 'granary-diagnostics + granary-display', 'granary-diagnostics + granary-middens',
      'granary-diagnostics + granary-seed-sources', 'granary-diagnostics + granary-winter',
      'granary-display + granary-middens', 'granary-display + granary-seed-sources', 'granary-display + granary-winter',
      'granary-middens + granary-seed-sources', 'granary-middens + granary-winter', 'granary-seed-sources + granary-winter',
    ],
    'species-fungus': [
      'allocation + fungus-allocation', 'fungus-caste-destiny + fungus-diagnostics', 'fungus-caste-destiny + fungus-display',
      'fungus-caste-destiny + fungus-leaf-sites', 'fungus-caste-destiny + fungus-phorid-deaths',
      'fungus-diagnostics + fungus-display', 'fungus-diagnostics + fungus-leaf-sites', 'fungus-diagnostics + fungus-phorid-deaths',
      'fungus-display + fungus-leaf-sites', 'fungus-display + fungus-phorid-deaths', 'fungus-leaf-sites + fungus-phorid-deaths',
    ],
  };
  /** "a + b" (names sorted) for every pair of `list` that runs on one tick of the LCM. */
  function collidingPairs(list: readonly System[]): Set<string> {
    const pairs = new Set<string>();
    for (let t = 0; t < LCM; t++) {
      const due = list.filter((s) => systemDue(s, t)).map((s) => s.name).sort();
      for (let i = 0; i < due.length; i++) for (let j = i + 1; j < due.length; j++) pairs.add(`${due[i]} + ${due[j]}`);
    }
    return pairs;
  }

  it('the known-collision list names every species module', () => {
    expect(Object.keys(KNOWN_PAIRS).sort()).toEqual(SPECIES_MODULES.map((m) => m.key).sort());
  });

  for (const m of SPECIES_MODULES) {
    it(`${m.key}: no periodic systems meet on one tick in a game of that species except the known pairs`, () => {
      const known = new Set(KNOWN_PAIRS[m.key] ?? []);
      const fresh = [...collidingPairs([...core, ...periodicOf(m.mod.systems)])].filter((p) => !known.has(p));
      expect(fresh).toEqual([]);
    });
  }

  it('the pair check catches a new collision between a species system and a core system', () => {
    const m = SPECIES_MODULES.find((x) => x.key === 'species-honeydew')!;
    const clash: System = { ...core[0], name: 'probe-clash' };
    const known = new Set(KNOWN_PAIRS[m.key]);
    const fresh = [...collidingPairs([...core, ...periodicOf(m.mod.systems), clash])].filter((p) => !known.has(p));
    expect(fresh).toContain([core[0].name, 'probe-clash'].sort().join(' + '));
  });
});
