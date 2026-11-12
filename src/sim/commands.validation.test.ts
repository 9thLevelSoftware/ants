// Commands arriving as untyped JSON (debug API): invalid values are rejected and change nothing; canonical
// causes are kept. Complements commands.verify.test.ts (reviewer-written).
import { describe, expect, it } from 'vitest';
import type { Command, Sim } from '@/sim/types';
import { makeTestSim } from '@/sim/testing';

function rejections(sim: Sim): string[] {
  const out: string[] = [];
  sim.events.on('command-rejected', (e) => out.push(`${e.commandType}:${e.reason}`));
  return out;
}

describe('setDifficulty validation', () => {
  it('rejects an unknown preset, an unknown rule and an invalid rule value, changing nothing', () => {
    const sim = makeTestSim();
    const seen = rejections(sim);
    const before = JSON.stringify(sim.state.config);
    const bad = [
      { type: 'setDifficulty', preset: 'easy' },
      { type: 'setDifficulty', custom: { humanActivity: 'loud' } },
      { type: 'setDifficulty', custom: { noSuchRule: true } },
      { type: 'setDifficulty', custom: { rivals: 9 } },
      { type: 'setDifficulty', custom: 'harsh' },
      { type: 'setDifficulty', preset: 'harsh', custom: { collapse: 'yes' } }, // valid preset, invalid rule: all refused
    ];
    for (const c of bad) sim.enqueue(c as unknown as Command);
    sim.tick();
    expect(seen).toEqual(bad.map(() => 'setDifficulty:invalid-difficulty'));
    expect(JSON.stringify(sim.state.config)).toBe(before);
    expect(sim.state.progression.difficultyHistory).toEqual([]);
  });

  it('accepts undefined to clear an override', () => {
    const sim = makeTestSim();
    sim.enqueue({ type: 'setDifficulty', custom: { humanActivity: 'off' } });
    sim.tick();
    expect(sim.state.config.rules.humanActivity).toBe('off');
    sim.enqueue({ type: 'setDifficulty', custom: { humanActivity: undefined } });
    sim.tick();
    expect(sim.state.config.rules.humanActivity).toBe('normal');
  });
});

describe('setSpeed validation', () => {
  it('rejects values outside 0/1/2/4/8 with command-rejected and accepts the valid ones', () => {
    const sim = makeTestSim();
    const seen = rejections(sim);
    for (const speed of [3, '2', null]) sim.enqueue({ type: 'setSpeed', speed } as unknown as Command);
    sim.enqueue({ type: 'setSpeed', speed: 2 });
    sim.tick();
    expect(seen).toEqual(['setSpeed:invalid-speed', 'setSpeed:invalid-speed', 'setSpeed:invalid-speed']);
    expect(sim.state.env.time.speed).toBe(2);
  });
});

describe('kill cheats keep canonical causes', () => {
  it('cheat.kill falls back to unknown for a non-canonical cause; cheat.killQueen keeps its cause', () => {
    const sim = makeTestSim();
    const col = sim.state.colonies[0];
    sim.enqueue({ type: 'cheat.spawnAnts', colonyId: col.id, n: 1, caste: 'worker', ageGd: 1, task: null, pos: null });
    sim.tick();
    const w = sim.state.ants.find((a) => a.caste === 'worker')!;
    const causes: string[] = [];
    sim.events.on('ant-died', (e) => causes.push(`${e.caste}:${e.cause}`));
    sim.enqueue({ type: 'cheat.kill', id: w.id, cause: 'boredom' });
    sim.enqueue({ type: 'cheat.killQueen', colonyId: col.id, cause: 'drowning' });
    sim.tick();
    expect(causes).toEqual(['worker:unknown', 'queen:drowning']);
  });

  it('cheat.kill on brood keeps a canonical brood cause', () => {
    const sim = makeTestSim();
    const col = sim.state.colonies[0];
    sim.enqueue({ type: 'cheat.spawnBrood', colonyId: col.id, stage: 'larva', n: 1, chamberId: -1, progress: 0, destined: null });
    sim.tick();
    const b = sim.state.brood[0];
    const causes: string[] = [];
    sim.events.on('brood-died', (e) => causes.push(e.cause));
    sim.enqueue({ type: 'cheat.kill', id: b.id, cause: 'flooding' });
    sim.tick();
    expect(causes).toEqual(['flooding']);
  });
});
