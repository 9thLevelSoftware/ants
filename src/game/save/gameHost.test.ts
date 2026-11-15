// GameHost.adopt follows the order of Game.newGame: old game ends, renderers build the loaded world, play starts.
import { describe, expect, it } from 'vitest';
import type { Game } from '../Game';
import { GameHost } from './gameHost';
import { makeSim } from './testkit';

function fakeGame(opts: { onGameStart?: () => Promise<void> } = {}) {
  const calls: string[] = [];
  const fake = {
    mode: 'loading' as string, view: 'observer', session: { sim: null } as unknown, loading: null as unknown, loadToken: 0,
    opts: { testMode: true, canvas: null },
    settings: { get: () => ({ gameplay: { pauseOnLoad: false } }) },
    registry: {
      onGameStart: async () => { calls.push('onGameStart'); await (opts.onGameStart ?? (() => Promise.resolve()))(); },
      onGameEnd: () => { calls.push('onGameEnd'); },
    },
    endGame: () => { calls.push('endGame'); fake.loadToken++; fake.session = null; fake.loading = null; fake.registry.onGameEnd(); },
    startPlaying: () => { calls.push('startPlaying'); fake.mode = 'playing'; fake.session = null; },
    // mirrors Game.adoptSim: the renderers build the world, a superseded load throws, then play starts
    adoptSim: async () => {
      const token = fake.loadToken;
      try { await fake.registry.onGameStart(); } catch (e) { fake.registry.onGameEnd(); throw e; }
      if (fake.loadToken !== token) throw new Error('The load was superseded by a newer game.');
      fake.startPlaying();
    },
    setSpeed: () => {}, renderNow: () => {}, refreshUi: () => {}, viewChanged: () => {},
  };
  return { fake, calls, host: new GameHost(fake as unknown as Game) };
}

describe('GameHost.adopt', () => {
  it('ends the old game, builds the renderers\' world, then starts playing', async () => {
    const { calls, host } = fakeGame();
    await host.loadingBegin();
    await host.adopt(makeSim(2).sim, {} as never);
    expect(calls).toEqual(['endGame', 'onGameEnd', 'onGameStart', 'startPlaying']);
  });

  it('does not start playing when the renderers fail, and leaves the loading state for the title', async () => {
    const { fake, calls, host } = fakeGame({ onGameStart: () => Promise.reject(new Error('gpu lost')) });
    await host.loadingBegin();
    await expect(host.adopt(makeSim(2).sim, {} as never)).rejects.toThrow('gpu lost');
    expect(calls).not.toContain('startPlaying');
    expect(calls.at(-1)).toBe('onGameEnd'); // the half-built world is dropped
    host.loadingEnd();
    expect(fake.mode).toBe('title'); // no session is left to return to
    expect(fake.loading).toBeNull();
  });

  it('a newer game that started during the build is not overwritten', async () => {
    let release!: () => void;
    const { fake, calls, host } = fakeGame({ onGameStart: () => new Promise<void>((r) => { release = r; }) });
    await host.loadingBegin();
    const adopting = host.adopt(makeSim(2).sim, {} as never);
    fake.loadToken++; // a newGame / endGame happened meanwhile
    release();
    await expect(adopting).rejects.toThrow(/superseded/);
    expect(calls).not.toContain('startPlaying');
    fake.mode = 'playing'; // the newer game is running now
    host.loadingEnd();
    expect(fake.mode).toBe('playing'); // loadingEnd leaves it alone
  });
});
