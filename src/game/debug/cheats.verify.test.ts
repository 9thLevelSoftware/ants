// Reviewer tests (F3b): cheat.* results must report sim refusals however long the game has been running. The
// cheats (and __game.command) find "their" events by slicing the session's event log from its length before the
// command; the log is capped at EVENT_LOG_SIZE, so once it is full that slice is always empty.
import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import type { Command } from '@/sim/types';
import type { Game } from '../Game';
import { GameSession } from '../session';
import { buildCheats } from './cheats';

const cam = { autoFollow: 'gentle' as const, fovOffset: 0, worldUpLock: false, reducedMotion: false };

/** The three members buildCheats uses, with Game.command's manual-clock behaviour (apply at once). */
function fakeGame(session: GameSession): Game {
  return {
    get sim() { return session.sim; },
    session,
    command(cmd: Command) { session.driver.enqueue(cmd); session.driver.applyCommandsNow(); session.update(0); },
  } as unknown as Game;
}

describe('cheat results (reviewer)', () => {
  it('a refused command is reported as refused on a fresh game', () => {
    const s = new GameSession(makeTestSim({ nest: 'small', workers: 1 }), cam);
    const cheat = buildCheats(fakeGame(s));
    expect((cheat.raw({ type: 'no-such-command' } as unknown as Command) as { ok: boolean }).ok).toBe(false);
  });

  it('a refused command is still reported as refused after more than 200 sim events', () => {
    const s = new GameSession(makeTestSim({ nest: 'small', workers: 1 }), cam);
    const cheat = buildCheats(fakeGame(s));
    expect((cheat.spawnAnts(250) as { ok: boolean }).ok).toBe(true); // 250 entity-created events fill the log
    const r = cheat.raw({ type: 'no-such-command' } as unknown as Command) as { ok: boolean };
    expect(r.ok).toBe(false);
  });
});
