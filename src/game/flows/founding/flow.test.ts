// The founding flow without a browser: time-lapse playback (watching and skipping end in the same simulation
// state, acceptance criterion 4 / GDD 06 App. E 19), the outcome card and hand-over choice, and that normal play is
// back afterwards (speed controls, a worker can be possessed). The founding screens' read-out is checked too.
import { describe, expect, it } from 'vitest';
import type { Command, PossessRole, Sim, SpeedLevel } from '@/sim/types';
import { makeTestSim } from '@/sim/testing';
import { stateHash } from '@/sim/save/hash';
import { setClimateOverride } from '@/sim/colony/envAdapter';
import { foundingUi } from '@/ui/screens/founding/store';
import { GameSession } from '../../session';
import { allowedSpeeds } from '../../time/speedRules';
import { FoundingFlow, type FoundingHost } from './flow';
import { watchTicksPerSecond } from './lapseRunner';

const cam = { autoFollow: 'gentle' as const, fovOffset: 0, worldUpLock: false, reducedMotion: false };

class FakeHost implements FoundingHost {
  realtime = true;
  mode = 'playing' as const;
  readonly opts = { testMode: false };
  readonly settings = { get: () => ({ camera: { reducedMotion: false } }) };
  constructor(public session: GameSession) {}
  command(cmd: Command): void { this.session.driver.enqueue(cmd); this.session.driver.applyCommandsNow(); this.session.update(0); }
  possess(target: number | PossessRole): void { this.command(this.session.possessCommand(target, true)); }
  cycle(): void {}
  setSpeed(level: SpeedLevel): void { this.command({ type: 'setSpeed', speed: level }); }
  afterStep(s: GameSession): void { s.update(0); }
  async restartWith(): Promise<void> {}
}

/** A test game at the start of its time-lapse (the clutch laid by the debug path), the queen possessed. */
function atLapse(): { sim: Sim; session: GameSession; host: FakeHost; flow: FoundingFlow } {
  const sim = makeTestSim({ sizeBu: 128, seed: 3 });
  setClimateOverride(sim, { chamberTemp: () => 29, pointTemp: () => 29 }); // fast brood: a short lapse
  const session = new GameSession(sim, cam);
  const host = new FakeHost(session);
  host.possess('queen');
  const flow = new FoundingFlow(host);
  flow.attach(session);
  sim.enqueue({ type: 'cheat.completeFounding', workers: 8 });
  for (let i = 0; i < 3000 && sim.state.player.opening!.phase !== 'timelapse'; i++) session.driver.step(1);
  // from here on as a player would have it: not the debug path's full-rate lapse
  const op = sim.state.player.opening!;
  op.lapse!.skipped = false;
  const q = sim.stores.ants.get(sim.state.colonies[0].queenId)!;
  delete q.bb['fd.auto'];
  return { sim, session, host, flow };
}

/** Real frames of 1/60 s until the hand-over (or the frame cap). */
function playFrames(flow: FoundingFlow, session: GameSession, sim: Sim, skipAfter = -1): number {
  let frames = 0;
  for (; frames < 40_000 && sim.state.player.opening!.phase === 'timelapse'; frames++) {
    if (frames === skipAfter) flow.skipLapse();
    flow.frame(session, 1 / 60);
  }
  return frames;
}

describe('founding flow: the time-lapse (GDD 06 §5.11)', () => {
  it('watching runs about span x 600 / 75 game s per real s; skipping reaches the same state (same stateHash)', () => {
    const a = atLapse();
    const b = atLapse();
    expect(stateHash(a.sim.state)).toBe(stateHash(b.sim.state));
    expect(a.sim.state.player.opening!.phase).toBe('timelapse');
    // watching: the first second of frames runs about one second's worth of the playback rate
    const t0 = a.sim.state.tick;
    for (let i = 0; i < 60; i++) a.flow.frame(a.session, 1 / 60);
    const tl = a.sim.state.player.timelapse!;
    const rate = watchTicksPerSecond((tl.endTick - tl.startTick) / 6000);
    expect(a.sim.state.tick - t0).toBeGreaterThan(rate * 0.8);
    expect(a.sim.state.tick - t0).toBeLessThan(rate * 1.2);
    expect(foundingUi.value?.lapse).not.toBeNull();
    const watched = playFrames(a.flow, a.session, a.sim);
    const skippedFrames = playFrames(b.flow, b.session, b.sim, 60);
    expect(a.sim.state.player.opening!.phase).toBe('handover');
    expect(b.sim.state.player.opening!.phase).toBe('handover');
    expect(skippedFrames).toBeLessThan(watched);
    expect(b.sim.state.tick).toBe(a.sim.state.tick);
    expect(stateHash(b.sim.state)).toBe(stateHash(a.sim.state));
  }, 120_000);

  it('after the lapse: outcome card, hand-over choice (take a worker), then normal play with every speed', () => {
    const { sim, session, flow } = atLapse();
    flow.skipLapse();
    playFrames(flow, session, sim);
    flow.frame(session, 1 / 60);
    const ui = foundingUi.value!;
    expect(ui.outcome).not.toBeNull();
    expect(ui.outcome!.workers).toBeGreaterThan(0);
    flow.closeOutcome();
    expect(foundingUi.value!.handover).not.toBeNull();
    expect(foundingUi.value!.handover!.aims.length).toBeGreaterThan(0);
    flow.takeWorker();
    const a = sim.stores.ants.get(session.possessedId);
    expect(a?.caste).toBe('worker');
    expect(foundingUi.value!.handover).toBeNull();
    // normal play: the opening is done once the player moves (or after 10 s); every speed is offered again
    for (let i = 0; i < 120; i++) session.driver.step(1);
    expect(sim.state.player.opening!.phase).toBe('done');
    expect(sim.state.player.timelapse).toBeNull();
    expect(allowedSpeeds({ mode: 'playing', view: 'observer', possessed: false, openingPhase: null, timelapse: false })).toEqual([0, 1, 2, 4, 8]);
  }, 120_000);
});
