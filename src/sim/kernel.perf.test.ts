// Kernel performance and allocation checks (acceptance criterion 7 of docs/design/tasks/F2-kernel.md).
// Timings are best-of-N to be robust against other processes on the machine; the numbers are logged
// (`npx vitest run src/sim/kernel.perf.test.ts`) and recorded in docs/design/tdd/02-kernel.md.

import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/math/vec3';
import { rngRange, rngSeed } from '@/core/rng';
import { createKernel, type Kernel } from './kernel';
import { carveTestNest, emptyCarve, makeSceneWorld, TEST_BU } from './kernel.testWorld';
import { keyCx, keyCy, keyCz } from './nest/carve/keys';
import { meshChunk } from './nest/carve/mc';
import { createNestNav } from './nest/nav/nestNav';
import { createWalkerKin, walkerPlace, walkerStep, type WalkerKin } from './locomotion/walker';

const BU = TEST_BU;
const CRUISE = 6 * BU;
const TICK = 0.1;
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const now = () => performance.now();

function bestOf(runs: number, fn: () => number): number {
  let best = Infinity;
  for (let r = 0; r < runs; r++) best = Math.min(best, fn());
  return best;
}

function sceneKernel(): { k: Kernel; slabBottom: number } {
  const s = makeSceneWorld(7);
  const k = createKernel(s.world, emptyCarve(BU));
  carveTestNest(k, s.nest);
  const slab = s.world.prims.find((p) => p.id === s.ids.slab)!;
  const slabBottom = slab.pos.y - slab.size.y;
  // a tunnel whose ceiling is the slab: soil, carve and a hard primitive in every evaluation
  k.carveCapsule(v(380, slabBottom - 3.5, 470), v(620, slabBottom - 3.5, 470), BU, { force: true });
  return { k, slabBottom };
}

/** Walks back and forth along x between x0 and x1 (heading flips at the ends); returns us per walkerStep. */
function timeWalker(k: Kernel, w: WalkerKin, x0: number, x1: number, n: number, dt: number): number {
  const t0 = now();
  for (let i = 0; i < n; i++) {
    if (w.pos.x > x1 && w.fwd.x > 0) { w.fwd.x = -w.fwd.x; w.fwd.z = -w.fwd.z; w.fwd.y = -w.fwd.y; }
    else if (w.pos.x < x0 && w.fwd.x < 0) { w.fwd.x = -w.fwd.x; w.fwd.z = -w.fwd.z; w.fwd.y = -w.fwd.y; }
    walkerStep(k.field, w, null, CRUISE, dt);
  }
  return ((now() - t0) * 1000) / n;
}

const results: Record<string, number | string> = {};

/**
 * Budgets are the acceptance criteria. When the whole suite runs in parallel on a shared 4-core machine timings
 * can double, so by default the assertions allow 2x; FOUNDRESS_PERF_STRICT=1 checks the exact budgets
 * (`FOUNDRESS_PERF_STRICT=1 npx vitest run src/sim/kernel.perf.test.ts`).
 */
const env = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const SLACK = env.FOUNDRESS_PERF_STRICT === '1' ? 1 : 2;
const LONG = 120_000;

/** A full-GC function in Node (enables --expose-gc at runtime), or null elsewhere. */
async function nodeGc(): Promise<(() => void) | null> {
  try {
    const v8Name = 'node:v8', vmName = 'node:vm';
    const v8 = await import(/* @vite-ignore */ v8Name);
    const vm = await import(/* @vite-ignore */ vmName);
    v8.setFlagsFromString('--expose_gc');
    const gc = vm.runInNewContext('gc');
    return typeof gc === 'function' ? gc : null;
  } catch {
    return null;
  }
}

describe('kernel performance', () => {
  const { k, slabBottom } = sceneKernel();

  it('walker step: open terrain < 6 us, tunnel < 25 us (one 0.1 s AI tick at cruise speed)', () => {
    const open = createWalkerKin(k.walker.footOffset);
    expect(walkerPlace(k.field, open, v(150, 20, 250), { heading: v(1, 0, 0) })).toBe(true);
    const tun = createWalkerKin(k.walker.footOffset);
    expect(walkerPlace(k.field, tun, v(420, slabBottom - 6, 470), { heading: v(1, 0, 0) })).toBe(true);
    expect(tun.medium).toBe('cavity');
    timeWalker(k, open, 100, 200, 5000, TICK); // warm-up (JIT)
    timeWalker(k, tun, 400, 600, 5000, TICK);
    const openUs = bestOf(5, () => timeWalker(k, open, 100, 200, 20000, TICK));
    const tunUs = bestOf(5, () => timeWalker(k, tun, 400, 600, 20000, TICK));
    const openFrameUs = bestOf(3, () => timeWalker(k, open, 100, 200, 20000, 1 / 60));
    const tunFrameUs = bestOf(3, () => timeWalker(k, tun, 400, 600, 20000, 1 / 60));
    expect(tun.medium).toBe('cavity');
    expect(Math.abs(k.field.sample(tun.pos) - tun.footOffset)).toBeLessThan(0.05);
    results.walkerOpenTickUs = +openUs.toFixed(2);
    results.walkerTunnelTickUs = +tunUs.toFixed(2);
    results.walkerOpenFrameUs = +openFrameUs.toFixed(2);
    results.walkerTunnelFrameUs = +tunFrameUs.toFixed(2);
    expect(openUs).toBeLessThan(6 * SLACK);
    expect(tunUs).toBeLessThan(25 * SLACK);
  }, LONG);

  it('field evaluation cost', () => {
    let acc = 0;
    const evalNs = (x: number, y: number, z: number) => bestOf(3, () => {
      const t0 = now();
      for (let i = 0; i < 200000; i++) acc += k.field.sampleXYZ(x + (i % 100) * 0.03, y, z);
      return ((now() - t0) * 1e6) / 200000;
    });
    results.fieldOpenNs = +evalNs(150, 0.6, 250).toFixed(1);
    results.fieldTunnelNs = +evalNs(420, slabBottom - 6.9, 470).toFixed(1);
    const g = v(0, 0, 0);
    results.gradientTunnelNs = +bestOf(3, () => {
      const t0 = now();
      for (let i = 0; i < 200000; i++) acc += k.field.gradientXYZ(420 + (i % 100) * 0.03, slabBottom - 6.9, 470, g);
      return ((now() - t0) * 1e6) / 200000;
    }).toFixed(1);
    expect(Number.isFinite(acc)).toBe(true);
  }, LONG);

  it('meshing a busy chunk takes < 3 ms', () => {
    // the busiest chunk of the test nest, and a synthetic sponge chunk
    let busiest = -1, most = 0;
    for (const key of k.meshKeys()) {
      const m = k.meshChunk(key);
      if (m && m.indices.length > most) { most = m.indices.length; busiest = key; }
    }
    const nestMs = bestOf(10, () => { const t0 = now(); k.meshChunk(busiest); return now() - t0; });
    const sponge = createKernel(makeSceneWorld(7).world, emptyCarve(BU));
    const rng = rngSeed(5);
    for (let i = 0; i < 400; i++) sponge.carveSphere(v(rngRange(rng, 2, 30), rngRange(rng, -40, -10), rngRange(rng, 2, 30)), rngRange(rng, 1, 3), { force: true });
    const sk = sponge.meshKeys();
    let sKey = sk[0], sMost = 0;
    for (const key of sk) { const m = sponge.meshChunk(key); if (m && m.indices.length > sMost) { sMost = m.indices.length; sKey = key; } }
    const spongeMs = bestOf(10, () => { const t0 = now(); sponge.meshChunk(sKey); return now() - t0; });
    const plainMs = bestOf(10, () => { const t0 = now(); meshChunk(sponge.carve, keyCx(sKey), keyCy(sKey), keyCz(sKey)); return now() - t0; });
    results.meshNestBusiestMs = +nestMs.toFixed(3);
    results.meshNestBusiestTris = most / 3;
    results.meshSpongeMs = +spongeMs.toFixed(3);
    results.meshSpongeTris = sMost / 3;
    results.meshSpongeNoSubstrateMs = +plainMs.toFixed(3);
    expect(nestMs).toBeLessThan(3 * SLACK);
    expect(spongeMs).toBeLessThan(3 * SLACK);
  }, LONG);

  it('BFS over 100k open voxels takes < 60 ms', () => {
    const big = createKernel(makeSceneWorld(7).world, emptyCarve(BU));
    // a lattice of chambers joined by tunnels, all well below ground
    const cs: Vec3[] = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) for (let l = 0; l < 3; l++) cs.push(v(60 + i * 100, -60 - j * 40, 60 + l * 100));
    for (const c of cs) big.carveEllipsoid(c, v(24, 8, 24), { force: true });
    for (let n = 0; n < cs.length; n++) for (let m = n + 1; m < cs.length; m++) {
      const a = cs[n], b = cs[m];
      if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 101) big.carveCapsule(a, b, BU, { force: true });
    }
    let open = 0;
    for (const key of big.carve.data.keys) big.carve.forEachOpenSample(key, () => open++);
    const t0 = now();
    const nav = createNestNav(big.carve, { isBlocked: (x, y, z) => big.field.hardXYZ(x, y, z) <= 0 });
    const passMs = now() - t0;
    nav.setTarget('a', { points: [cs[0]], radius: 2 * BU });
    let settled = 0;
    const bfsMs = bestOf(6, () => { const t1 = now(); settled = nav.build('a'); return now() - t1; });
    results.bfsOpenVoxels = open;
    results.bfsSettled = settled;
    results.bfsMs = +bfsMs.toFixed(2);
    results.bfsPassabilityMs = +passMs.toFixed(2);
    results.bfsUsPerVoxel = +((bfsMs * 1000) / settled).toFixed(3);
    // incremental update after a dig at the far end
    const far = cs[cs.length - 1];
    big.carveSphere(v(far.x + 20, far.y, far.z), BU, { force: true });
    const t2 = now();
    nav.distanceAt('a', far);
    results.bfsIncrementalMs = +(now() - t2).toFixed(3);
    expect(open).toBeGreaterThan(100000);
    expect(settled).toBeGreaterThan(100000);
    expect(bfsMs).toBeLessThan(60 * SLACK);
  }, LONG);

  it('no per-step allocations in sample, gradient, project and walkerStep (heap and GC check)', async () => {
    // Our code allocates no objects, arrays or closures on these paths (code reading). V8 may still box doubles
    // at call boundaries it did not inline (short-lived HeapNumbers). This checks that nothing is RETAINED
    // (the heap floor does not grow) and that young-generation GC stays a negligible share of the time.
    const proc = (globalThis as unknown as { process?: { memoryUsage(): { heapUsed: number } } }).process;
    type Entry = { duration: number };
    const PO = (globalThis as unknown as { PerformanceObserver?: new (cb: (l: { getEntries(): Entry[] }) => void) => { observe(o: object): void; disconnect(): void } }).PerformanceObserver;
    const w = createWalkerKin(k.walker.footOffset);
    walkerPlace(k.field, w, v(420, slabBottom - 6, 470), { heading: v(1, 0, 0) });
    const g = v(0, 0, 0), out = v(0, 0, 0), nrm = v(0, 0, 0), p = v(0, 0, 0);
    let acc = 0;
    const loop = (n: number) => {
      for (let i = 0; i < n; i++) {
        p.x = 150 + (i % 50) * 0.1; p.y = 1 + (i % 7) * 0.1; p.z = 250;
        acc += k.field.sample(p);
        acc += k.field.gradient(p, g);
        if (k.field.project(p, 0.6, out, nrm)) acc += out.y;
        if (w.pos.x > 600 && w.fwd.x > 0) { w.fwd.x = -w.fwd.x; w.fwd.y = -w.fwd.y; w.fwd.z = -w.fwd.z; }
        if (w.pos.x < 400 && w.fwd.x < 0) { w.fwd.x = -w.fwd.x; w.fwd.y = -w.fwd.y; w.fwd.z = -w.fwd.z; }
        walkerStep(k.field, w, null, CRUISE, TICK);
      }
    };
    loop(20000); // warm-up
    // a real full GC when Node allows it (v8 flag + vm trick), else the heap floor over many batches
    const gc = await nodeGc();
    gc?.();
    const h0 = proc ? proc.memoryUsage().heapUsed : 0;
    let gcs = 0, gcMs = 0;
    const obs = PO ? new PO((list) => { for (const e of list.getEntries()) { gcs++; gcMs += e.duration; } }) : null;
    try { obs?.observe({ entryTypes: ['gc'] }); } catch { /* gc entries unsupported here */ }
    const heap: number[] = [];
    const t0 = now();
    for (let batch = 0; batch < 12; batch++) {
      loop(20000);
      if (proc) heap.push(proc.memoryUsage().heapUsed);
    }
    const ms = now() - t0;
    await new Promise((r) => setTimeout(r, 50));
    obs?.disconnect();
    gc?.();
    const h1 = proc ? proc.memoryUsage().heapUsed : 0;
    const floor = (a: number[]) => Math.min(...a);
    const retained = gc ? h1 - h0 : heap.length ? floor(heap.slice(-4)) - floor(heap.slice(0, 4)) : 0;
    results.heapRetainedKB = Math.round(retained / 1024);
    results.heapCheck = gc ? 'full-gc' : 'floor';
    results.gcCountPer1kIter = +((gcs * 1000) / 240000).toFixed(3);
    results.gcTimeShare = +(gcMs / ms).toFixed(4);
    expect(Number.isFinite(acc)).toBe(true);
    expect(retained).toBeLessThan((gc ? 0.25 : 4) * 1024 * 1024);
    // short-lived boxed doubles only: scavenges stay a small share of the run time (measured 2-8 %)
    expect(gcMs / ms).toBeLessThan(0.15);
  }, LONG);

  it('report', () => {
    console.log('KERNEL_PERF ' + JSON.stringify(results));
    expect(Object.keys(results).length).toBeGreaterThan(5);
  });
});
