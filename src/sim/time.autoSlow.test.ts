// sim-seams item 5: who owns the automatic slow-down (GDD 06 §4.5). The trigger is the game layer's: auto-slow is
// driven by raised alerts and by the player's Settings choice, and the speed is the game loop's (GDD 06 §4.3). The
// sim raises the alerts; the app's AutoSlowWatcher slows time and reports it as `time.auto-slow` on the sim's bus.
// So the event is not dead, and no sim system may emit it (the sim would then slow time twice or by a stale rule).
import { describe, expect, it } from 'vitest';

const SIM = import.meta.glob('/src/{sim,worldgen}/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const GAME = import.meta.glob('/src/game/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const EMIT = /type:\s*'time\.auto-slow'/;

describe('time.auto-slow ownership', () => {
  it('no simulation module emits it', () => {
    const emitters = Object.entries(SIM).filter(([f, s]) => !/\.test\.ts$|\/types\//.test(f) && EMIT.test(s)).map(([f]) => f);
    expect(emitters).toEqual([]);
  });

  it('the game layer emits it, from its auto-slow watcher', () => {
    const emitters = Object.entries(GAME).filter(([f, s]) => !/\.test\.ts$/.test(f) && EMIT.test(s)).map(([f]) => f);
    expect(emitters).toEqual(['/src/game/Game.ts']);
    expect(GAME['/src/game/time/autoSlow.ts']).toContain('class AutoSlowWatcher');
  });
});
