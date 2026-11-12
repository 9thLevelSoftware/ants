// Independent review tests for worldgen-interior (adversarial): denser overlap checks than interior.test.ts,
// placement rules of GDD 04 §5.7 (table clearance, bowls near the door, window over the sink), the kick-space
// guarantee per run (§6.2), water bodies inside their bowls, and POIs in free space near a surface (§10).
import { describe, expect, it, vi } from 'vitest';
import { makePrimEntry, primEval, type PrimEntry } from '@/sim/world/primHash';
import type { WorldData } from '@/sim/types';
import { report } from '../../testing/fixtures';
import { GLAZING_ID } from '../../catalog/interior/shell';
import { follow, kernelFor, walkerAt } from './testkit';

vi.setConfig({ testTimeout: 900_000 });

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const world = (seed: number) => report('kitchen-door', seed).world;
const objs = (w: WorldData, id: string) => w.objects.filter((o) => o.templateId === id);
const prims = (w: WorldData, o: { primStart: number; primCount: number }) => w.prims.slice(o.primStart, o.primStart + o.primCount);

/** Objects that are placed into the room and must not penetrate anything else (structure parts may interlock). */
const LOOSE = new Set([
  'base-cabinet-run', 'countertop', 'sink', 'fridge', 'cooker', 'washing-machine', 'kitchen-table', 'chair', 'pedal-bin',
  'pet-bowl-pair', 'doormat-inside', 'houseplant', 'fruit-bowl', 'bread-board', 'sugar-bowl', 'skirting',
]);

type Box = { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };
const aabb = (e: PrimEntry): Box => ({ x0: e.minX, x1: e.maxX, y0: e.minY, y1: e.maxY, z0: e.minZ, z1: e.maxZ });

/** Deepest common penetration of two primitives on a 9^3 lattice over their AABB intersection (mm, >= 0). */
function penetration(a: PrimEntry, b: PrimEntry): { depth: number; at: { x: number; y: number; z: number } | null } {
  const x0 = Math.max(a.minX, b.minX), x1 = Math.min(a.maxX, b.maxX);
  const y0 = Math.max(a.minY, b.minY), y1 = Math.min(a.maxY, b.maxY);
  const z0 = Math.max(a.minZ, b.minZ), z1 = Math.min(a.maxZ, b.maxZ);
  if (x1 - x0 < 1 || y1 - y0 < 1 || z1 - z0 < 1) return { depth: 0, at: null };
  let depth = 0, at: { x: number; y: number; z: number } | null = null;
  const N = 9;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) for (let k = 0; k <= N; k++) {
    const x = x0 + ((x1 - x0) * i) / N, y = y0 + ((y1 - y0) * j) / N, z = z0 + ((z1 - z0) * k) / N;
    const d = Math.min(-primEval(a, x, y, z, null), -primEval(b, x, y, z, null));
    if (d > depth) { depth = d; at = { x, y, z }; }
  }
  return { depth, at };
}

describe('interior review: overlaps (GDD 04 App. E 9, dense lattice)', () => {
  it('no placed interior object (furniture, appliances, skirting) penetrates another object by more than 1 mm', () => {
    const bad: string[] = [];
    for (const s of SEEDS) {
      const w = world(s);
      const entries = w.prims.map((p) => makePrimEntry(p, false));
      const tpl = new Map(w.objects.map((o) => [o.id, o.templateId]));
      const loose = w.objects.filter((o) => LOOSE.has(o.templateId));
      // room-sized region: everything within 1 m of the loose objects
      for (const o of loose) {
        for (let i = o.primStart; i < o.primStart + o.primCount; i++) {
          const a = entries[i];
          for (let j = 0; j < entries.length; j++) {
            const b = entries[j];
            if (w.prims[j].objectId === o.id) continue;
            // each loose-loose pair once
            if (LOOSE.has(tpl.get(w.prims[j].objectId)!) && w.prims[j].objectId < o.id) continue;
            if (b.maxX < a.minX || b.minX > a.maxX || b.maxY < a.minY || b.minY > a.maxY || b.maxZ < a.minZ || b.minZ > a.maxZ) continue;
            const p = penetration(a, b);
            if (p.depth > 1) bad.push(`seed ${s}: ${o.templateId} prim ${i - o.primStart} in ${tpl.get(w.prims[j].objectId)} by ${p.depth.toFixed(1)} mm at ${JSON.stringify(p.at)}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('interior review: placement rules of GDD 04 §5.7', () => {
  it('table >= 700 from counters and appliances, chairs 2-4 around it, pet bowls within 1500 of the door', () => {
    const bad: string[] = [];
    for (const s of SEEDS) {
      const w = world(s);
      const ent = (o: { primStart: number; primCount: number }) => prims(w, o).map((p) => aabb(makePrimEntry(p, false)));
      const union = (bs: Box[]): Box => bs.reduce((u, b) => ({ x0: Math.min(u.x0, b.x0), x1: Math.max(u.x1, b.x1), y0: Math.min(u.y0, b.y0), y1: Math.max(u.y1, b.y1), z0: Math.min(u.z0, b.z0), z1: Math.max(u.z1, b.z1) }));
      const dist = (a: Box, b: Box) => Math.hypot(Math.max(0, a.x0 - b.x1, b.x0 - a.x1), Math.max(0, a.z0 - b.z1, b.z0 - a.z1));
      const table = objs(w, 'kitchen-table')[0];
      const top = ent(table)[0];
      for (const id of ['base-cabinet-run', 'countertop', 'fridge', 'cooker', 'washing-machine']) {
        for (const o of objs(w, id)) {
          const d = dist(top, union(ent(o)));
          if (d < 700 - 1) bad.push(`seed ${s}: table ${d.toFixed(0)} mm from ${id}`);
        }
      }
      const chairs = objs(w, 'chair');
      if (chairs.length < 2 || chairs.length > 4) bad.push(`seed ${s}: ${chairs.length} chairs`);
      for (const c of chairs) if (dist(top, union(ent(c))) > 300) bad.push(`seed ${s}: chair ${dist(top, union(ent(c))).toFixed(0)} mm from the table`);
      const leaf = makePrimEntry(w.prims[objs(w, 'back-door')[0].primStart], false);
      const door = { x: (leaf.minX + leaf.maxX) / 2, z: (leaf.minZ + leaf.maxZ) / 2 };
      for (const b of objs(w, 'pet-bowl-pair')) {
        const u = union(ent(b));
        const far = Math.max(...[[u.x0, u.z0], [u.x0, u.z1], [u.x1, u.z0], [u.x1, u.z1]].map(([x, z]) => Math.hypot(x - door.x, z - door.z)));
        if (far > 1500 + 150) bad.push(`seed ${s}: pet bowls reach ${far.toFixed(0)} mm from the door`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('the window is over the sink, its sill above the counter top; ceiling at 2370-2400, floor top at +150', () => {
    const bad: string[] = [];
    for (const s of SEEDS) {
      const w = world(s);
      const win = objs(w, GLAZING_ID)[0];
      const sink = objs(w, 'sink')[0];
      if (win) {
        const pane = makePrimEntry(prims(w, win).find((p) => p.material === 'glass')!, false);
        const basin = prims(w, sink).map((p) => makePrimEntry(p, false));
        const sx = (Math.min(...basin.map((e) => e.minX)) + Math.max(...basin.map((e) => e.maxX))) / 2;
        const sz = (Math.min(...basin.map((e) => e.minZ)) + Math.max(...basin.map((e) => e.maxZ))) / 2;
        const px = (pane.minX + pane.maxX) / 2, pz = (pane.minZ + pane.maxZ) / 2;
        // along the wall the centres agree (one of x/z is the wall normal)
        const alongX = pane.maxX - pane.minX > pane.maxZ - pane.minZ;
        const off = alongX ? Math.abs(px - sx) : Math.abs(pz - sz);
        if (off > 1) bad.push(`seed ${s}: window ${off.toFixed(0)} mm off the sink centre`);
        if (pane.minY < 150 + 910) bad.push(`seed ${s}: pane bottom ${pane.minY} below the counter top`);
      }
      const ceil = makePrimEntry(prims(w, objs(w, 'ceiling')[0])[0], false);
      if (Math.abs(ceil.minY - 2370) > 0.5 || Math.abs(ceil.maxY - 2400) > 0.5) bad.push(`seed ${s}: ceiling ${ceil.minY}-${ceil.maxY}`);
      const fin = makePrimEntry(prims(w, objs(w, 'floor-slab')[0])[1], false);
      if (Math.abs(fin.maxY - 150) > 0.5) bad.push(`seed ${s}: floor top ${fin.maxY}`);
    }
    expect(bad).toEqual([]);
  });
});

describe('interior review: micro-connections and points of interest', () => {
  it('every cabinet run has a passable kick-space section (>= 0.6 BU), open in the field under its kickboard', () => {
    const bad: string[] = [];
    for (const s of SEEDS) {
      const w = world(s);
      const k = kernelFor(w);
      const kicks = w.micro.filter((m) => m.kind === 'kick-space');
      for (const run of objs(w, 'base-cabinet-run')) {
        const u = prims(w, run).map((p) => makePrimEntry(p, false));
        const box = { x0: Math.min(...u.map((e) => e.minX)), x1: Math.max(...u.map((e) => e.maxX)), z0: Math.min(...u.map((e) => e.minZ)), z1: Math.max(...u.map((e) => e.maxZ)) };
        const mine = kicks.filter((m) => {
          const x = (m.posA.x + m.posB.x) / 2, z = (m.posA.z + m.posB.z) / 2;
          return x >= box.x0 - 1 && x <= box.x1 + 1 && z >= box.z0 - 1 && z <= box.z1 + 1;
        });
        if (mine.length === 0) { bad.push(`seed ${s}: run ${run.id} has no kick-space micro`); continue; }
        for (const m of mine) {
          if (m.gapMm < 0.6 * w.bu - 1e-9) bad.push(`seed ${s}: kick-space gap ${m.gapMm}`);
          const x = (m.posA.x + m.posB.x) / 2, z = (m.posA.z + m.posB.z) / 2;
          const f = k.field.sampleXYZ(x, 150 + m.gapMm / 2, z);
          if (!(f > k.walker.footOffset)) bad.push(`seed ${s}: kick-space field at the gap ${f.toFixed(2)} <= foot ${k.walker.footOffset}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('bowl water bodies sit inside their bowl (centre on a bowl base, level below the rim)', () => {
    const bad: string[] = [];
    let n = 0;
    for (const s of SEEDS) {
      const w = world(s);
      for (const wb of w.waterBodies.filter((b) => b.kind === 'bowl-water')) {
        const o = w.objects.find((x) => x.id === wb.vesselObjectId);
        if (!o || o.templateId !== 'pet-bowl-pair') continue;
        n++;
        const bases = prims(w, o).filter((p) => p.shape === 'cylinder');
        const best = Math.min(...bases.map((p) => Math.hypot(p.pos.x - wb.pos.x, p.pos.z - wb.pos.z)));
        if (best > 1) bad.push(`seed ${s}: water centre ${best.toFixed(1)} mm from any bowl base`);
        const rim = Math.max(...prims(w, o).map((p) => makePrimEntry(p, false).maxY));
        if (wb.pos.y + wb.levelMm >= rim) bad.push(`seed ${s}: water level ${wb.pos.y + wb.levelMm} at or above the rim ${rim}`);
      }
    }
    expect(n).toBeGreaterThan(0);
    expect(bad).toEqual([]);
  });

  it('interior POIs lie in free space within 3 BU of a surface', () => {
    const bad: string[] = [];
    const INTERIOR = new Set([...LOOSE, GLAZING_ID]);
    for (const s of [1, 2, 3, 4, 5]) {
      const w = world(s);
      const k = kernelFor(w);
      const tpl = new Map(w.objects.map((o) => [o.id, o.templateId]));
      for (const p of w.pois) {
        const t = tpl.get(p.objectId);
        if (!t || !INTERIOR.has(t)) continue;
        const f = k.field.sampleXYZ(p.pos.x, p.pos.y, p.pos.z);
        if (!(f > 0) || f > 3 * w.bu) bad.push(`seed ${s}: ${t} ${p.kind} field ${f.toFixed(2)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('the guaranteed weep vent of the façade is open for Lasius (field clear in the slot)', () => {
    const bad: string[] = [];
    for (const s of [1, 2, 3]) {
      const w = world(s);
      const k = kernelFor(w);
      const v = w.micro.find((m) => m.kind === 'weep-vent');
      if (!v) { bad.push(`seed ${s}: no weep-vent`); continue; }
      if (v.gapMm < 0.6 * w.bu) bad.push(`seed ${s}: weep-vent slot ${v.gapMm} < 0.6 BU`);
      // the slot beside the grille bar (bar = 10 - 2 slot, centred on the perpend), across the outer leaf
      const nx = v.posB.x - v.posA.x, nz = v.posB.z - v.posA.z, nl = Math.hypot(nx, nz);
      const ax = -nz / nl, az = nx / nl;
      const bar = 10 - 2 * v.gapMm >= 0.5 ? 10 - 2 * v.gapMm : 0;
      const side = bar > 0 ? bar / 2 + v.gapMm / 2 : 0;
      const y = 150 + 65 / 2;
      let blocked = 0;
      for (let t = 0.3; t <= 0.95; t += 0.05) {
        const x = v.posA.x + nx * t + ax * side, z = v.posA.z + nz * t + az * side;
        if (!(k.field.sampleXYZ(x, y, z) > k.walker.footOffset)) blocked++;
      }
      if (blocked > 0) bad.push(`seed ${s}: weep-vent slot blocked at ${blocked} samples (slot ${v.gapMm})`);
    }
    expect(bad).toEqual([]);
  });
});

describe('interior review: micro-connection mouths', () => {
  it('both mouths of every building micro-connection lie in free space (not inside paving or a wall)', () => {
    const bad: string[] = [];
    const KINDS = new Set(['door-crack', 'pipe-penetration', 'kick-space', 'skirting-gap', 'weep-vent']);
    for (const s of [1, 2, 3, 4, 5]) {
      const w = world(s);
      const k = kernelFor(w);
      for (const m of w.micro.filter((x) => KINDS.has(x.kind))) {
        for (const [name, p] of [['A', m.posA], ['B', m.posB]] as const) {
          const f = k.field.sampleXYZ(p.x, p.y + 0.5, p.z);
          if (!(f > 0)) bad.push(`seed ${s}: ${m.kind} mouth ${name} at y ${p.y} inside solid (field ${f.toFixed(2)})`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('interior review: climb routes on seeds the implementation tests do not cover', () => {
  const INTERIOR = new Set(['base-cabinet-run', 'kitchen-table', 'chair', 'pedal-bin', 'pet-bowl-pair', 'houseplant', GLAZING_ID]);
  for (const [seed, species] of [[5, 'lasius-niger'], [6, 'lasius-niger'], [7, 'lasius-niger'], [8, 'lasius-niger'], [2, 'messor-barbarus']] as const) {
    it(`${species} seed ${seed}: every interior route there and back`, () => {
      const w = report('kitchen-door', seed, 'standard', species).world;
      const k = kernelFor(w);
      const tpl = new Map(w.objects.map((o) => [o.id, o.templateId]));
      const failed: string[] = [];
      for (const r of w.climbRoutes.filter((x) => INTERIOR.has(tpl.get(x.objectId) ?? ''))) {
        const name = `${tpl.get(r.objectId)}/${r.kind}#${r.id}`;
        const kin = walkerAt(k, r.points[0]);
        if (!kin) { failed.push(`${name}: no surface at the base`); continue; }
        const up = follow(k, kin, r.points.map((p) => ({ p })));
        const down = up.ok ? follow(k, kin, [...r.points].reverse().map((p) => ({ p }))) : null;
        if (!up.ok || !down?.ok) {
          const res = up.ok ? down! : up;
          failed.push(`${name}: ${up.ok ? 'back' : 'up'} stopped at node ${res.reached}/${r.points.length} fell=${res.fell}`);
        }
      }
      expect(failed).toEqual([]);
    });
  }
});
