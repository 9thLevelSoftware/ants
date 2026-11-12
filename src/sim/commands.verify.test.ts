// Adversarial checks of the F1c command handlers, reviewer-written.
// Tests that FAIL here document real defects for the fixer; passing ones stay as regression tests.
import { describe, expect, it } from 'vitest';
import type { Command, Sim } from '@/sim/types';
import { DIFFICULTY_IDS, RUN_SPEEDS } from '@/sim/types';
import { makeTestSim } from '@/sim/testing';
import { defaultGameConfig } from '@/sim/createGame';

function cheatSim(): Sim {
  return makeTestSim({ config: { ...defaultGameConfig(), cheats: true } });
}

describe('F1c verify: untyped debug-API commands cannot corrupt persisted state', () => {
  it('setDifficulty with an unknown preset leaves config.difficulty and config.rules intact', () => {
    const sim = makeTestSim();
    const before = JSON.stringify(sim.state.config);
    sim.enqueue({ type: 'setDifficulty', preset: 'easy' } as unknown as Command);
    sim.tick();
    expect(DIFFICULTY_IDS).toContain(sim.state.config.difficulty.preset);
    expect(sim.state.config.difficulty.params).toBeDefined();
    expect(JSON.stringify(sim.state.config)).toBe(before);
  });

  it('setSpeed with a value outside 0/1/2/4/8 does not change env.time.speed', () => {
    const sim = makeTestSim();
    for (const speed of [3, 16, -1, Number.NaN]) {
      sim.enqueue({ type: 'setSpeed', speed } as unknown as Command);
      sim.tick();
      expect(RUN_SPEEDS as readonly number[], String(speed)).toContain(sim.state.env.time.speed);
    }
  });
});

describe('F1c verify: cheat.kill keeps the requested canonical cause', () => {
  it('a worker killed with cause predation dies of predation', () => {
    const sim = cheatSim();
    const col = sim.state.colonies[0];
    sim.enqueue({ type: 'cheat.spawnAnts', colonyId: col.id, n: 1, caste: 'worker', ageGd: 1, task: null, pos: null });
    sim.tick();
    const w = sim.state.ants.find((a) => a.caste === 'worker')!;
    const causes: string[] = [];
    sim.events.on('ant-died', (e) => causes.push(e.cause));
    sim.enqueue({ type: 'cheat.kill', id: w.id, cause: 'predation' });
    sim.tick();
    expect(causes).toEqual(['predation']);
  });
});

describe('F1c verify: setDifficulty semantics (D4.18, D1.12) - regression', () => {
  it('changes the preset and its params, records the history, keeps generation-time rules', () => {
    const sim = makeTestSim();
    const cfg = sim.state.config;
    const len = cfg.rules.seasonLengthDays;
    const rivals = cfg.rules.rivals;
    sim.enqueue({ type: 'setDifficulty', preset: 'harsh', custom: { seasonLengthDays: 10, rivals: 0, humanActivity: 'off' } });
    sim.tick();
    expect(cfg.difficulty.preset).toBe('harsh');
    expect(cfg.difficulty.params.openingRetries).toBe(0);
    expect(cfg.rules.seasonLengthDays).toBe(len);
    expect(cfg.rules.rivals).toBe(rivals);
    expect(cfg.rules.humanActivity).toBe('off');
    expect(cfg.rules.queenSenescence).toBe(true);
    expect(sim.state.progression.difficultyHistory).toEqual([{ tick: 0, preset: 'harsh' }]);
    // back to the default preset keeps the player's override
    sim.enqueue({ type: 'setDifficulty', preset: 'naturalist' });
    sim.tick();
    expect(cfg.rules.humanActivity).toBe('off');
    expect(cfg.rules.queenSenescence).toBe(false);
  });

  it('togglePause round-trips the running speed and emits time.speed-changed both ways', () => {
    const sim = makeTestSim();
    const seen: string[] = [];
    sim.events.on('time.speed-changed', (e) => seen.push(`${e.from}->${e.to}`));
    sim.enqueue({ type: 'setSpeed', speed: 4 });
    sim.enqueue({ type: 'togglePause' });
    sim.tick();
    expect(sim.state.env.time.paused).toBe(true);
    expect(sim.state.env.time.speed).toBe(4);
    sim.enqueue({ type: 'togglePause' });
    sim.tick();
    expect(sim.state.env.time.paused).toBe(false);
    expect(seen).toEqual(['1->4', '4->0', '0->4']);
  });

  it('possess with neither antId nor role is rejected without changing the possessed ant', () => {
    const sim = makeTestSim();
    const rejected: string[] = [];
    sim.events.on('possess-rejected', (e) => rejected.push(e.reason));
    sim.enqueue({ type: 'possess' } as unknown as Command);
    sim.tick();
    expect(rejected.length).toBe(1);
    expect(sim.state.player.possessedAntId).toBe(-1);
  });
});
