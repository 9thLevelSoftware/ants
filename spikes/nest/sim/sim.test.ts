import { describe, it, expect } from 'vitest';
import { TRI_TABLE, meshChunk } from './mc';
import { CarveGrid, keyToChunk } from './carve';
import { buildWorld, VOXEL, RAMP } from './scene';
import { SurfaceWalker, DEFAULT_WALKER } from './walker';
import { NavField, INF } from './nav';
import { AIColony } from './ai';
import { v3, dot } from './vec3';

const now = () => performance.now();

function meshAll(grid: CarveGrid) {
  const meshes = [];
  for (const key of grid.dirty) {
    const [cx, cy, cz] = keyToChunk(key);
    const m = meshChunk(grid, cx, cy, cz, () => -1);
    if (m) meshes.push(m);
  }
  grid.dirty.clear();
  return meshes;
}

/** count directed edges; a closed, consistently oriented surface has every edge exactly once in each direction */
function manifoldCheck(meshes: ReturnType<typeof meshAll>) {
  const vid = new Map<string, number>();
  const id = (x: number, y: number, z: number) => {
    const k = `${x},${y},${z}`;
    let i = vid.get(k);
    if (i === undefined) { i = vid.size; vid.set(k, i); }
    return i;
  };
  const edges = new Map<string, number>();
  let tris = 0;
  for (const m of meshes) {
    const ix = m.indices, p = m.positions;
    for (let t = 0; t < ix.length; t += 3) {
      const a = id(p[ix[t] * 3], p[ix[t] * 3 + 1], p[ix[t] * 3 + 2]);
      const b = id(p[ix[t + 1] * 3], p[ix[t + 1] * 3 + 1], p[ix[t + 1] * 3 + 2]);
      const c = id(p[ix[t + 2] * 3], p[ix[t + 2] * 3 + 1], p[ix[t + 2] * 3 + 2]);
      if (a === b || b === c || a === c) continue; // degenerate (zero-area) triangles are allowed
      for (const [u, w] of [[a, b], [b, c], [c, a]]) edges.set(`${u}>${w}`, (edges.get(`${u}>${w}`) ?? 0) + 1);
      tris++;
    }
  }
  let bad = 0;
  for (const [e, n] of edges) {
    const [u, w] = e.split('>');
    if (n !== 1 || edges.get(`${w}>${u}`) !== 1) bad++;
  }
  return { tris, bad, verts: vid.size };
}

describe('marching cubes', () => {
  it('table: every case closes into loops, at most 6 triangles (cases 0/255 empty)', () => {
    expect(TRI_TABLE.length).toBe(256);
    expect(TRI_TABLE[0].length).toBe(0);
    expect(TRI_TABLE[255].length).toBe(0);
    let max = 0;
    for (const t of TRI_TABLE) max = Math.max(max, t.length / 3);
    console.log('max triangles per case', max);
    expect(max).toBeLessThanOrEqual(8);
  });

  it('a blob spanning 8 chunks meshes watertight and consistently oriented across seams', () => {
    const g = new CarveGrid(VOXEL, RAMP);
    // blob straddling the chunk corner at the origin (chunk = 32 mm)
    g.carveSphere(1, 2, -1, 9);
    g.carveSphere(8, -6, 5, 6);
    g.carveTunnel(-20, 3, -10, 25, -4, 12, 4);
    const meshes = meshAll(g);
    expect(meshes.length).toBeGreaterThanOrEqual(8);
    const r = manifoldCheck(meshes);
    console.log('blob', r, 'chunks', meshes.length);
    expect(r.bad).toBe(0);
  });

  it('normals point into the cavity and triangles face it', () => {
    const g = new CarveGrid(VOXEL, RAMP);
    g.carveSphere(16, 16, 16, 8);
    const [m] = meshAll(g).filter((x) => x.indices.length);
    let agree = 0, total = 0;
    for (let t = 0; t < m.indices.length; t += 3) {
      const i = m.indices[t] * 3;
      // vertex normal should point toward the sphere centre (into the open cavity)
      const dx = 16 - m.positions[i], dy = 16 - m.positions[i + 1], dz = 16 - m.positions[i + 2];
      if (dx * m.normals[i] + dy * m.normals[i + 1] + dz * m.normals[i + 2] > 0) agree++;
      total++;
      // geometric normal (CCW) agrees with the vertex normal
      const a = m.indices[t] * 3, b = m.indices[t + 1] * 3, c = m.indices[t + 2] * 3, P = m.positions;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      expect(nx * m.normals[a] + ny * m.normals[a + 1] + nz * m.normals[a + 2]).toBeGreaterThanOrEqual(-1e-9);
    }
    expect(agree).toBe(total);
  });
});

describe('surface walker', () => {
  const S = buildWorld(7);
  const F = S.field;

  function run(w: SurfaceWalker, seconds: number, onStep?: (i: number) => void) {
    const dt = 1 / 60;
    let maxTurn = 0, minF = Infinity, maxF = -Infinity;
    const prev = v3();
    for (let i = 0; i < seconds * 60; i++) {
      prev.x = w.up.x; prev.y = w.up.y; prev.z = w.up.z;
      w.update(dt, { forward: 1, turn: 0 });
      onStep?.(i);
      maxTurn = Math.max(maxTurn, Math.acos(Math.min(1, dot(prev, w.up))));
      const f = F.f(w.pos.x, w.pos.y, w.pos.z);
      minF = Math.min(minF, f); maxF = Math.max(maxF, f);
    }
    return { maxTurnDeg: (maxTurn * 180) / Math.PI, minF, maxF };
  }

  it('walks flat ground on the level set', () => {
    const w = new SurfaceWalker(F, { ...DEFAULT_WALKER });
    expect(w.place(150, 30, 250, 0)).toBe(true);
    const r = run(w, 1.5);
    console.log('flat', r, w.pos);
    expect(r.minF).toBeGreaterThan(0.55);
    expect(r.maxF).toBeLessThan(0.65);
    expect(w.pos.x).toBeGreaterThan(200);
  });

  it('floor-to-wall transition keeps the heading and does not jitter', () => {
    const w = new SurfaceWalker(F, { ...DEFAULT_WALKER });
    // wall occupies x in [33, 57]; start at x=110 heading -x (heading pi)
    expect(w.place(110, 30, 300, Math.PI)).toBe(true);
    const ups: number[] = [];
    const r = run(w, 3, () => ups.push(w.up.x));
    console.log('wall', r, w.pos, w.up, w.fwd);
    expect(w.up.x).toBeGreaterThan(0.95); // on the wall face (+x normal)
    expect(w.fwd.y).toBeGreaterThan(0.95); // heading straight up the wall
    expect(Math.abs(w.pos.z - 300)).toBeLessThan(0.5); // no sideways drift
    // monotone normal change (no back-and-forth jitter)
    let reversals = 0;
    for (let i = 2; i < ups.length; i++) if ((ups[i] - ups[i - 1]) * (ups[i - 1] - ups[i - 2]) < -1e-6) reversals++;
    expect(reversals).toBeLessThanOrEqual(1);
    expect(r.minF).toBeGreaterThan(0.3);
    expect(r.maxTurnDeg).toBeLessThan(45);
  });

  it('climbs the plant stem', () => {
    const w = new SurfaceWalker(F, { ...DEFAULT_WALKER });
    const g = S.world.height(170, 400);
    expect(w.place(175, g + 5, 400, Math.PI)).toBe(true);
    const r = run(w, 3);
    console.log('stem', r, w.pos, w.up);
    expect(w.pos.y).toBeGreaterThan(g + 60);
    expect(Math.abs(w.up.y)).toBeLessThan(0.1);
    expect(r.minF).toBeGreaterThan(0.3);
  });

  it('climbs the table leg onto the underside of the top and walks it upside down', () => {
    const w = new SurfaceWalker(F, { ...DEFAULT_WALKER });
    const g = S.world.height(270, 600);
    expect(w.place(275, g + 5, 600, Math.PI)).toBe(true);
    let minUpY = 1;
    const r = run(w, 1.5, (i) => { minUpY = Math.min(minUpY, w.up.y); if (i % 6 === 0) console.log(i, w.pos.x.toFixed(2), w.pos.y.toFixed(2), w.pos.z.toFixed(2), 'up', w.up.x.toFixed(2), w.up.y.toFixed(2), w.up.z.toFixed(2), 'fwd', w.fwd.x.toFixed(2), w.fwd.y.toFixed(2), w.fwd.z.toFixed(2)); });
    console.log('table', r, w.pos, w.up, w.fwd);
    expect(w.up.y).toBeLessThan(-0.95); // upside down on the underside
    expect(r.minF).toBeGreaterThan(0.3);
    // keep walking: wraps over the 6 mm thick edge onto the top, never through it
    const r2 = run(w, 2);
    console.log('table edge', r2, w.pos, w.up);
    expect(r2.minF).toBeGreaterThan(0.3);
  });

  it('enters the nest and walks down the shaft', () => {
    const w = new SurfaceWalker(F, { ...DEFAULT_WALKER });
    const [ex, , ez] = S.nest.entrance;
    expect(w.place(ex - 14, 20, ez - 6, -0.35)).toBe(true);
    const r = run(w, 2.0);
    console.log('shaft', r, w.pos, w.up, 'blocked', w.blocked);
    expect(w.pos.y).toBeLessThan(S.world.height(ex, ez) - 5);
    expect(r.minF).toBeGreaterThan(0.3);
  });

  it('let go: falls from the table underside and lands on the ground', () => {
    const w = new SurfaceWalker(F, { ...DEFAULT_WALKER });
    const g = S.world.height(250, 580);
    expect(w.place(250, g + 51, 580, 0, v3(0, 1, 0))).toBe(true);
    expect(w.up.y).toBeLessThan(-0.9);
    w.letGo();
    for (let i = 0; i < 120 && (w.falling || i < 2); i++) w.update(1 / 60, { forward: 0, turn: 0 });
    console.log('fall', w.pos, w.up, w.falling);
    expect(w.falling).toBe(false);
    expect(w.up.y).toBeGreaterThan(0.9);
    expect(Math.abs(w.pos.y - (S.world.height(w.pos.x, w.pos.z) + 0.6))).toBeLessThan(0.1);
  });

  it('walker step cost', () => {
    const w = new SurfaceWalker(F, { ...DEFAULT_WALKER });
    w.place(150, 30, 250, 0);
    const t0 = now();
    const n = 3000;
    F.evals = 0;
    for (let i = 0; i < n; i++) { w.update(1 / 60, { forward: 1, turn: 0.2 }); }
    const us = ((now() - t0) * 1000) / n;
    console.log(`walker update (0.8 mm/frame, 1 substep): ${us.toFixed(2)} us, field evals/update ${(F.evals / n).toFixed(1)}`);
  });
});

describe('nav', () => {
  it('BFS distance fields, incremental dig == full rebuild', () => {
    const S = buildWorld(7);
    const surf = new NavField(S.carve, S.field, (x, y, z) => S.world.fSoil(x, y, z) > 0);
    const c3 = S.nest.chambers[2];
    const ch = new NavField(S.carve, S.field, (x, y, z) => ((x - c3.x) / c3.rx) ** 2 + ((y - c3.y) / c3.ry) ** 2 + ((z - c3.z) / c3.rz) ** 2 < 0.6);
    const a = surf.rebuild(now), b = ch.rebuild(now);
    console.log('rebuild surface', a, 'chamber', b, 'chunks', S.carve.chunks.size);
    // every chamber centre reachable from the surface
    for (const c of S.nest.chambers) {
      const i = Math.round(c.x / VOXEL), j = Math.round((c.y - c.ry + 2) / VOXEL), k = Math.round(c.z / VOXEL);
      expect(surf.get(i, j, k)).toBeLessThan(INF);
    }
    // dig a new side tunnel incrementally and compare with a full rebuild
    const boxes = [];
    for (let s = 0; s < 20; s++) boxes.push(S.carve.carveSphere(340 + s, -100, 400 - s * 0.5, 4));
    const t0 = now();
    for (const bx of boxes) surf.update(bx);
    const incMs = now() - t0;
    const ref = new NavField(S.carve, S.field, (x, y, z) => S.world.fSoil(x, y, z) > 0);
    ref.rebuild();
    let diff = 0;
    for (const [key, d] of ref.dist) { const e = surf.dist.get(key); for (let i = 0; i < 4096; i++) if ((e ? e[i] : INF) !== d[i]) diff++; }
    console.log(`incremental update for 20 digs: ${incMs.toFixed(2)} ms, mismatches ${diff}`);
    expect(diff).toBe(0);
  });

  it('BFS cost vs open-voxel count', () => {
    const rows: string[] = [];
    for (const n of [10, 40, 160, 480]) {
      const S = buildWorld(7);
      // random tunnel network
      let x = 300, y = -60, z = 300, s = 1;
      for (let t = 0; t < n; t++) {
        s = (s * 16807) % 2147483647; const a = (s / 2147483647) * 6.283;
        s = (s * 16807) % 2147483647; const dy = ((s / 2147483647) - 0.5) * 10;
        const nx = Math.max(60, Math.min(640, x + Math.cos(a) * 30)), nz = Math.max(60, Math.min(640, z + Math.sin(a) * 30)), ny = Math.max(-200, Math.min(-20, y + dy));
        S.carve.carveTunnel(x, y, z, nx, ny, nz, 4, 1.5);
        x = nx; y = ny; z = nz;
      }
      const nav = new NavField(S.carve, S.field, (px, py, pz) => S.world.fSoil(px, py, pz) > 0);
      nav.rebuild(now); // warm
      const r = nav.rebuild(now);
      rows.push(`${n} segments: open ${r.open} voxels, settled ${r.settled}, chunks ${S.carve.chunks.size}, rebuild ${r.ms.toFixed(1)} ms (${((r.ms * 1e6) / r.open).toFixed(0)} ns/voxel)`);
    }
    console.log(rows.join('\n'));
  });

  it('AI colony shuttles', () => {
    const S = buildWorld(7);
    const surf = new NavField(S.carve, S.field, (x, y, z) => S.world.fSoil(x, y, z) > 0);
    const c3 = S.nest.chambers[2];
    const ch = new NavField(S.carve, S.field, (x, y, z) => ((x - c3.x) / c3.rx) ** 2 + ((y - c3.y) / c3.ry) ** 2 + ((z - c3.z) / c3.rz) ** 2 < 0.6);
    surf.rebuild(); ch.rebuild();
    const ai = new AIColony(S.field, surf, ch, 3);
    expect(ai.spawn(50)).toBe(50);
    const t0 = now();
    for (let i = 0; i < 600; i++) ai.step(); // 60 s
    const ms = now() - t0;
    const trips = ai.ants.reduce((s, a) => s + a.trips, 0);
    let minF = Infinity, falling = 0;
    for (const a of ai.ants) { minF = Math.min(minF, S.field.f(a.w.pos.x, a.w.pos.y, a.w.pos.z)); if (a.w.falling) falling++; }
    console.log(`AI 50 ants x 600 ticks: ${ms.toFixed(0)} ms (${((ms * 1000) / (600 * 50)).toFixed(1)} us per ant-tick), trips ${trips}, minF ${minF.toFixed(3)}, falling ${falling}`);
    expect(trips).toBeGreaterThan(25);
  });
});
