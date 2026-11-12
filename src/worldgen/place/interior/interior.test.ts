// worldgen-interior acceptance 2, 3 and GDD 04 App. E 4, 5, 9 (interior part): over 10 kitchen-door seeds the
// kitchen is built and enclosed (the nav grid reaches it from outside only through micro-connections), it has
// a passable indoor-outdoor connection, furniture does not interpenetrate and rests on its support, every human
// node has a walking lane from the door, and generation is deterministic.
import { describe, expect, it, vi } from 'vitest';
import { makePrimEntry, primEval } from '@/sim/world/primHash';
import type { WorldData } from '@/sim/types';
import { report } from '../../testing/fixtures';
import { generateWorldReport } from '../../pipeline';
import { defaultWorldParams } from '../../params';
import { cellAt, navDistances, snapWalkable } from '../../validate/graph';
import { evaluateMicro, usefulInteriorAccess } from '../../validate/micro';
import { interiorHumanAreas } from './lanes';
import { interiorFoodSpots } from './food';
import { kernelFor, navCtx, roomCells } from './testkit';

vi.setConfig({ testTimeout: 300_000 });

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const world = (seed: number) => report('kitchen-door', seed).world;
const INDOOR_OUTDOOR = new Set(['door-crack', 'pipe-penetration']);
const objs = (w: WorldData, id: string) => w.objects.filter((o) => o.templateId === id);

describe('kitchen-door interior over 10 seeds', () => {
  it('builds the shell and the kitchen catalogue', () => {
    for (const s of SEEDS) {
      const w = world(s);
      for (const id of ['floor-slab', 'house-wall', 'interior-wall', 'ceiling', 'back-door', 'sealed-house', 'base-cabinet-run', 'countertop', 'sink', 'fridge', 'cooker', 'kitchen-table', 'pedal-bin', 'doormat-inside', 'skirting']) {
        expect(objs(w, id).length, `seed ${s}: ${id}`).toBeGreaterThan(0);
      }
      expect(objs(w, 'chair').length, `seed ${s} chairs`).toBeGreaterThanOrEqual(2);
      expect(objs(w, 'chair').length).toBeLessThanOrEqual(4);
    }
  });

  it('is enclosed: from outside the nav grid reaches the room only through micro-connections', () => {
    for (const s of SEEDS) {
      const w = world(s);
      const room = roomCells(w);
      expect(room.size, `seed ${s} room cells`).toBeGreaterThan(100);
      const start = snapWalkable(navCtx(w), cellAt(navCtx(w), w.queenStart.pos.x, w.queenStart.pos.z));
      const without = navDistances(navCtx(w, []), [start]);
      const leaked = [...room].filter((c) => without[c] < Infinity);
      expect(leaked, `seed ${s}: room cells reachable without portals`).toEqual([]);
      const withPortals = navDistances(navCtx(w), [start]);
      const reached = [...room].filter((c) => withPortals[c] < Infinity).length;
      expect(reached / room.size, `seed ${s}: room reached through the portals`).toBeGreaterThan(0.3);
    }
  });

  it('has at least one passable indoor-outdoor connection (GDD 04 §6.3; App. E 4)', () => {
    for (const s of SEEDS) {
      const w = world(s);
      const k = kernelFor(w);
      const io = w.micro.filter((m) => INDOOR_OUTDOOR.has(m.kind) && m.minClearanceBu >= 0.6 - 1e-9);
      expect(io.length, `seed ${s}`).toBeGreaterThanOrEqual(1);
      for (const m of io) {
        // the field is open at the middle of the passage by more than the walker's foot offset
        const p = passageMid(w, m.kind, m.posA, m.posB, m.gapMm);
        expect(k.field.sampleXYZ(p.x, p.y, p.z), `seed ${s} ${m.kind} gap ${m.gapMm}`).toBeGreaterThan(k.walker.footOffset);
      }
      // the validator's own usefulness test counts the interior access
      const ctx = validatorCtx(w);
      evaluateMicro(ctx);
      expect(usefulInteriorAccess(ctx), `seed ${s} useful interior access`).toBeGreaterThanOrEqual(1);
    }
  });

  it('furniture does not interpenetrate and rests on the floor or the counter', () => {
    for (const s of SEEDS) {
      const w = world(s);
      const floorY = 150;
      const furn = w.objects.filter((o) => o.tags.includes('furniture'));
      const entries = w.prims.map((p) => makePrimEntry(p, false));
      for (const o of furn) {
        const mine = entries.slice(o.primStart, o.primStart + o.primCount);
        let low = Infinity;
        for (const e of mine) low = Math.min(low, lowestPoint(e));
        if (o.tags.includes('rest-floor')) expect(Math.abs(low - floorY), `seed ${s} ${o.templateId} rests on the floor`).toBeLessThan(1);
        if (o.tags.includes('rest-counter')) expect(Math.abs(low - 150 - 910), `seed ${s} ${o.templateId} rests on the counter`).toBeLessThan(1);
        for (const e of mine) {
          for (const q of latticeInside(e)) {
            for (let j = 0; j < entries.length; j++) {
              const other = entries[j];
              if (w.prims[j].objectId === o.id || q.x < other.minX || q.x > other.maxX || q.y < other.minY || q.y > other.maxY || q.z < other.minZ || q.z > other.maxZ) continue;
              const d = primEval(other, q.x, q.y, q.z, null);
              expect(d, `seed ${s}: ${o.templateId} inside ${w.objects.find((x) => x.id === w.prims[j].objectId)?.templateId}`).toBeGreaterThan(-1);
            }
          }
        }
      }
    }
  });

  it('leaves a walking lane from the door to every human node (GDD 04 §4.2 step 3)', () => {
    for (const s of SEEDS) {
      const a = interiorHumanAreas(world(s))!;
      expect(a, `seed ${s}`).not.toBeNull();
      expect(a.unreachable, `seed ${s}`).toEqual([]);
      const kinds = new Set(a.lanes.map((l) => l.to));
      for (const k of ['counter', 'fridge', 'cooker', 'seat'] as const) expect(kinds.has(k), `seed ${s} lane to ${k}`).toBe(true);
      expect(a.wipe.length).toBeGreaterThan(0);
      expect(a.crevice.length).toBeGreaterThan(0);
    }
  });

  it('marks the food points of interest the life module fills (counter, table, bin, pet bowl)', () => {
    for (const s of SEEDS) {
      const spots = interiorFoodSpots(world(s));
      const labels = new Set(spots.map((x) => x.label));
      for (const l of ['counter', 'table-top', 'under-table', 'bin-rim', 'hob-grease', 'water']) expect(labels.has(l), `seed ${s} ${l}`).toBe(true);
      if (objs(world(s), 'pet-bowl-pair').length > 0) expect(labels.has('pet-food')).toBe(true);
    }
  });

  it('varies the layout with the seed and is deterministic', () => {
    const pos = new Set(SEEDS.map((s) => { const t = objs(world(s), 'kitchen-table')[0]; return `${Math.round(t.pos.x / 100)},${Math.round(t.pos.z / 100)}`; }));
    expect(pos.size).toBeGreaterThan(5);
    const again = generateWorldReport({ ...defaultWorldParams('lasius-niger', 3), archetype: 'kitchen-door' }).world;
    expect(again.meta.fingerprint).toBe(world(3).meta.fingerprint);
  });
});

describe('Camponotus kitchen-door (GDD 04 App. E 5)', () => {
  it('door crack >= 5.4 mm, or the door is sealed and a pipe penetration with clearance >= 0.6 BU exists', () => {
    for (const s of [1, 2, 3, 4, 5]) {
      const w = report('kitchen-door', s, 'standard', 'camponotus-pennsylvanicus').world;
      expect(w.bu).toBe(9);
      const door = w.micro.find((m) => m.kind === 'door-crack')!;
      const pipe = w.micro.find((m) => m.kind === 'pipe-penetration' && m.minClearanceBu >= 0.6 - 1e-9);
      expect(door.gapMm >= 5.4 - 1e-9 || (door.gapMm === 0 && !!pipe), `seed ${s} door ${door.gapMm}`).toBe(true);
    }
  });
});

/** Middle of the passage: under the door leaf, or the pipe annulus beside the pipe. */
function passageMid(w: WorldData, kind: string, a: { x: number; z: number }, b: { x: number; z: number }, gap: number) {
  const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
  if (kind === 'door-crack') {
    const leaf = w.prims[objs(w, 'back-door')[0].primStart];
    return { x: leaf.pos.x, y: leaf.pos.y - leaf.size.y - gap / 2, z: leaf.pos.z };
  }
  // pipe: the pipe whose axis passes nearest the mouths' midpoint; its annulus point beside the pipe
  const pipes = objs(w, 'service-pipe').map((o) => w.prims[o.primStart]);
  const p = pipes.reduce((x, y) => ((x.pos.x - mx) ** 2 + (x.pos.z - mz) ** 2 < (y.pos.x - mx) ** 2 + (y.pos.z - mz) ** 2 ? x : y));
  const alongX = Math.abs(b.x - a.x) > Math.abs(b.z - a.z);
  return alongX ? { x: p.pos.x, y: p.pos.y, z: p.pos.z + p.size.x + gap / 2 } : { x: p.pos.x + p.size.x + gap / 2, y: p.pos.y, z: p.pos.z };
}

/** Enough of a GenContext for the validator's usefulness test (micro list copied: it writes `useful`). */
function validatorCtx(w: WorldData) {
  const zones: { type: string }[] = [];
  for (const z of w.zones) zones[z.id] = { type: z.type };
  return {
    dims: { navN: w.nav.cls.nx, navCell: w.nav.cls.cell, bu: w.bu, cell: w.maps.zone.cell, cells: w.maps.zone.nx },
    world: { ...w, micro: w.micro.map((m) => ({ ...m })) },
    layout: { zones, cells: w.maps.zone.data },
  } as unknown as Parameters<typeof evaluateMicro>[0];
}

/** Lowest point of a primitive (bisection down the column through its centre and corners of its AABB). */
function lowestPoint(e: ReturnType<typeof makePrimEntry>): number {
  let low = Infinity;
  for (const fx of [0.02, 0.25, 0.5, 0.75, 0.98]) for (const fz of [0.02, 0.25, 0.5, 0.75, 0.98]) {
    const x = e.minX + (e.maxX - e.minX) * fx, z = e.minZ + (e.maxZ - e.minZ) * fz;
    let lo = e.minY - 1, hi = e.maxY + 1, inside = false;
    for (let t = 0; t <= 40; t++) { const y = lo + ((hi - lo) * t) / 40; if (primEval(e, x, y, z, null) < 0) { hi = y; inside = true; break; } }
    if (!inside) continue;
    for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (primEval(e, x, m, z, null) < 0) hi = m; else lo = m; }
    low = Math.min(low, hi);
  }
  return low;
}

/** Points well inside a primitive (deeper than 1 mm), on a 3 x 3 x 3 lattice of its AABB. */
function latticeInside(e: ReturnType<typeof makePrimEntry>) {
  const out: { x: number; y: number; z: number }[] = [];
  for (const fx of [0.2, 0.5, 0.8]) for (const fy of [0.2, 0.5, 0.8]) for (const fz of [0.2, 0.5, 0.8]) {
    const q = { x: e.minX + (e.maxX - e.minX) * fx, y: e.minY + (e.maxY - e.minY) * fy, z: e.minZ + (e.maxZ - e.minZ) * fz };
    if (primEval(e, q.x, q.y, q.z, null) < -1) out.push(q);
  }
  return out;
}
