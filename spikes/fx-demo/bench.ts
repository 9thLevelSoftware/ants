// Acceptance 3 in the browser: the scent view with 100,000 active cells (the player colony's trail and home layers
// at their caps, deposited on the open ground of a large flat test world), CPU ms of the fx renderer per frame and
// the frame's draw calls. A stress fixture: it writes pheromone into the demo's own sim.
import type { FxRenderer } from '@/render/fx/overlays/FxRenderer';
import type { Vec3 } from '@/core';
import type { Sim } from '@/sim/types';

export interface BenchResult {
  cells: number;
  drawn: number;
  framesToConverge: number;
  fxMs: { min: number; median: number; p95: number; max: number };
  renderMs: { min: number; median: number };
  drawCalls: number;
  fxDrawCalls: number;
}

/** Deposits `trail` + `home` cells at ground level in square blocks starting at (x0, z0), mm. */
export function fillScent(sim: Sim, x0: number, z0: number, trail = 40_000, home = 60_000): number {
  const col = sim.state.colonies.find((c) => c.isPlayer)!;
  const cell = sim.state.phero.cell;
  const p = { x: 0, y: cell / 2, z: 0 };
  const side = Math.ceil(Math.sqrt(trail + home));
  let n = 0;
  for (let k = 0; k < side && n < trail + home; k++) for (let i = 0; i < side && n < trail + home; i++) {
    p.x = x0 + (i + 0.5) * cell; p.z = z0 + (k + 0.5) * cell;
    sim.phero.deposit(col.id, n < trail ? 'trail' : 'home', p, n < trail ? 2 + (i % 9) : 0.5 + (k % 5));
    n++;
  }
  return sim.phero.activeCellCount?.() ?? n;
}

const q = (a: number[], f: number) => a[Math.min(a.length - 1, Math.floor(a.length * f))];

/**
 * `update(dt)` runs the fx renderer alone (CPU, no drawing); `render(dt)` draws a whole frame and returns its ms.
 * The build-up and the CPU timing use update (fast); a few rendered frames give the draw calls and frame time.
 */
export function bench100k(
  fx: FxRenderer, sim: Sim, frames: number, update: (dt: number) => void, render: (dt: number) => number, drawCalls: () => number,
  setCamera: (p: Vec3, l: Vec3) => void,
): BenchResult {
  const cell = sim.state.phero.cell;
  const side = Math.ceil(Math.sqrt(100_000)) * cell;
  const x0 = sim.world.size / 2 - side / 2, z0 = x0;
  const cells = fillScent(sim, x0, z0);
  fx.setOverlay('scent', true);
  setCamera({ x: x0 + side * 0.5, y: side * 0.55, z: z0 + side * 1.15 }, { x: x0 + side * 0.5, y: 0, z: z0 + side * 0.45 });
  // build-up: frames until every cell is drawn (the budgets spread the first projection over frames)
  let conv = 0;
  for (; conv < 1000; conv++) {
    update(1 / 60);
    const s = fx.stats();
    if (s.scentCells >= cells && s.scentPending === 0) break;
  }
  const fxMs: number[] = [];
  for (let i = 0; i < frames; i++) {
    sim.tick(); // the field decays every tick: values change, layers are rescanned within the chunk budget
    update(1 / 60);
    fxMs.push(fx.stats().ms);
  }
  const renderMs: number[] = [];
  for (let i = 0; i < 3; i++) { sim.tick(); renderMs.push(render(1 / 60)); }
  fxMs.sort((a, b) => a - b);
  renderMs.sort((a, b) => a - b);
  const s = fx.stats();
  return {
    cells, drawn: s.scentCells, framesToConverge: conv + 1,
    fxMs: { min: fxMs[0], median: q(fxMs, 0.5), p95: q(fxMs, 0.95), max: fxMs[fxMs.length - 1] },
    renderMs: { min: renderMs[0], median: q(renderMs, 0.5) },
    drawCalls: drawCalls(), fxDrawCalls: s.drawCalls,
  };
}
