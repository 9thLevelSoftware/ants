// Reviewer tests (worldgen-fixes): the closed-form column routine checked against the distance function itself,
// not against the search it replaced (the search could share a mistake). Random shapes at random rotations,
// rounding from none to more than the half extents, and degenerate sizes.
import { describe, expect, it } from 'vitest';
import { makePrimEntry, primEval, type PrimEntry } from '@/sim/world/primHash';
import type { Primitive, PrimShape } from '@/sim/types';
import { primColumn, primColumnAnalytic, type ColumnHit } from './column';

/** Small deterministic generator (tests only). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

function randomQuat(r: () => number): Primitive['rot'] {
  // uniform random rotation (Shoemake)
  const u1 = r(), u2 = r() * 2 * Math.PI, u3 = r() * 2 * Math.PI;
  const a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
  return { x: a * Math.sin(u2), y: a * Math.cos(u2), z: b * Math.sin(u3), w: b * Math.cos(u3) };
}

function prim(shape: PrimShape, size: Primitive['size'], round: number, rot: Primitive['rot']): Primitive {
  return { id: 1, shape, pos: { x: 100, y: 20, z: 100 }, rot, size, round, material: 'stone', flags: 0, objectId: -1 };
}

/** Checks one column against primEval: the ends are on the surface, inside between, outside beyond. */
function checkColumn(e: PrimEntry, x: number, z: number, col: ColumnHit): string | null {
  const ext = e.maxY - e.minY, tol = ext * 2 ** -12 + 1e-6;
  if (!col.hit) {
    // a miss: no point of the vertical line inside (dense scan; a clip thinner than the scan step can slip)
    const n = 4000;
    for (let i = 0; i <= n; i++) {
      const y = e.minY + (ext * i) / n;
      if (primEval(e, x, y, z, null) < -tol) return `miss but inside at y=${y}`;
    }
    return null;
  }
  if (!(col.bottom <= col.top + 1e-9)) return `bottom ${col.bottom} > top ${col.top}`;
  if (!Number.isFinite(col.bottom) || !Number.isFinite(col.top)) return 'non-finite end';
  if (col.bottom < e.minY - tol || col.top > e.maxY + tol) return `ends outside the bounds [${e.minY}, ${e.maxY}]`;
  if (primEval(e, x, (col.bottom + col.top) / 2, z, null) > tol) return 'midpoint outside';
  if (primEval(e, x, col.bottom - tol, z, null) <= 0) return `inside below bottom (${col.bottom})`;
  if (primEval(e, x, col.top + tol, z, null) <= 0) return `inside above top (${col.top})`;
  if (col.top - col.bottom > 4 * tol) {
    if (primEval(e, x, col.bottom + tol, z, null) > 0) return `outside just above bottom (${col.bottom})`;
    if (primEval(e, x, col.top - tol, z, null) > 0) return `outside just below top (${col.top})`;
  }
  return null;
}

function sweep(shape: PrimShape, seed: number, roundOf: (r: () => number, s: Primitive['size']) => number): string[] {
  const r = lcg(seed), bad: string[] = [];
  const col: ColumnHit = { hit: false, bottom: 0, top: 0 };
  for (let n = 0; n < 60; n++) {
    const size = { x: 2 + 40 * r(), y: 2 + 40 * r(), z: 2 + 40 * r() };
    const round = roundOf(r, size);
    // upright rounded boxes and cylinders take the legacy shortcut (see the test below), so only sharp ones here
    const upright = n % 7 === 0 && (round <= 0 || (shape !== 'box' && shape !== 'cylinder'));
    const p = prim(shape, size, round, upright ? { x: 0, y: 0, z: 0, w: 1 } : randomQuat(r));
    const e = makePrimEntry(p, false);
    for (let k = 0; k < 40; k++) {
      const x = e.minX + (e.maxX - e.minX) * r(), z = e.minZ + (e.maxZ - e.minZ) * r();
      const msg = checkColumn(e, x, z, primColumnAnalytic(e, x, z, col));
      if (msg) bad.push(`${shape} #${n} r=${p.round.toFixed(2)} (${x.toFixed(3)}, ${z.toFixed(3)}): ${msg}`);
    }
  }
  return bad.slice(0, 5);
}

describe('primColumnAnalytic against the distance function (any rotation)', () => {
  it('boxes: sharp, rounded, and rounding beyond the half extents (clamped as sdRoundBox does)', () => {
    expect(sweep('box', 1, () => 0)).toEqual([]);
    expect(sweep('box', 2, (r, s) => r() * Math.min(s.x, s.y, s.z))).toEqual([]);
    expect(sweep('box', 3, () => 1000)).toEqual([]);
  });

  it('cylinders: sharp, rounded, over-rounded', () => {
    expect(sweep('cylinder', 4, () => 0)).toEqual([]);
    expect(sweep('cylinder', 5, (r, s) => r() * Math.min(s.x, s.y))).toEqual([]);
    expect(sweep('cylinder', 6, () => 1000)).toEqual([]);
  });

  it('capsules and ellipsoids', () => {
    expect(sweep('capsule', 7, () => 0)).toEqual([]);
    expect(sweep('ellipsoid', 8, () => 0)).toEqual([]);
  });

  it('upright, upside-down and lying shapes give the same column as the search', () => {
    const col: ColumnHit = { hit: false, bottom: 0, top: 0 }, ref: ColumnHit = { hit: false, bottom: 0, top: 0 };
    const s = Math.SQRT1_2;
    const rots = [{ x: 0, y: 0, z: 0, w: 1 }, { x: 1, y: 0, z: 0, w: 0 }, { x: s, y: 0, z: 0, w: s }, { x: 0, y: 0, z: s, w: s }, { x: 0, y: s, z: 0, w: s }];
    const bad: string[] = [];
    for (const shape of ['box', 'cylinder', 'capsule', 'ellipsoid'] as const) for (const rot of rots) for (const round of [0, 3]) {
      const e = makePrimEntry(prim(shape, { x: 12, y: 7, z: 9 }, shape === 'box' || shape === 'cylinder' ? round : 0, rot), false);
      for (let i = 0; i <= 20; i++) for (let k = 0; k <= 20; k++) {
        const x = e.minX + ((e.maxX - e.minX) * (i + 0.37)) / 21, z = e.minZ + ((e.maxZ - e.minZ) * (k + 0.61)) / 21;
        primColumnAnalytic(e, x, z, col);
        primColumn(e, x, z, ref);
        // upright rounded box / cylinder: the legacy shortcut (full height over the whole cross-section)
        const shortcut = e.m11 > 0.999999 && round > 0 && (shape === 'box' || shape === 'cylinder');
        const msg = shortcut ? null : checkColumn(e, x, z, col);
        if (msg) bad.push(`${shape} rot ${JSON.stringify(rot)} round ${round}: ${msg}`);
        if (col.hit !== ref.hit) bad.push(`${shape} rot ${JSON.stringify(rot)} round ${round} (${x}, ${z}): hit ${col.hit} vs search ${ref.hit}`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  // Pre-existing (kept on purpose for equivalence with the search): an upright rounded box or cylinder reports its
  // full height [py - s.y, py + s.y] wherever the line meets its mid cross-section, also over the rounded rim
  // where the true top is up to `round` lower. Bounded by the rounding radius.
  it('upright rounded box / cylinder: the shortcut overstates the rim height by at most the rounding radius', () => {
    const col: ColumnHit = { hit: false, bottom: 0, top: 0 };
    let worst = 0;
    for (const shape of ['box', 'cylinder'] as const) {
      const e = makePrimEntry(prim(shape, { x: 12, y: 7, z: 9 }, 3, { x: 0, y: 0, z: 0, w: 1 }), false);
      for (let i = 0; i <= 200; i++) {
        const x = e.minX + ((e.maxX - e.minX) * i) / 200;
        primColumnAnalytic(e, x, e.pz, col);
        if (!col.hit) continue;
        let y = col.top;
        while (primEval(e, x, y, e.pz, null) > 0 && y > col.bottom) y -= 0.001;
        worst = Math.max(worst, col.top - y);
      }
    }
    expect(worst).toBeGreaterThan(0.5); // the approximation is real ...
    expect(worst).toBeLessThanOrEqual(3 + 0.01); // ... and bounded by the rounding
  });

  it('degenerate inputs never produce NaN ends: columns on the bounds, a flat panel, a zero-length capsule', () => {
    const col: ColumnHit = { hit: false, bottom: 0, top: 0 };
    const cases: Primitive[] = [
      prim('box', { x: 10, y: 0, z: 10 }, 0, randomQuat(lcg(9))),
      prim('box', { x: 10, y: 5, z: 10 }, -2, randomQuat(lcg(10))),
      prim('capsule', { x: 4, y: 0, z: 0 }, 0, randomQuat(lcg(11))),
      prim('cylinder', { x: 6, y: 6, z: 0 }, 6, randomQuat(lcg(12))),
    ];
    for (const p of cases) {
      const e = makePrimEntry(p, false);
      for (const [x, z] of [[e.minX, e.minZ], [e.maxX, e.maxZ], [e.px, e.pz], [e.minX, e.pz], [e.px, e.maxZ]]) {
        primColumnAnalytic(e, x, z, col);
        if (col.hit) expect(Number.isFinite(col.bottom) && Number.isFinite(col.top), `${p.shape} ${JSON.stringify(p.size)}`).toBe(true);
      }
      for (let i = 0; i < 200; i++) {
        const x = e.minX + ((e.maxX - e.minX) * i) / 199, z = e.pz;
        primColumnAnalytic(e, x, z, col);
        if (col.hit) expect(col.bottom <= col.top + 1e-9 && Number.isFinite(col.bottom + col.top), `${p.shape} x=${x}`).toBe(true);
      }
    }
  });
});
