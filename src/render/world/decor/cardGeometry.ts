// Shared base geometry of draped items: a (nu x nv)-quad card in -1..1 (x along the item, y across). The vertex
// shader places and drapes it; finer cards near the camera follow the ground's facets more closely.
import { BufferAttribute } from 'three';
import type { BaseGeometry } from './decorBlock';

export function cardGeometry(nu: number, nv: number): BaseGeometry {
  const pos: number[] = [], idx: number[] = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) pos.push(-1 + (2 * i) / nu, -1 + (2 * j) / nv, 0);
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  return { position: new BufferAttribute(new Float32Array(pos), 3), index: new BufferAttribute(new Uint16Array(idx), 1), tris: idx.length / 3 };
}
