// Pipeline: determinism and fingerprint (GDD 04 §4.4, App. E 1), validity of every Tier 1 archetype at every
// size with the Node time budget (App. E 8), forced validation failure and repair (App. E 10), progress and
// placer registration.
import { describe, expect, it, vi } from 'vitest';
import type { WorldData } from '@/sim/types';
import { generateWorld, generateWorldReport, worldFingerprint } from './index';
import { paramsFor, PERF_STRICT, report, T1_ARCHETYPES } from './testing/fixtures';
import { WORLDGEN_TIME_MS } from './tuning/pipeline';
import { SIZE_SCALE, BUDGETS } from './tuning/pipeline';
import type { WorldgenModule } from './kit/registry';
import { placeObject } from './kit/template';
import { PrimFlag } from '@/sim/types';

// world generation takes ~1-2 s per world and the shared machine is often loaded
vi.setConfig({ testTimeout: 300_000 });

const now = () => performance.now();
declare const process: { cpuUsage(): { user: number; system: number } };
/** CPU time of this worker process, ms (vitest runs files in forked processes): much less load-sensitive. */
const cpuNow = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };

describe('determinism and fingerprint (DET-1, DET-6)', () => {
  it('E1 (Node part): identical params give identical fingerprints in repeated runs; seeds differ', () => {
    const p = { ...paramsFor('suburban-garden', 0), seedText: 'oak-17', seed: 0 };
    const a = generateWorld(p), b = generateWorld(p);
    expect(a.meta.fingerprint).toBe(b.meta.fingerprint);
    expect(worldFingerprint(a)).toBe(a.meta.fingerprint);
    const c = generateWorld({ ...p, seed: 1 });
    expect(c.meta.fingerprint).not.toBe(a.meta.fingerprint);
    expect(a.terrain.data).toEqual(b.terrain.data);
  });

  it('the fingerprint covers every array and value of WorldData (meta excluded)', () => {
    const w = report('kitchen-door', 2).world;
    const base = worldFingerprint(w);
    let probed = 0;
    const visit = (o: Record<string, unknown>, path: string) => {
      for (const k of Object.keys(o)) {
        if (path === '' && k === 'meta') continue;
        const v = o[k];
        if (ArrayBuffer.isView(v) && !(v instanceof DataView)) {
          const arr = v as unknown as { length: number; [i: number]: number };
          if (arr.length === 0) continue;
          const i = arr.length >> 1, old = arr[i];
          arr[i] = old === 1 ? 2 : 1;
          expect(worldFingerprint(w), `${path}${k}`).not.toBe(base);
          arr[i] = old;
          probed++;
        } else if (Array.isArray(v)) {
          if (v.length === 0) continue;
          const e = v[0];
          if (typeof e === 'number') { v[0] = e + 1; expect(worldFingerprint(w), `${path}${k}`).not.toBe(base); v[0] = e; probed++; }
          else if (e && typeof e === 'object') visit(e as Record<string, unknown>, `${path}${k}[0].`);
        } else if (v && typeof v === 'object') visit(v as Record<string, unknown>, `${path}${k}.`);
        else if (typeof v === 'number') { o[k] = v + 1; expect(worldFingerprint(w), `${path}${k}`).not.toBe(base); o[k] = v; probed++; }
      }
    };
    visit(w as unknown as Record<string, unknown>, '');
    expect(worldFingerprint(w)).toBe(base);
    expect(probed).toBeGreaterThan(30);
    const before = w.meta.attempts;
    w.meta.attempts = 99;
    expect(worldFingerprint(w)).toBe(base); // meta is not part of it
    w.meta.attempts = before;
  });
});

describe('every Tier 1 archetype at every size generates a valid world', () => {
  for (const a of T1_ARCHETYPES) {
    it(`${a}: compact, standard, large pass validation; standard within the Node budget`, () => {
      for (const size of ['compact', 'standard', 'large'] as const) {
        const t0 = now(), c0 = cpuNow();
        const r = report(a, 3, size);
        const ms = now() - t0, cpu = cpuNow() - c0;
        const failed = r.checks.filter((c) => c.status === 'fail');
        expect(failed, `${a} ${size}: ${failed.map((c) => `${c.id} ${c.detail}`).join('; ')}`).toEqual([]);
        expect(r.attempts).toBeLessThanOrEqual(8);
        expect(r.world.prims.length).toBeLessThanOrEqual(Math.round(BUDGETS.primTotal * SIZE_SCALE[size]));
        if (size === 'standard') {
          // E8: <= 3000 ms in Node. FOUNDRESS_PERF_STRICT=1 (idle machine) checks the wall clock against it. The
          // shared machine often runs at a load average of ~20 on 4 cores, so the default run checks this process's
          // CPU time (waiting for a core does not count; contention still inflates it) against twice the budget.
          if (PERF_STRICT) expect(ms, `${a} standard took ${ms.toFixed(0)} ms`).toBeLessThan(WORLDGEN_TIME_MS.node);
          else expect(cpu, `${a} standard took ${cpu.toFixed(0)} ms CPU (${ms.toFixed(0)} ms wall)`).toBeLessThan(2 * WORLDGEN_TIME_MS.node);
        }
      }
    });
  }
});

describe('regeneration and repair (GDD 04 §4.3)', () => {
  it('E10: forced v-found failure for 8 attempts -> attempts = 8, repairs contain R2, final map passes v-found', () => {
    const r = generateWorldReport(paramsFor('suburban-garden', 5), { forceFail: { check: 'v-found', attempts: 8 } });
    expect(r.attempts).toBe(8);
    expect(r.world.meta.attempts).toBe(8);
    expect(r.repairs).toContain('R2');
    expect(r.world.meta.repairs).toContain('R2');
    expect(r.checks.find((c) => c.id === 'v-found')?.status).toBe('pass');
    expect(r.world.objects.some((o) => o.templateId === 'repair-stone')).toBe(true);
  });

  it('wood nesters without catalogue wood go straight to repair R2 (decayed logs) instead of regenerating', () => {
    // no content modules: no catalogue wood at all (fences, sheds, logs and door jambs carry decayed wood now), only
    // the built-in shell, whose door leaf is sound wood; no attempt could do better, so the first one is repaired
    const r = generateWorldReport(paramsFor('kitchen-door', 13, 'standard', 'camponotus-pennsylvanicus'), { modules: [] });
    expect(r.attempts).toBe(1);
    expect(r.repairs).toContain('R2');
    const w = r.world;
    const objectOf = (id: number) => w.objects.find((o) => o.id === id)?.templateId;
    expect(w.prims.filter((p) => p.material === 'wood-decayed').every((p) => objectOf(p.objectId) === 'repair-log')).toBe(true);
    expect(w.objects.some((o) => o.templateId === 'repair-log')).toBe(true);
    expect(r.checks.filter((c) => c.status === 'fail')).toEqual([]);
  });

  it('a forced failure on the first attempt regenerates once with a different attempt seed', () => {
    const plain = report('car-park-verge', 6);
    const r = generateWorldReport(paramsFor('car-park-verge', 6), { forceFail: { check: 'v-connect', attempts: 1 } });
    expect(r.attempts).toBe(2);
    expect(r.repairs).toEqual([]);
    expect(r.world.meta.fingerprint).not.toBe(plain.world.meta.fingerprint);
  });
});

describe('progress and placers', () => {
  it('progress steps arrive in GDD order with rising fractions, ending at 1', () => {
    const seen: { step: string; fraction: number }[] = [];
    generateWorld(paramsFor('playground-park', 2, 'compact'), (p) => seen.push(p));
    const steps = seen.map((s) => s.step);
    expect(steps.slice(0, 11)).toEqual(['zones', 'height', 'structures', 'props', 'plants', 'derived', 'resources', 'rivals', 'cavities', 'start', 'validate']);
    for (let i = 1; i < seen.length; i++) expect(seen[i].fraction).toBeGreaterThanOrEqual(seen[i - 1].fraction);
    expect(seen[seen.length - 1].fraction).toBe(1);
  });

  it('registered placers run in their steps, can replace defaults by id, and providing content makes checks apply', () => {
    const order: string[] = [];
    const mod: WorldgenModule = {
      placers: [
        { id: 'test/b', step: 'props', order: 2, run: () => order.push('props-b') },
        { id: 'test/a', step: 'props', order: 1, provides: ['props'], run: (ctx) => {
          order.push('props-a');
          placeObject(ctx, { id: 'test-stone', tags: ['prop'], prims: [{ shape: 'ellipsoid', pos: { x: 0, y: 10, z: 0 }, size: { x: 40, y: 10, z: 30 }, material: 'stone', flags: PrimFlag.CLIMBABLE }] },
            { x: ctx.dims.size / 2, z: ctx.dims.size / 2, category: 'props', collide: true });
        } },
        { id: 'test/res', step: 'resources', run: () => order.push('resources') },
        { id: 'default/building-shell', step: 'structures', run: () => order.push('shell-replaced') },
      ],
    };
    const r = generateWorldReport(paramsFor('kitchen-door', 2, 'compact'), { modules: [mod] });
    expect(order).toEqual(['shell-replaced', 'props-a', 'props-b', 'resources']);
    expect(r.world.objects.some((o) => o.templateId === 'house-shell')).toBe(false);
    expect(r.checks.find((c) => c.id === 'v-rest')?.status).toBe('pass');
    expect(r.checks.find((c) => c.id === 'v-food')?.status).toBe('n/a');
  });

  it('works with no content module at all (sparse world)', () => {
    const w: WorldData = generateWorld(paramsFor('woodland-edge', 4, 'compact'), undefined, { modules: [] });
    expect(w.prims.length).toBe(0);
    expect(w.meta.attempts).toBe(1);
  });
});
