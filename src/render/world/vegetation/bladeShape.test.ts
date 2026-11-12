// Grass at ant height: the camera inside a mown lawn, the possessed ant 4.5 BU ahead. Evaluates the real blade mesh
// topology (rows x 3 vertices + tip, linear interpolation like the GPU) with the CPU twin of the vertex shader.
import { describe, expect, it } from 'vitest';
import { blockContext } from '../decor/blockContext';
import { GroundView } from '../decor/ground';
import { BLADE_STRIDE } from '../decor/instances';
import { buildTestWorld } from '../decor/testWorld';
import { blockRef } from '../decor/tiles';
import { PARTING } from '../decor/tuning';
import { bladeFragFade, bladeVertex, grassLodKeep, partEnd, type BladeView } from './bladeShape';
import { placeGrass } from './grassPlacement';

const world = buildTestWorld();
const ground = new GroundView(world);
const blades = placeGrass(blockContext(ground, blockRef(0, 0, 4)));
const BU = 4;

/** Triangles of the blade mesh in (s, h) parameter space (same topology as grassMesh.ts). */
function bladeTris(rows: number): [number, number][][] {
  const v = (r: number, c: number): [number, number] => [c - 1, r / rows];
  const tris: [number, number][][] = [];
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < 2; c++) {
    tris.push([v(r, c), v(r, c + 1), v(r + 1, c)], [v(r, c + 1), v(r + 1, c + 1), v(r + 1, c)]);
  }
  for (let c = 0; c < 2; c++) tris.push([v(rows - 1, c), v(rows - 1, c + 1), [0, 1]]);
  return tris;
}

function segDist(p: { x: number; y: number; z: number }, a: BladeView['cam'], b: BladeView['cam']): number {
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, l2 = ab.x ** 2 + ab.y ** 2 + ab.z ** 2;
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y + (p.z - a.z) * ab.z) / l2));
  return Math.hypot(p.x - a.x - ab.x * t, p.y - a.y - ab.y * t, p.z - a.z - ab.z * t);
}

function scan(view: BladeView, rows: number, cb: (p: { x: number; y: number; z: number }, fade: number) => void): void {
  const tris = bladeTris(rows);
  for (let o = 0; o < blades.length; o += BLADE_STRIDE) {
    if (Math.hypot(blades[o] - view.cam.x, blades[o + 2] - view.cam.z) > 160) continue;
    for (const t of tris) {
      const vs = t.map(([s, h]) => bladeVertex(blades, o, s, h, view));
      for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6 - i; j++) {
        const w0 = i / 6, w1 = j / 6, w2 = 1 - w0 - w1;
        const p = { x: vs[0].x * w0 + vs[1].x * w1 + vs[2].x * w2, y: vs[0].y * w0 + vs[1].y * w1 + vs[2].y * w2, z: vs[0].z * w0 + vs[1].z * w1 + vs[2].z * w2 };
        cb(p, Math.min(vs[0].fade * w0 + vs[1].fade * w1 + vs[2].fade * w2, bladeFragFade(p.x, p.y, p.z, view)));
      }
    }
  }
}

describe('grass at ant height', () => {
  const sx = 600, sz = 600;
  const subject = { x: sx, y: ground.height(sx, sz) + 2, z: sz };
  const cam = { x: sx - 4.5 * BU * Math.cos(0.3), y: subject.y + 4.5 * BU * Math.sin(0.3) + 1, z: sz + 3 };
  const view: BladeView = { cam, subject, part: true, bu: BU, time: 2, windDir: { x: 0.8, z: -0.6 }, wind: 0.12, density: 1 };

  it('there are blades all around and above the camera (a forest of grass)', () => {
    let above = 0;
    scan(view, 7, (p, f) => { if (f > 0.5 && p.y > cam.y + 20) above++; });
    expect(above).toBeGreaterThan(1000);
  });

  it('no visible blade passes through or next to the camera', () => {
    let worst = Infinity;
    scan(view, 7, (p, f) => { if (f > 0.02) worst = Math.min(worst, Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z)); });
    expect(worst).toBeGreaterThan(PARTING.eyeNearBU * BU * 0.95);
  });

  it('the line of sight to the subject is clear (nothing visible within 0.75 BU of it)', () => {
    const end = partEnd(view);
    let hits = 0;
    scan(view, 7, (p, f) => { if (f > 0.5 && segDist(p, cam, subject) < 0.75 * BU) hits++; });
    expect(hits).toBe(0);
    expect(Math.hypot(end.x - subject.x, end.y - subject.y, end.z - subject.z)).toBeCloseTo(PARTING.beyondBU * BU, 5);
  });

  it('pulled back to 12 BU around the lawn: always clear with parting, often blocked without', () => {
    let withPart = 0, without = 0;
    for (let i = 0; i < 12; i++) {
      const tx = 300 + (i % 4) * 140, tz = 300 + Math.floor(i / 4) * 160, yaw = i * 0.9;
      const sub = { x: tx, y: ground.height(tx, tz) + 2, z: tz };
      const far = { x: tx - 12 * BU * Math.cos(yaw), y: sub.y + 12 * BU * 0.25, z: tz - 12 * BU * Math.sin(yaw) };
      const v2: BladeView = { ...view, cam: far, subject: sub };
      scan(v2, 7, (p, f) => { if (f > 0.5 && segDist(p, far, sub) < 0.75 * BU) withPart++; });
      scan({ ...v2, part: false }, 7, (p, f) => { if (f > 0.5 && segDist(p, far, sub) < 0.75 * BU) without++; });
    }
    expect(withPart).toBe(0);
    expect(without).toBeGreaterThan(20);
  });

  it('density LOD keeps everything near the camera and thins with distance', () => {
    expect(grassLodKeep(100, BU)).toBe(1);
    expect(grassLodKeep(2000, BU)).toBeLessThan(0.15);
    expect(grassLodKeep(1000, BU)).toBeGreaterThan(grassLodKeep(2000, BU));
  });
});
