// Reviewer tests (scent-fx review): try to break the scent cache. Some of these FAIL on purpose: each one
// demonstrates a defect that stays for the fixer (see the review report). The production path (ScentView) always
// passes the persisted chunks (sim.state.phero), so most tests use a real pheromone field.
import { describe, expect, it } from 'vitest';
import { createPheromoneField } from '@/sim/pheromones';
import type { PheroChannel, PheromoneState } from '@/sim/types';
import { PHERO_SHARED_COLONY } from '@/sim/balance';
import { fxScenario, runTicks } from '../../../../spikes/fx-demo/scenario';
import { ScentCache, type CellLayerSpec, type LayerSpec, type RefreshBudget } from './ScentCache';
import { FakeCells, flatSnapper } from './testkit';
import { fieldSnapper, FOOD_LAYER_KEY, scentLayers } from './layers';
import { FULL_PH, RIVAL_FLAG, SCENT_BUDGET, STYLE } from './tuning';

const CELL = 16;
const ALL: RefreshBudget = { chunks: Infinity, visits: Infinity, minRefreshS: 0 };
const origin = { x: 0, y: 0, z: 0 };

function spec(colony: number, channel: PheroChannel, rival = false): CellLayerSpec {
  const base = channel === 'trail' ? STYLE.trail : channel === 'home' ? STYLE.home : STYLE.alarm;
  const key = colony === PHERO_SHARED_COLONY ? 'alarm' : `${colony}:${channel}`;
  return { kind: 'cells', key, colony, channel, style: base + (rival ? RIVAL_FLAG : 0), fullPh: FULL_PH[channel], origins: [origin] };
}

function realField() {
  const data: PheromoneState = { cell: CELL, chunkCells: 16, layers: [], lastDecayTick: 0 };
  const f = createPheromoneField(data);
  const p = { x: 0, y: CELL / 2, z: 0 };
  const put = (colony: number, ch: PheroChannel, i: number, k: number, v: number) => {
    p.x = (i + 0.5) * CELL; p.z = (k + 0.5) * CELL;
    f.deposit(colony, ch, p, v);
  };
  return { data, f, put };
}

function frame(c: ScentCache, src: Parameters<ScentCache['refresh']>[0], data: PheromoneState | null, now: number, budget = ALL): void {
  c.refresh(src, data, budget, now);
  c.processSnaps(flatSnapper(), Infinity);
  c.processAxes(Infinity);
  c.ease(0, Infinity);
}

function liveByStyle(c: ScentCache): Record<number, number> {
  const out: Record<number, number> = {};
  c.forEachLive((_s, _x, _y, _z, v, style) => { if (v > 0) out[style] = (out[style] ?? 0) + 1; });
  return out;
}

describe('scent cache (review)', () => {
  it('converge mode (test preset) draws EVERY layer: player and rival trail + home, alarm', () => {
    // the layer list of a game with one rival colony (layers.ts order): 0:trail 0:home 1:trail 1:home alarm food
    const { data, f, put } = realField();
    for (let i = 0; i < 10; i++) {
      put(0, 'trail', i, 0, 10);
      put(0, 'home', i, 3, 2);
      put(1, 'trail', i, 6, 10);
      put(1, 'home', i, 9, 2);
      put(PHERO_SHARED_COLONY, 'alarm', i, 12, 3);
    }
    const specs: LayerSpec[] = [spec(0, 'trail'), spec(0, 'home'), spec(1, 'trail', true), spec(1, 'home', true), spec(PHERO_SHARED_COLONY, 'alarm'), { kind: 'points', key: FOOD_LAYER_KEY, style: STYLE.food }];
    const c = new ScentCache(1000, CELL);
    c.converge = true;
    c.setLayers(specs);
    frame(c, f, data, 0);
    const live = liveByStyle(c);
    // DEFECT (ScentCache.refreshChunks / refreshIterate): the loop index k is added to a cursor that the loop itself
    // advances, so layers are skipped; here the player's home range, the rival home and the alarm never appear.
    expect(live[STYLE.trail]).toBe(10);
    expect(live[STYLE.home]).toBe(10);
    expect(live[STYLE.trail + RIVAL_FLAG]).toBe(10);
    expect(live[STYLE.home + RIVAL_FLAG]).toBe(10);
    expect(live[STYLE.alarm]).toBe(10);
  });

  it('high budget, 120 frames of 1/60 s: every layer of a one-rival game appears', () => {
    const { data, f, put } = realField();
    for (let i = 0; i < 10; i++) {
      put(0, 'trail', i, 0, 10);
      put(0, 'home', i, 3, 2);
      put(1, 'trail', i, 6, 10);
      put(1, 'home', i, 9, 2);
      put(PHERO_SHARED_COLONY, 'alarm', i, 12, 3);
    }
    const specs: LayerSpec[] = [spec(0, 'trail'), spec(0, 'home'), spec(1, 'trail', true), spec(1, 'home', true), spec(PHERO_SHARED_COLONY, 'alarm'), { kind: 'points', key: FOOD_LAYER_KEY, style: STYLE.food }];
    const b = SCENT_BUDGET.high;
    const c = new ScentCache(b.maxCells, CELL);
    c.setLayers(specs);
    for (let i = 0; i < 120; i++) frame(c, f, data, i / 60, { chunks: b.chunksPerFrame, visits: b.visitsPerFrame, minRefreshS: b.minRefreshS });
    const live = liveByStyle(c);
    console.log(`\n[scent verify] high budget, 6 layers, after 2 s: ${JSON.stringify(live)}\n`);
    for (const st of [STYLE.trail, STYLE.home, STYLE.trail + RIVAL_FLAG, STYLE.home + RIVAL_FLAG, STYLE.alarm]) expect(live[st], `style ${st}`).toBe(10);
  });

  it('iteration path: two layers refreshed in one call both appear', () => {
    const src = new FakeCells();
    src.set(0, 'trail', [CELL / 2, CELL / 2, CELL / 2, 10]);
    src.set(0, 'home', [CELL / 2, CELL / 2, 5.5 * CELL, 2]);
    const c = new ScentCache(100, CELL);
    c.converge = true;
    c.setLayers([spec(0, 'trail'), spec(0, 'home')]);
    frame(c, src, null, 0);
    const live = liveByStyle(c);
    expect(live[STYLE.trail]).toBe(1);
    expect(live[STYLE.home]).toBe(1); // DEFECT: same cursor bug, the second layer is never visited
  });

  it('a full cache still shows a NEW strong trail (it must not lose to old faint home stipple)', () => {
    // capacity stands in for the low / medium presets (40k / 80k slots vs 40k trail + 60k home cells per colony)
    const cap = 200;
    const { data, f, put } = realField();
    for (let n = 0; n < cap; n++) put(0, 'home', n % 20, 40 + Math.floor(n / 20), 0.15); // mature, faint home range
    const c = new ScentCache(cap, CELL);
    c.converge = true;
    c.setLayers([spec(0, 'home'), spec(0, 'trail')]); // home first so the setup is not hit by the cursor defect
    frame(c, f, data, 0);
    expect(liveByStyle(c)[STYLE.home]).toBe(cap);
    // foragers find food and lay a saturated trail
    for (let i = 0; i < 20; i++) put(0, 'trail', i, 0, 30);
    for (let r = 1; r <= 3; r++) frame(c, f, data, r);
    // DEFECT: slots are first come, first served for ever; the most important channel is dropped (stats.dropped)
    expect(c.stats().dropped).toBe(0);
    expect(liveByStyle(c)[STYLE.trail] ?? 0).toBe(20);
  });

  it('chevrons point towards the food on a trail that bends back towards the nest (GDD 08 §10.1)', () => {
    // entrance at the origin; the trail runs out 20 cells along +x, 6 along +z, then back along -x to food 2
    // cells from the entrance's x (a detour round an obstacle). On the return leg the food lies at -x.
    const { data, f, put } = realField();
    for (let i = 0; i <= 20; i++) put(0, 'trail', i, 0, 10);
    for (let k = 1; k <= 6; k++) put(0, 'trail', 20, k, 10);
    for (let i = 19; i >= 2; i--) put(0, 'trail', i, 6, 10);
    const c = new ScentCache(1000, CELL);
    c.converge = true;
    c.setLayers([spec(0, 'trail')]);
    frame(c, f, data, 0);
    let back = 0, wrong = 0;
    c.forEachLive((s, x, _y, z) => {
      const i = Math.floor(x / CELL), k = Math.floor(z / CELL);
      if (k !== 6 || i < 4 || i > 17) return; // interior of the return leg
      back++;
      if (c.axis[s * 3] > 0) wrong++; // +x points away from the food
    });
    expect(back).toBeGreaterThan(10);
    // DEFECT: the direction is "away from the nearest entrance", so the whole return leg points away from the food
    expect(wrong).toBe(0);
  });

  it('toggling the view many times leaks no slots or layer records', () => {
    const { data, f, put } = realField();
    for (let i = 0; i < 50; i++) put(0, 'trail', i, 0, 10);
    const c = new ScentCache(500, CELL);
    const idle = { chunks: 0, visits: 0, minRefreshS: Infinity };
    for (let r = 0; r < 20; r++) {
      c.setLayers([spec(0, 'trail')]);
      frame(c, f, data, r * 2);
      c.clearLayers();
      c.refresh(f, null, idle, r * 2 + 1);
      c.ease(10, 3);
      c.refresh(f, null, idle, r * 2 + 1.5);
    }
    expect(c.stats().slots).toBe(0);
    expect(c.stats().layers).toBe(0);
  });

  it('cost of the real surface projection at the per-frame snap budget (first build on a real trail)', () => {
    const sc = fxScenario(1, 20);
    runTicks(sc.sim, 3000);
    const sim = sc.sim;
    const c = new ScentCache(SCENT_BUDGET.high.maxCells, sim.state.phero.cell);
    c.setLayers(scentLayers(sim));
    c.refresh(sim.phero, sim.state.phero, ALL, 0);
    const pending = c.stats().pending;
    expect(pending).toBeGreaterThan(50);
    const snapper = fieldSnapper(sim);
    const t = performance.now();
    const done = c.processSnaps(snapper, Infinity);
    const ms = performance.now() - t;
    const perSnapUs = (ms * 1000) / Math.max(1, done);
    const atBudgetMs = (perSnapUs * SCENT_BUDGET.high.snapsPerFrame) / 1000;
    console.log(`\n[scent verify] real field.project: ${done} snaps in ${ms.toFixed(2)} ms = ${perSnapUs.toFixed(1)} us/snap; `
      + `high budget (${SCENT_BUDGET.high.snapsPerFrame}/frame) = ${atBudgetMs.toFixed(2)} ms/frame\n`);
    expect(done).toBe(pending);
  }, 60_000);
});
