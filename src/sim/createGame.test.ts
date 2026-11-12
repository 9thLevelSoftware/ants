import { describe, expect, it } from 'vitest';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { generateWorld } from '@/worldgen';
import { calendarTick, currentDayOfSeason, currentSeason, currentDayOfYear } from '@/sim/time';
import { AntFlag } from '@/sim/types';

describe('createNewGame', () => {
  const config = { ...defaultGameConfig('lasius-niger', 42) };
  config.world = { ...config.world, sizeClass: 'compact' };

  it('generates the placeholder world deterministically', () => {
    const a = generateWorld(config.world), b = generateWorld(config.world);
    expect(a.meta.fingerprint).toBe(b.meta.fingerprint);
    expect(a.size).toBe(3000 * 4);
    expect(Array.from(a.terrain.data.slice(0, 50))).toEqual(Array.from(b.terrain.data.slice(0, 50)));
  });

  it('creates the player colony with a founding queen at the queen start', () => {
    const { state, world } = createNewGame(config);
    const col = state.colonies[0];
    expect(col.isPlayer).toBe(true);
    expect(state.player.colonyId).toBe(col.id);
    const queen = state.ants.find((a) => a.id === col.queenId);
    expect(queen?.caste).toBe('queen');
    expect(queen?.queen?.mode).toBe('founding');
    expect((queen?.flags ?? 0) & AntFlag.FOUNDING).toBeTruthy();
    expect(Math.abs((queen?.pos.x ?? 0) - world.queenStart.pos.x)).toBeLessThan(1);
    expect(state.nests[0].founding?.state).toBe('site-search');
    expect(state.nextId).toBeGreaterThan(col.queenId);
  });

  it('starts on the species founding day (Lasius: summer day 3) and honours the season length', () => {
    const { state } = createNewGame(config);
    expect(currentSeason(state)).toBe('summer');
    expect(currentDayOfYear(state)).toBe(10);
    const ten = { ...config, rules: { ...config.rules, seasonLengthDays: 10 as const } };
    const s10 = createNewGame(ten).state;
    expect(currentSeason(s10)).toBe('summer');
    expect(currentDayOfYear(s10)).toBe(13);
    expect(calendarTick(s10)).toBeGreaterThan(calendarTick(state));
  });

  it('createSim regenerates the same world when none is given', () => {
    const { state, world } = createNewGame(config);
    const sim = createSim(state);
    expect(sim.world.meta.fingerprint).toBe(world.meta.fingerprint);
    sim.tick();
    expect(sim.state.tick).toBe(1);
  });
});

describe('createNewGame start calendar', () => {
  it('clamps a start day past the end of a short custom season into that season', () => {
    const base = defaultGameConfig('lasius-niger', 5);
    const cfg = { ...base, startDayOfSeason: 9, rules: { ...base.rules, seasonLengthDays: 5 as const } };
    const { state } = createNewGame(cfg);
    expect(currentSeason(state)).toBe(base.startSeason);
    expect(currentDayOfSeason(state)).toBe(5);
  });

  it('refuses a winter start (directions §K)', () => {
    const base = defaultGameConfig('lasius-niger', 5);
    expect(() => createNewGame({ ...base, startSeason: 'winter' })).toThrow(/winter/);
  });
});
