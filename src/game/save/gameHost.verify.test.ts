// Independent review test for the Game adapter of the save layer (task save).
import { describe, expect, it } from 'vitest';
import type { Game } from '../Game';
import { GameHost } from './gameHost';
import { makeSim } from './testkit';

describe('review: GameHost.adopt', () => {
  // BUG: Game.newGame builds the renderers' world with `await registry.onGameStart(sim)` BEFORE the private
  // startPlaying(); startPlaying no longer does it. adopt() calls endGame(false) (registry.onGameEnd drops every mesh)
  // and then startPlaying(), so after any load the terrain, objects and nest are never built: the harness screenshot
  // after a load shows only sky and the possessed ant (perf(): world.terrainTriangles 0, nest.chunks 0).
  it('a loaded game asks the renderers to build its world', () => {
    const { sim } = makeSim(2);
    const calls: string[] = [];
    const fake = {
      mode: 'playing', view: 'observer', session: null as unknown, opts: { testMode: true, canvas: null },
      settings: { get: () => ({ gameplay: { pauseOnLoad: false } }) },
      registry: { onGameStart: () => { calls.push('onGameStart'); return Promise.resolve(); }, onGameEnd: () => calls.push('onGameEnd') },
      endGame: () => { calls.push('endGame'); fake.registry.onGameEnd(); },
      startPlaying: () => { calls.push('startPlaying'); },
      // Game.adoptSim (gate 1B: the public replacement for the private startPlaying cast)
      adoptSim: async () => { await fake.registry.onGameStart(); fake.startPlaying(); },
      setSpeed: () => {}, renderNow: () => {}, refreshUi: () => {}, viewChanged: () => {},
    };
    new GameHost(fake as unknown as Game).adopt(sim, {} as never);
    expect(calls).toContain('onGameStart'); // actual: ['endGame', 'onGameEnd', 'startPlaying']
    expect(calls.lastIndexOf('onGameStart')).toBeGreaterThan(calls.lastIndexOf('onGameEnd'));
  });
});
