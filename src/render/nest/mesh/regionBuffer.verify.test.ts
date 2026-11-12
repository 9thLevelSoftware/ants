// Reviewer tests (render-nest): RegionBuffer must always draw exactly the live chunks' triangles, whatever sequence of
// in-place rewrites, moves to the end, removals and repacks happened.
import { describe, expect, it } from 'vitest';
import { Box3, MeshBasicMaterial, Vector3, type BufferAttribute } from 'three';
import { NEST_ATTR } from '../params';
import { RegionBuffer, regionBox, regionKey, type ChunkPart } from './regionBuffer';

/** A part whose every vertex carries (key, version, vertex index) so the drawn triangles can be traced back. */
function part(key: number, version: number, tris: number): ChunkPart {
  const nv = tris * 3;
  const positions = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) { positions[i * 3] = key; positions[i * 3 + 1] = version; positions[i * 3 + 2] = i; }
  const nest = new Float32Array(nv * NEST_ATTR);
  for (let i = 0; i < nv; i++) nest[i * NEST_ATTR + 2] = key * 1000 + version;
  return {
    positions, normals: new Float32Array(nv * 3), sub: new Float32Array(nv).fill(-5), nest, vertexCount: nv,
    indices: Uint32Array.from({ length: nv }, (_, i) => i),
  };
}

/** Drawn non-degenerate triangles as "key:version:i0,i1,i2" strings. */
function drawn(b: RegionBuffer): string[] {
  const g = b.mesh.geometry;
  const idx = g.getIndex()!.array;
  const pos = (g.getAttribute('position') as BufferAttribute).array;
  const nest = (g.getAttribute('aNest') as BufferAttribute).array;
  const out: string[] = [];
  const end = Math.min(g.drawRange.start + g.drawRange.count, idx.length);
  for (let t = g.drawRange.start; t < end; t += 3) {
    const a = idx[t], c = idx[t + 1], d = idx[t + 2];
    if (a === c && a === d) continue;
    const k = pos[a * 3], v = pos[a * 3 + 1];
    // all three corners belong to the same chunk version, and the per-vertex attribute travelled with them
    for (const x of [c, d]) { expect(pos[x * 3]).toBe(k); expect(pos[x * 3 + 1]).toBe(v); }
    expect(nest[a * NEST_ATTR + 2]).toBe(k * 1000 + v);
    out.push(`${k}:${v}:${pos[a * 3 + 2]},${pos[c * 3 + 2]},${pos[d * 3 + 2]}`);
  }
  return out.sort();
}

function expected(live: Map<number, { v: number; tris: number }>): string[] {
  const out: string[] = [];
  for (const [k, { v, tris }] of live) for (let t = 0; t < tris; t++) out.push(`${k}:${v}:${t * 3},${t * 3 + 1},${t * 3 + 2}`);
  return out.sort();
}

/** Deterministic LCG (tests only). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

describe('RegionBuffer (review)', () => {
  it('draws exactly the live parts after 600 random put/remove operations (rewrites, moves, repacks)', () => {
    const b = new RegionBuffer(new MeshBasicMaterial(), new MeshBasicMaterial(), new Box3(new Vector3(), new Vector3(1, 1, 1)));
    const live = new Map<number, { v: number; tris: number }>();
    const rnd = lcg(12345);
    let version = 0;
    for (let op = 0; op < 600; op++) {
      const key = Math.floor(rnd() * 12);
      if (rnd() < 0.25 && live.size > 0) {
        b.remove(key);
        live.delete(key);
      } else {
        // sizes vary a lot so slots overflow, move to the end, and repack
        const tris = 1 + Math.floor(rnd() * rnd() * 300);
        version++;
        b.put(key, part(key, version, tris));
        live.set(key, { v: version, tris });
      }
      if (op % 25 === 0 || op > 590) {
        expect(drawn(b)).toEqual(expected(live));
        expect(b.triangles).toBe([...live.values()].reduce((s, x) => s + x.tris, 0));
        expect(b.empty).toBe(live.size === 0);
      }
    }
  });

  it('region keys and boxes round-trip for negative chunk coordinates', () => {
    const size = 4 * 16 * 2;
    for (const [cx, cy, cz] of [[0, 0, 0], [-1, -1, -1], [-5, 3, -9], [7, -12, 4]]) {
      const k = regionKey(cx, cy, cz, 4);
      const box = regionBox(k, size, 0, new Box3());
      // the chunk's origin lies inside its region's box
      const p = new Vector3(cx * 32 + 1, cy * 32 + 1, cz * 32 + 1);
      expect(box.containsPoint(p)).toBe(true);
    }
  });
});
