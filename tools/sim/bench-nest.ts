// Nest-operation timings (sim-fix-colony): plan validation and target cache, architect layouts, mound batches.
// Minimum of several runs (the machine is shared). Prints one JSON line per measurement.
//
//   node tools/sim/run-ts.mjs tools/sim/bench-nest.ts [runs=5]

import { archSim } from '@/sim/nest/architect/architectTestKit';
import { layoutNest } from '@/sim/nest/architect/layout';
import { validatePlanImpl } from '@/sim/nest/plans/validate';
import { planCache } from '@/sim/nest/plans/targets';
import { nestRuntime } from '@/sim/nest/runtime';
import { wallSpots } from '@/sim/nest/queries';
import { createMound, deposit, dumpPoint, moundById } from '@/sim/nest/mounds';
import { moundBatches } from '@/sim/nest/moundBatch';
import { moundMask, relaxPile } from '@/sim/nest/moundRelax';
import { moundRelaxStep } from '@/sim/nest/moundBatch';
import { publishMound } from '@/sim/nest/mounds';
import { MOUND_BATCH_TICKS } from '@/sim/balance/nest';
import type { PlanSpec } from '@/sim/types';

const proc = (globalThis as unknown as { process: { argv: string[]; cpuUsage(): { user: number; system: number } } }).process;
const cpuMs = (): number => { const u = proc.cpuUsage(); return (u.user + u.system) / 1000; };
const runs = Number(proc.argv[2] ?? 5);
const out = (name: string, v: unknown): void => console.log(JSON.stringify({ name, ...(v as object) }));

function minOf(fn: (n: number) => { cpu: number; wall: number }): { cpu: number; wall: number } {
  let cpu = Infinity, wall = Infinity;
  for (let n = 0; n < runs; n++) {
    const r = fn(n);
    cpu = Math.min(cpu, r.cpu);
    wall = Math.min(wall, r.wall);
  }
  return { cpu: +cpu.toFixed(2), wall: +wall.toFixed(2) };
}

function timed(f: () => void): { cpu: number; wall: number } {
  const c0 = cpuMs(), w0 = performance.now();
  f();
  return { cpu: cpuMs() - c0, wall: performance.now() - w0 };
}

// ---- layouts ----
for (const workers of [20, 100, 400]) {
  out(`layout-${workers}`, minOf((n) => {
    const { sim, nest } = archSim({ seed: 11 + n, terrain: 'noise', architect: false, template: false });
    return timed(() => layoutNest(sim, nest.id, workers));
  }));
}

// ---- validation and plan cache of a nursery M from a wall of a laid-out nest ----
{
  const { sim, nest } = archSim({ seed: 5, terrain: 'flat', architect: false, template: false });
  layoutNest(sim, nest.id, 40);
  const spots = wallSpots(sim, nest.id, 200, 3).filter((s) => s.depthBu > 12);
  const specs: PlanSpec[] = spots.slice(0, 20).map((s) => ({
    nestId: nest.id, kind: 'chamber', chamberType: 'nursery', size: 'm', anchor: { pos: s.pos, normal: s.normal },
    priority: 'normal', confirmWarnings: true,
  }));
  out('validate-nursery-m', minOf(() => timed(() => { for (const s of specs) validatePlanImpl(sim, s, 'architect'); })));
  let box = 0, n = 0;
  for (const s of specs) {
    const v = validatePlanImpl(sim, s, 'player');
    const g = v.geometry;
    if (!g) continue;
    box += ((g.max.x - g.min.x) * (g.max.y - g.min.y) * (g.max.z - g.min.z)) / sim.world.bu ** 3;
    n++;
  }
  out('nursery-m-box', { meanBoxBu3: +(box / Math.max(1, n)).toFixed(1), plans: specs.length });
  const plan = nest.digPlans.find((p) => p.kind === 'chamber');
  if (plan) {
    out('plan-cache', minOf(() => timed(() => { nestRuntime(sim).geom.delete(plan.id); planCache(sim, nest, plan); })));
  }
}

// ---- mound batch: a busy entrance mound (K settled pellets per batch) ----
for (const k of [20, 100]) {
  out(`mound-batch-${k}`, minOf((n) => {
    const { sim, nest } = archSim({ seed: 3 + n, terrain: 'flat', architect: false });
    const e = nest.entrances[0];
    if (!e) return { cpu: NaN, wall: NaN };
    const m = createMound(sim, nest, e, e.pos.x, e.pos.z, 'loam');
    // a mature pile first, relaxed once
    const p = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 400; i++) { dumpPoint(sim, e, p); deposit(sim, m, p.x, p.z, 0.85 * 1.25 * sim.world.bu ** 3); }
    sim.state.tick = MOUND_BATCH_TICKS * 4 - (m.id % MOUND_BATCH_TICKS);
    moundBatches(sim);
    for (let i = 0; i < k; i++) { dumpPoint(sim, e, p); deposit(sim, m, p.x, p.z, 0.85 * 1.25 * sim.world.bu ** 3); }
    sim.state.tick += MOUND_BATCH_TICKS;
    const t = timed(() => moundBatches(sim));
    void moundById;
    return t;
  }));
}

// ---- mound batch parts: mask, relaxation, publish (one busy mound) ----
{
  const parts = { mask: Infinity, relax: Infinity, publish: Infinity, sweeps: 0 };
  for (let n = 0; n < runs; n++) {
    const { sim, nest } = archSim({ seed: 30 + n, terrain: 'flat', architect: false });
    const e = nest.entrances[0];
    const m = createMound(sim, nest, e, e.pos.x, e.pos.z, 'loam');
    const p = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 400; i++) { dumpPoint(sim, e, p); deposit(sim, m, p.x, p.z, 0.85 * 1.25 * sim.world.bu ** 3); }
    relaxPile(sim, m);
    for (let i = 0; i < 100; i++) { dumpPoint(sim, e, p); deposit(sim, m, p.x, p.z, 0.85 * 1.25 * sim.world.bu ** 3); }
    sim.state.tick++;
    parts.mask = Math.min(parts.mask, timed(() => moundMask(sim, m)).cpu);
    parts.relax = Math.min(parts.relax, timed(() => relaxPile(sim, m)).cpu);
    parts.publish = Math.min(parts.publish, timed(() => publishMound(sim, m)).cpu);
  }
  out('mound-parts-100', parts);
}

// ---- one heavy batch (600 pellets): the whole relaxation at once vs. the largest per-tick slice ----
{
  let whole = Infinity, maxTick = Infinity, ticks = 0;
  for (let n = 0; n < runs; n++) {
    const make = () => {
      const { sim, nest } = archSim({ seed: 40 + n, terrain: 'flat', architect: false });
      const e = nest.entrances[0];
      const m = createMound(sim, nest, e, e.pos.x, e.pos.z, 'loam');
      const p = { x: 0, y: 0, z: 0 };
      for (let i = 0; i < 600; i++) { dumpPoint(sim, e, p); deposit(sim, m, p.x, p.z, 0.85 * 1.25 * sim.world.bu ** 3); }
      return { sim, m };
    };
    const a = make();
    whole = Math.min(whole, timed(() => relaxPile(a.sim, a.m)).cpu);
    const b = make();
    b.m.relaxSweep = 0; b.m.relaxFlags = 1;
    let worst = 0, t = 0;
    while ((b.m.relaxSweep ?? -1) >= 0) { worst = Math.max(worst, timed(() => moundRelaxStep(b.sim)).cpu); b.sim.state.tick++; t++; }
    maxTick = Math.min(maxTick, worst);
    ticks = t;
  }
  out('mound-600-whole-vs-tick', { wholeBatchCpu: +whole.toFixed(2), maxPerTickCpu: +maxTick.toFixed(2), ticks });
}
