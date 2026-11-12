// Reviewer tests (F3b): try to break the tick accumulator, the driver's pause / freeze / step-down behaviour and
// the GDD 01 §8 possession rules on the real sim.
import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import { MAX_CATCHUP_TICKS, MAX_TICKS_PER_FRAME } from '../config/loop';
import { SimDriver } from './simDriver';
import { TickClock } from './tickClock';

/** Deterministic pseudo-random frame lengths (no Math.random in tests either). */
function frames(n: number, seed = 7): number[] {
  let s = seed >>> 0;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out.push(0.004 + (s / 2 ** 32) * 0.04); // 4..44 ms
  }
  return out;
}

describe('TickClock (reviewer)', () => {
  it('no drift: over many uneven frames the ticks run equal real time x speed / 0.1 s', () => {
    for (const speed of [1, 2, 4, 8]) {
      const c = new TickClock();
      let ran = 0, real = 0;
      for (const dt of frames(5000, speed)) {
        real += dt;
        c.accumulate(dt, speed);
        ran += c.run(() => {}, () => 0).ran;
        expect(c.acc).toBeGreaterThanOrEqual(0);
        expect(c.acc).toBeLessThanOrEqual(MAX_CATCHUP_TICKS + 1);
        expect(c.alpha).toBeGreaterThanOrEqual(0);
        expect(c.alpha).toBeLessThanOrEqual(1);
      }
      expect(Math.abs(ran + c.acc - (real * speed) / 0.1)).toBeLessThan(1e-6 * real * speed * 10 + 1e-6);
    }
  });

  it('never runs more than MAX_TICKS_PER_FRAME ticks, even with a huge backlog', () => {
    const c = new TickClock();
    for (let i = 0; i < 10; i++) c.accumulate(0.1, 8);
    expect(c.run(() => {}, () => 0).ran).toBeLessThanOrEqual(MAX_TICKS_PER_FRAME);
  });
});

describe('SimDriver (reviewer)', () => {
  const rt = (frozen = false, now: (() => number) | null = () => 0) => ({ frozen, realtime: true, now });

  it('GDD 01 §8: possessing while paused stays paused (no tick runs)', () => {
    const d = new SimDriver(makeTestSim());
    d.enqueue({ type: 'setSpeed', speed: 4 });
    d.enqueue({ type: 'setSpeed', speed: 0 });
    d.applyCommandsNow();
    d.enqueue({ type: 'possess', role: 'queen', dropTo1x: true });
    d.applyCommandsNow();
    expect(d.sim.state.player.possessedAntId).toBeGreaterThanOrEqual(0);
    expect(d.paused).toBe(true);
    for (let i = 0; i < 30; i++) d.frame(1 / 30, rt());
    expect(d.sim.state.tick).toBe(0);
  });

  it('GDD 06 §4.4: at 8x with a sim that manages ~2x, the speed steps down one notch after grace + 3 s', () => {
    const d = new SimDriver(makeTestSim());
    d.enqueue({ type: 'setSpeed', speed: 8 });
    d.applyCommandsNow();
    let t = 0;
    const now = () => (t += 6); // every clock read costs 6 ms: the 10 ms budget allows 2 ticks per frame
    let steppedAt = -1, to = 0;
    for (let i = 0; i < 200 && steppedAt < 0; i++) {
      const f = d.frame(0.1, rt(false, now));
      if (f.steppedDownTo !== null) { steppedAt = i * 0.1; to = f.steppedDownTo; }
    }
    expect(to).toBe(4);
    expect(steppedAt).toBeGreaterThan(9.9);
    d.frame(0.1, rt(false, now)); // the next tick applies the queued setSpeed
    expect(d.speed).toBe(4);
  });

  it('a freeze (photo mode) never counts towards the step-down', () => {
    const d = new SimDriver(makeTestSim());
    d.enqueue({ type: 'setSpeed', speed: 8 });
    d.applyCommandsNow();
    for (let i = 0; i < 400; i++) expect(d.frame(0.1, rt(true)).steppedDownTo).toBeNull();
    expect(d.speed).toBe(8);
  });

  it('pausing does not move the drawn pose backwards: alpha while paused is not below the alpha before', () => {
    // Renderers draw prev + (cur - prev) * alpha. Resetting the accumulator on pause drops alpha to 0, so every ant
    // (and the camera subject) jumps back to its previous-tick pose for as long as the game is paused.
    const d = new SimDriver(makeTestSim());
    d.frame(0.1, rt());
    const before = d.frame(0.07, rt()).alpha;
    expect(before).toBeGreaterThan(0.5);
    d.enqueue({ type: 'setSpeed', speed: 0 });
    d.applyCommandsNow();
    const paused = d.frame(1 / 60, rt()).alpha;
    expect(paused).toBeGreaterThanOrEqual(before);
  });

  it('step() ignores pause and freeze, never runs a fraction, and NaN / negative run nothing', () => {
    const d = new SimDriver(makeTestSim());
    d.enqueue({ type: 'setSpeed', speed: 0 });
    d.applyCommandsNow();
    expect(d.step(2.9)).toBe(2);
    expect(d.step(-3)).toBe(0);
    expect(d.sim.state.tick).toBe(2);
  });
});
