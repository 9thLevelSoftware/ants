/**
 * Large background shapes that sell the scale: tree trunks, shrub masses, a garden wall, a distant lamp.
 * They live 1.5-9 m from the subject, so the depth of field and the haze turn them into soft shapes; geometry and
 * shading can be cheap (low poly, vertex colours, triplanar bark/brick at metre scale).
 */
import { Color, CylinderGeometry, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, BoxGeometry, Vector3 } from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, vnoise3 } from './rng';
import { surface } from './shaders';
import type { TextureSet } from './textures';

export function buildBackground(tex: TextureSet) {
  const group = new Group(); group.name = 'background';
  const rnd = mulberry32(77);
  // tree trunks (bark, triplanar at 0.6 m tiles)
  const bark = new MeshStandardMaterial({ color: new Color(0.85, 0.82, 0.8), roughness: 1 });
  surface(bark, { proj: 'triplanar', layerA: { tex: tex.mats.bark_oak!, scale: 700, normalScale: 1.2 }, wetDarken: 0.55 });
  const trunks: [number, number, number][] = [[-2300, -4600, 230], [3600, -7400, 320], [-5600, -8600, 280], [1200, -12500, 380]];
  for (const [x, z, r] of trunks) {
    const g = new CylinderGeometry(r * 0.92, r * 1.15, 9000, 28, 12, true); g.translate(x, 4500 - 40, z);
    // root flare
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i); if (y < 600) { const f = 1 + 0.6 * Math.pow(1 - y / 600, 2); p.setX(i, x + (p.getX(i) - x) * f); p.setZ(i, z + (p.getZ(i) - z) * f); }
    }
    g.computeVertexNormals();
    const m = new Mesh(g, bark); m.castShadow = false; m.receiveShadow = false; group.add(m);
  }
  // shrub / hedge masses: lumpy icospheres, leafy green with vertex-colour noise
  const foliage = new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: false });
  const shrubs: [number, number, number, number][] = [
    [-3100, -3600, 900, 650], [-900, -7600, 1300, 1000], [1500, -6300, 800, 650], [4200, -4600, 1100, 900], [-5400, -5600, 1500, 1200],
  ];
  // hedge: a row of overlapping lumps in front of the garden wall
  for (let x = -14000; x <= 14000; x += 1100) shrubs.push([x + (rnd() - 0.5) * 500, -9600 + (rnd() - 0.5) * 600, 900 + rnd() * 500, 1300 + rnd() * 700]);
  const parts = [];
  for (const [x, z, r, h] of shrubs) {
    let g = new IcosahedronGeometry(1, 4); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g) as typeof g;
    const p = g.getAttribute('position'); const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const v = new Vector3(p.getX(i), p.getY(i), p.getZ(i));
      const n = vnoise3(v.x * 1.6 + x, v.y * 1.6, v.z * 1.6 + z) * 0.6 + vnoise3(v.x * 5, v.y * 5, v.z * 5) * 0.25 + vnoise3(v.x * 13, v.y * 13, v.z * 13) * 0.08;
      v.multiplyScalar(0.75 + n - 0.2); v.set(v.x * r, Math.max(v.y * h, -0.2 * h) + h * 0.55, v.z * r);
      p.setXYZ(i, v.x + x, v.y, v.z + z);
      const t = n * 1.5; const c = new Color(0.02 + 0.025 * t, 0.045 + 0.05 * t + rnd() * 0.01, 0.012 + 0.012 * t);
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new (p.constructor as typeof import('three').BufferAttribute)(col, 3));
    g.computeVertexNormals(); parts.push(g);
  }
  const shrubMesh = new Mesh(mergeGeometries(parts)!, foliage); group.add(shrubMesh);
  // garden wall (brick)
  const brick = new MeshStandardMaterial({ color: new Color(0.9, 0.86, 0.84), roughness: 1 });
  surface(brick, { proj: 'triplanar', layerA: { tex: tex.mats.brick!, scale: 900, normalScale: 1 }, macro: 0.15, wetDarken: 0.6 });
  const wg = new BoxGeometry(30000, 1800, 300); wg.translate(0, 900 - 30, -11000);
  group.add(new Mesh(wg, brick));
  // night lamps on the wall (emissive; only visible in the night variant) -> big bokeh discs
  const lampMat = new MeshBasicMaterial({ color: new Color(1.0, 0.55, 0.2).multiplyScalar(3), fog: false });
  const lamps = new Group(); lamps.name = 'lamps';
  for (const [x, y] of [[-2600, 1700], [3400, 1600]] as const) {
    const s = new Mesh(new SphereGeometry(70, 16, 12), lampMat); s.position.set(x, y, -10800); lamps.add(s);
  }
  const windowMat = new MeshBasicMaterial({ color: new Color(1.0, 0.7, 0.35).multiplyScalar(6), fog: false });
  const win = new Mesh(new BoxGeometry(1100, 700, 10), windowMat); win.position.set(800, 2500, -16000); lamps.add(win);
  const bollardMat = new MeshStandardMaterial({ color: new Color(0.05, 0.05, 0.05), roughness: 0.5 });
  for (const [x, z, h] of [[-300, -3200, 750], [1900, -4300, 900], [700, -6800, 900], [-2300, -6000, 800]] as const) {
    const post = new Mesh(new CylinderGeometry(30, 36, h, 16), bollardMat); post.position.set(x, h / 2, z);
    const head = new Mesh(new CylinderGeometry(45, 45, 70, 16), new MeshBasicMaterial({ color: new Color(1.0, 0.5, 0.16).multiplyScalar(1.6), fog: false }));
    head.position.set(x, h + 35, z); lamps.add(post, head);
  }
  lamps.visible = false;
  group.add(lamps);
  return { group, lamps, mats: [bark, foliage, brick] };
}
export const _sphere = SphereGeometry;
