// The flat grid every clipmap level draws: (n+1)^2 vertices at integer grid coordinates in position.xz (y = 0);
// the vertex shader turns them into world positions. All quads use the same diagonal so that a fully morphed
// fine level collapses onto exactly the triangles of the next coarser level.
import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';

export function createGridGeometry(n: number): BufferGeometry {
  const verts = (n + 1) * (n + 1);
  const pos = new Float32Array(verts * 3);
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const k = (j * (n + 1) + i) * 3;
    pos[k] = i; pos[k + 1] = 0; pos[k + 2] = j;
  }
  const idx = verts > 65535 ? new Uint32Array(n * n * 6) : new Uint16Array(n * n * 6);
  let o = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
    idx[o++] = a; idx[o++] = c; idx[o++] = b;
    idx[o++] = b; idx[o++] = c; idx[o++] = d;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setIndex(new BufferAttribute(idx, 1));
  // the real extent is decided in the shader; the meshes are never frustum culled
  g.boundingSphere = new Sphere(new Vector3(), 1e9);
  return g;
}
