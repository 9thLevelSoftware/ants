import { describe, expect, it } from 'vitest';
import { Box3, MeshBasicMaterial, Vector3, type BufferAttribute } from 'three';
import { RegionBuffer, type ChunkPart } from './regionBuffer';

function part(tris: number, x0 = 0): ChunkPart {
  const nv = tris * 3;
  const positions = new Float32Array(nv * 3).map((_, i) => x0 + i);
  return {
    positions, normals: new Float32Array(nv * 3), sub: new Float32Array(nv).fill(-5), nest: new Float32Array(nv * 2), vertexCount: nv,
    indices: Uint32Array.from({ length: nv }, (_, i) => i),
  };
}

const box = new Box3(new Vector3(0, 0, 0), new Vector3(128, 128, 128));

describe('RegionBuffer', () => {
  it('rewrites a chunk in place while it fits its slot, uploading only that range', () => {
    const b = new RegionBuffer(new MeshBasicMaterial(), new MeshBasicMaterial(), box);
    b.put(1, part(10));
    b.put(2, part(20, 1000));
    const gen = b.generation;
    const pos = b.mesh.geometry.getAttribute('position') as BufferAttribute;
    pos.clearUpdateRanges();
    expect(b.put(1, part(12, 500))).toBe(true); // 12 <= 15 (headroom)
    expect(b.generation).toBe(gen);
    expect(pos.updateRanges.length).toBe(1);
    expect(pos.updateRanges[0].count).toBeLessThan(pos.array.length / 2);
    expect(b.triangles).toBe(32);
    // unused slot space is degenerate: drawn triangles with distinct corners = 32
    const idx = b.mesh.geometry.getIndex()!.array;
    const dr = b.mesh.geometry.drawRange;
    let real = 0;
    for (let i = dr.start; i < dr.start + Math.min(dr.count, idx.length); i += 3) if (idx[i] !== idx[i + 1] || idx[i] !== idx[i + 2]) real++;
    expect(real).toBe(32);
  });

  it('repacks into a new geometry when a chunk outgrows the arrays, and after many removals', () => {
    const b = new RegionBuffer(new MeshBasicMaterial(), new MeshBasicMaterial(), box);
    for (let k = 0; k < 6; k++) b.put(k, part(10));
    const gen = b.generation;
    b.put(0, part(400)); // far bigger than its slot and the spare capacity
    expect(b.generation).toBeGreaterThan(gen);
    expect(b.triangles).toBe(450);
    for (let k = 0; k < 6; k++) b.remove(k);
    expect(b.empty).toBe(true);
    expect(b.triangles).toBe(0);
  });
});
