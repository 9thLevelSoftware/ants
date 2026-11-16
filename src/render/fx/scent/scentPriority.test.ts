// A full cache keeps the most important cells (player trail > food > alarm > player home > rivals; stronger within
// a rank), and the chevrons follow the distance along the trail from the entrance, also on budgeted frames and
// across a gap in the trail.
import { describe, expect, it } from 'vitest';
import { createPheromoneField } from '@/sim/pheromones';
import type { PheroChannel, PheromoneState } from '@/sim/types';
import { PHERO_SHARED_COLONY } from '@/sim/balance';
import { ScentCache, type CellLayerSpec, type RefreshBudget } from './ScentCache';
import { flatSnapper } from './testkit';
import { FULL_PH, RIVAL_FLAG, SCENT_BUDGET, STYLE } from './tuning';

const CELL = 16;
const ALL: RefreshBudget = { chunks: Infinity, visits: Infinity, minRefreshS: 0 };
const origin = { x: 0, y: 0, z: 0 };

function spec(colony: number, channel: PheroChannel, rival = false): CellLayerSpec {
  const base = channel === 'trail' ? STYLE.trail : channel === 'home' ? STYLE.home : STYLE.alarm;
  const key = colony === PHERO_SHARED_COLONY ? 'alarm' : `${colony}:${channel}`;
  return { kind: 'cells', key, colony, channel, style: base + (rival ? RIVAL_FLAG : 0), fullPh: FULL_PH[channel], origins: [origin] };
}

function field() {
  const data: PheromoneState = { cell: CELL, chunkCells: 16, layers: [], lastDecayTick: 0 };
  const f = createPheromoneField(data);
  const p = { x: 0, y: CELL / 2, z: 0 };
  const put = (colony: number, ch: PheroChannel, i: number, k: number, v: number) => {
    p.x = (i + 0.5) * CELL; p.z = (k + 0.5) * CELL;
    f.deposit(colony, ch, p, v);
  };
  return { data, f, put };
}

function frame(c: ScentCache, f: ReturnType<typeof field>, now: number): void {
  c.refresh(f.f, f.data, ALL, now);
  c.processSnaps(flatSnapper(), Infinity);
  c.processAxes(Infinity);
  c.ease(0, Infinity);
}

function liveByStyle(c: ScentCache): Record<number, number> {
  const out: Record<number, number> = {};
  c.forEachLive((_s, _x, _y, _z, v, style) => { if (v > 0) out[style] = (out[style] ?? 0) + 1; });
  return out;
}

describe('scent cache priority under a full cache', () => {
  it('evicts rival home first, then player home; the player trail and the alarm keep their slots', () => {
    const fx = field();
    for (let i = 0; i < 30; i++) {
      fx.put(1, 'home', i, 20, 3); // rival home range (rank 1)
      fx.put(0, 'home', i, 10, 3); // player home range (rank 3)
    }
    const c = new ScentCache(60, CELL);
    c.converge = true;
    c.setLayers([spec(1, 'home', true), spec(0, 'home'), spec(0, 'trail'), spec(PHERO_SHARED_COLONY, 'alarm')]);
    frame(c, fx, 0);
    expect(liveByStyle(c)).toEqual({ [STYLE.home]: 30, [STYLE.home + RIVAL_FLAG]: 30 });
    // 20 trail and 20 alarm cells arrive: 40 slots needed, all taken from the 30 rival home cells first
    for (let i = 0; i < 20; i++) { fx.put(0, 'trail', i, 0, 10); fx.put(PHERO_SHARED_COLONY, 'alarm', i, 30, 3); }
    frame(c, fx, 1);
    frame(c, fx, 2);
    const live = liveByStyle(c);
    expect(live[STYLE.trail]).toBe(20);
    expect(live[STYLE.alarm]).toBe(20);
    expect(live[STYLE.home]).toBe(20);
    expect(live[STYLE.home + RIVAL_FLAG] ?? 0).toBe(0);
    const st = c.stats();
    expect(st.dropped).toBe(0);
    expect(st.evicted).toBe(40);
  });

  it('within one layer a strong new cell replaces a clearly weaker one, never an equal one', () => {
    const fx = field();
    for (let i = 0; i < 10; i++) fx.put(0, 'trail', i, 0, 0.5); // faint
    const c = new ScentCache(10, CELL);
    c.converge = true;
    c.setLayers([spec(0, 'trail')]);
    frame(c, fx, 0);
    for (let i = 0; i < 4; i++) fx.put(0, 'trail', i, 5, 20); // strong
    frame(c, fx, 1);
    frame(c, fx, 2);
    let strong = 0;
    c.forEachLive((_s, _x, _y, z, v) => { if (Math.floor(z / CELL) === 5 && v > 0.9) strong++; });
    expect(strong).toBe(4);
    expect(c.stats().live).toBe(10);
  });

  it('a budgeted victim search refuses (dropped) rather than stalling, and recovers on later frames', () => {
    const fx = field();
    for (let n = 0; n < 400; n++) fx.put(0, 'home', n % 20, 10 + Math.floor(n / 20), 0.3);
    const c = new ScentCache(400, CELL);
    c.setLayers([spec(0, 'home'), spec(0, 'trail')]);
    const b = { ...ALL, evictScan: 50 };
    for (let r = 0; r < 3; r++) { c.refresh(fx.f, fx.data, b, r); c.processSnaps(flatSnapper(), Infinity); c.ease(1, Infinity); }
    for (let i = 0; i < 20; i++) fx.put(0, 'trail', i, 0, 10);
    for (let r = 3; r < 20; r++) { c.refresh(fx.f, fx.data, b, r); c.processSnaps(flatSnapper(), Infinity); c.ease(1, Infinity); }
    expect(liveByStyle(c)[STYLE.trail]).toBe(20);
  });
});

describe('chevron direction along the trail', () => {
  /** Out 20 cells along +x, 6 along +z, back along -x to i = 2 (the food), entrance at the origin. */
  function detour(fx: ReturnType<typeof field>, gapAt = -1) {
    for (let i = 0; i <= 20; i++) fx.put(0, 'trail', i, 0, 10);
    for (let k = 1; k <= 6; k++) fx.put(0, 'trail', 20, k, 10);
    for (let i = 19; i >= 2; i--) if (i !== gapAt && i !== gapAt + 1) fx.put(0, 'trail', i, 6, 10);
  }

  function wrongOnReturnLeg(c: ScentCache, from = 4, to = 17): { back: number; wrong: number } {
    let back = 0, wrong = 0;
    c.forEachLive((s, x, _y, z) => {
      const i = Math.floor(x / CELL), k = Math.floor(z / CELL);
      if (k !== 6 || i < from || i > to) return;
      back++;
      if (c.axis[s * 3] > 0) wrong++;
    });
    return { back, wrong };
  }

  it('converges on budgeted frames (high preset) to point towards the food on the return leg', () => {
    const fx = field();
    detour(fx);
    const b = SCENT_BUDGET.high;
    const c = new ScentCache(1000, CELL);
    c.setLayers([spec(0, 'trail')]);
    const budget = { chunks: b.chunksPerFrame, visits: b.visitsPerFrame, minRefreshS: b.minRefreshS, evictScan: b.evictScanPerFrame };
    for (let i = 0; i < 30; i++) {
      c.refresh(fx.f, fx.data, budget, i / 60);
      c.processSnaps(flatSnapper(), b.snapsPerFrame);
      c.processAxes(b.axesPerFrame, b.axesSweepPerFrame, b.geoPerFrame);
      c.ease(1 / 60, 3);
    }
    const r = wrongOnReturnLeg(c);
    expect(r.back).toBeGreaterThan(10);
    expect(r.wrong).toBe(0);
  });

  it('a part beyond a gap is measured from its end nearest the entrance', () => {
    // gap at i = 10..11 on the return leg: the far part (i = 2..9) is not connected to the entrance; its end
    // nearest the entrance is i = 2, so its chevrons point +x there. That part is the honest best guess; the
    // connected part (i = 12..19) still points -x, towards the food.
    const fx = field();
    detour(fx, 10);
    const c = new ScentCache(1000, CELL);
    c.converge = true;
    c.setLayers([spec(0, 'trail')]);
    frame(c, fx, 0);
    const near = wrongOnReturnLeg(c, 13, 18);
    expect(near.back).toBeGreaterThan(4);
    expect(near.wrong).toBe(0);
    let farPlus = 0, far = 0;
    c.forEachLive((s, x, _y, z) => {
      const i = Math.floor(x / CELL), k = Math.floor(z / CELL);
      if (k !== 6 || i < 3 || i > 8) return;
      far++;
      if (c.axis[s * 3] > 0) farPlus++;
    });
    expect(far).toBeGreaterThan(4);
    expect(farPlus).toBe(far);
  });
});
