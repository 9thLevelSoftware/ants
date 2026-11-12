import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import { stateHash } from '@/sim/save/hash';
import { SimDriver } from './simDriver';

const realtime = (frozen = false) => ({ frozen, realtime: true, now: () => 0 });

describe('SimDriver: real time -> ticks, pause, freezes, time-scale rules on the real sim', () => {
  it('runs 10 ticks per real second at 1x and 80 at 8x', () => {
    const d = new SimDriver(makeTestSim());
    for (let i = 0; i < 61; i++) d.frame(1 / 60, realtime()); // 61 frames: float rounding may owe the 10th tick one frame late
    expect(d.sim.state.tick).toBe(10);
    d.enqueue({ type: 'setSpeed', speed: 8 });
    d.applyCommandsNow();
    for (let i = 0; i < 60; i++) d.frame(1 / 60, realtime());
    expect(d.sim.state.tick).toBeGreaterThanOrEqual(89);
    expect(d.sim.state.tick).toBeLessThanOrEqual(91);
  });

  it('pause stops ticks but applies commands at once (zero time, GDD 06 §4.7)', () => {
    const d = new SimDriver(makeTestSim());
    d.enqueue({ type: 'setSpeed', speed: 0 });
    d.applyCommandsNow();
    expect(d.paused).toBe(true);
    expect(d.level).toBe(0);
    d.enqueue({ type: 'setSpeed', speed: 4 }); // applied by the next frame although no tick runs
    d.frame(1 / 60, { ...realtime(), frozen: true });
    expect(d.sim.state.tick).toBe(0);
    expect(d.level).toBe(4);
  });

  it('a freeze (photo mode / pause menu) stops time and keeps the speed', () => {
    const d = new SimDriver(makeTestSim());
    d.enqueue({ type: 'setSpeed', speed: 4 });
    d.applyCommandsNow();
    for (let i = 0; i < 300; i++) d.frame(1 / 60, realtime(true));
    expect(d.sim.state.tick).toBe(0);
    expect(d.speed).toBe(4);
    d.frame(0.1, realtime());
    expect(d.sim.state.tick).toBe(4);
  });

  it('possession at 8x drops to 1x and 8x is then refused (GDD 01 §8, E1/E2)', () => {
    const d = new SimDriver(makeTestSim());
    d.enqueue({ type: 'setSpeed', speed: 8 });
    d.applyCommandsNow();
    const queenId = d.sim.state.colonies[0].queenId;
    d.enqueue({ type: 'possess', antId: queenId, dropTo1x: true });
    d.applyCommandsNow();
    expect(d.sim.state.player.possessedAntId).toBe(queenId);
    expect(d.speed).toBe(1);
    const refused: string[] = [];
    d.sim.events.on('speed-refused', (e) => refused.push(e.reason));
    d.enqueue({ type: 'setSpeed', speed: 8 });
    d.applyCommandsNow();
    expect(d.speed).toBe(1);
    expect(refused).toEqual(['possession']);
    d.enqueue({ type: 'setSpeed', speed: 4 });
    d.applyCommandsNow();
    expect(d.speed).toBe(4);
  });

  it('with dropTo1xOnPossess off, possession clamps 8x to 4x', () => {
    const d = new SimDriver(makeTestSim());
    d.enqueue({ type: 'setSpeed', speed: 8 });
    d.enqueue({ type: 'possess', role: 'queen', dropTo1x: false });
    d.applyCommandsNow();
    expect(d.speed).toBe(4);
  });

  it('manual clock (test mode): frames never tick; step(n) runs exactly n ticks even while paused', () => {
    const d = new SimDriver(makeTestSim());
    for (let i = 0; i < 100; i++) d.frame(1 / 60, { frozen: false, realtime: false, now: null });
    expect(d.sim.state.tick).toBe(0);
    d.enqueue({ type: 'setSpeed', speed: 0 });
    d.applyCommandsNow();
    expect(d.step(25)).toBe(25);
    expect(d.sim.state.tick).toBe(25);
  });

  it('stepping is deterministic: same seed and commands give the same state hash', () => {
    const run = () => {
      const d = new SimDriver(makeTestSim({ seed: 3 }));
      d.enqueue({ type: 'possess', role: 'queen' });
      d.step(1);
      d.sim.setPlayerIntent({ dir: { x: 1, y: 0, z: 0 }, hurry: false, grip: false, held: [], flight: null });
      d.step(120);
      return stateHash(d.sim.state);
    };
    expect(run()).toBe(run());
  });

  it('measures simulation time per tick (warm-up tick does not dominate)', () => {
    const d = new SimDriver(makeTestSim());
    let t = 0, calls = 0;
    // the timer is read before and after each tick: the first tick "costs" 50 ms, the others 1 ms
    d.timer = () => { calls++; if (calls % 2 === 0) t += calls === 2 ? 50 : 1; return t; };
    d.step(100);
    expect(d.tickMs).toBeGreaterThan(0.9);
    expect(d.tickMs).toBeLessThan(2);
  });

  it('pause and freeze keep the drawn pose (alpha held); a debug step shows the stepped tick (alpha 1)', () => {
    const d = new SimDriver(makeTestSim());
    d.frame(0.1, realtime());
    const before = d.frame(0.05, realtime()).alpha;
    expect(before).toBeGreaterThan(0.4);
    expect(d.frame(1 / 60, realtime(true)).alpha).toBeCloseTo(before, 9); // photo mode / pause menu
    d.enqueue({ type: 'setSpeed', speed: 0 });
    d.applyCommandsNow();
    for (let i = 0; i < 30; i++) expect(d.frame(1 / 60, realtime()).alpha).toBeCloseTo(before, 9);
    d.step(3);
    expect(d.clock.alpha).toBe(1);
    expect(d.frame(1 / 60, realtime()).alpha).toBe(1); // still paused: stays on the stepped tick
  });

  it('resuming after a pause neither catches up nor skips: ticks continue from the held fraction', () => {
    const d = new SimDriver(makeTestSim());
    d.frame(0.1, realtime());
    d.frame(0.05, realtime());
    const t0 = d.sim.state.tick;
    d.enqueue({ type: 'setSpeed', speed: 0 });
    d.applyCommandsNow();
    for (let i = 0; i < 120; i++) d.frame(1 / 30, realtime()); // 4 s paused
    d.enqueue({ type: 'setSpeed', speed: 1 });
    d.applyCommandsNow();
    d.frame(0.05, realtime()); // the held 0.5 tick + 0.5 = one tick
    expect(d.sim.state.tick).toBe(t0 + 1);
  });

  it('advancedS is the game time that really passed: less than dt x speed when the tick budget limits the sim', () => {
    const d = new SimDriver(makeTestSim());
    d.enqueue({ type: 'setSpeed', speed: 4 });
    d.applyCommandsNow();
    let t = 0;
    const slow = { frozen: false, realtime: true, now: () => (t += 6) }; // 2 ticks per frame fit the 10 ms budget
    let advanced = 0, ticks = 0;
    for (let i = 0; i < 100; i++) { const f = d.frame(0.1, slow); advanced += f.advancedS; ticks += f.ran; }
    expect(ticks).toBeLessThan(100 * 4); // 4x needs 4 ticks per 0.1 s frame
    expect(Math.abs(advanced - ticks * 0.1)).toBeLessThan(0.11); // matches the ticks run (within one tick)
    const free = new SimDriver(makeTestSim());
    let adv1 = 0;
    for (let i = 0; i < 60; i++) adv1 += free.frame(1 / 60, realtime()).advancedS;
    expect(adv1).toBeCloseTo(1, 1); // unconstrained 1x: one game second per real second
  });

  it('GDD 06 §4.4: dropped ticks and step-downs emit time.speed-limited, at most once per second', () => {
    const d = new SimDriver(makeTestSim());
    d.enqueue({ type: 'setSpeed', speed: 8 });
    d.applyCommandsNow();
    const got: { requested: number; droppedTicks: number }[] = [];
    d.sim.events.on('time.speed-limited', (e) => got.push({ requested: e.requested, droppedTicks: e.droppedTicks }));
    let t = 0;
    const slow = { frozen: false, realtime: true, now: () => (t += 6) };
    let dropped = 0;
    for (let i = 0; i < 20; i++) dropped += d.frame(0.1, slow).dropped; // 2 s
    expect(dropped).toBeGreaterThan(0);
    expect(got.length).toBeGreaterThanOrEqual(1);
    expect(got.length).toBeLessThanOrEqual(3);
    expect(got.reduce((n, e) => n + e.droppedTicks, 0)).toBeLessThanOrEqual(dropped);
    expect(got[0].requested).toBe(8);
    let stepDowns = 0;
    for (let i = 0; i < 200; i++) { // through the grace: every step-down also reports in its own frame
      const n = got.length;
      if (d.frame(0.1, slow).steppedDownTo !== null) { stepDowns++; expect(got.length).toBe(n + 1); }
    }
    expect(stepDowns).toBeGreaterThan(0);
    expect(d.speed).toBeLessThan(8);
  });

});
