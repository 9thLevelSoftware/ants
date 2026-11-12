import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/math/vec3';
import { rngFloat, rngSeed } from '@/core/rng';
import { createKernel, type Kernel } from '@/sim/kernel';
import { carveTestNest, emptyCarve, makeSceneWorld, TEST_BU, type SceneWorld } from '@/sim/kernel.testWorld';
import { createWalkerKin, walkerLetGo, walkerPlace, walkerSnapshot, walkerStep, walkerSurfaceChanged, type WalkerKin } from './walker';

const BU = TEST_BU;
const CRUISE = 6 * BU; // mm/s (directions §K)
const DT = 1 / 60;
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

let cached: { k: Kernel; scene: SceneWorld } | null = null;
function scene(): { k: Kernel; scene: SceneWorld } {
  if (cached) return cached;
  const s = makeSceneWorld(7);
  const k = createKernel(s.world, emptyCarve(BU));
  carveTestNest(k, s.nest);
  const c3 = s.nest.chambers[2];
  k.nav.setTarget('C3', { points: [c3.c], radius: 2.5 * BU });
  k.nav.setTarget('exit', { points: [s.nest.entrance], radius: 1.5 * BU });
  cached = { k, scene: s };
  return cached;
}

function walker(k: Kernel, p: Vec3, heading: Vec3, dir?: Vec3): WalkerKin {
  const w = createWalkerKin(k.walker.footOffset);
  expect(walkerPlace(k.field, w, p, { heading, dir })).toBe(true);
  return w;
}

function onLevelSet(k: Kernel, w: WalkerKin): void {
  expect(Math.abs(k.field.sample(w.pos) - w.footOffset)).toBeLessThan(0.01);
}

describe('surface walker', () => {
  it('stays on flat ground at the foot offset', () => {
    const { k } = scene();
    const w = walker(k, v(150, 20, 250), v(1, 0, 0.3));
    for (let i = 0; i < 120; i++) {
      expect(walkerStep(k.field, w, null, CRUISE, DT)).toBe('ok');
      onLevelSet(k, w);
    }
    expect(w.speed).toBeGreaterThan(0.95 * CRUISE);
    expect(w.gait).toBeGreaterThanOrEqual(0);
    expect(w.medium).toBe('surface');
  });

  it('floor-to-wall transition keeps moving up the wall without drifting sideways', () => {
    const { k, scene: s } = scene();
    const wall = s.world.prims.find((p) => p.id === s.ids.wall)!;
    const face = wall.pos.x + wall.size.x; // x = 57 mm
    const w = walker(k, v(face + 20, 20, 300), v(-1, 0, 0));
    const z0 = w.pos.z;
    let prevUpX = w.up.x, reversals = 0, prevDelta = 0;
    for (let i = 0; i < 180; i++) {
      expect(walkerStep(k.field, w, null, CRUISE, DT)).toBe('ok');
      onLevelSet(k, w);
      const delta = w.up.x - prevUpX;
      if (Math.abs(delta) > 1e-6) {
        if (prevDelta !== 0 && Math.sign(delta) !== Math.sign(prevDelta)) reversals++;
        prevDelta = delta;
      }
      prevUpX = w.up.x;
    }
    expect(w.up.x).toBeGreaterThan(0.99); // on the wall face
    expect(w.fwd.y).toBeGreaterThan(0.99); // heading straight up
    expect(w.pos.y).toBeGreaterThan(s.world.terrain.data[0] + 20);
    expect(Math.abs(w.pos.z - z0)).toBeLessThan(0.5);
    expect(reversals).toBeLessThanOrEqual(1);
  });

  it('walks over the top edge of a box and continues down the far side', () => {
    const { k, scene: s } = scene();
    const slab = s.world.prims.find((p) => p.id === s.ids.slab)!;
    const top = slab.pos.y + slab.size.y, edge = slab.pos.x + slab.size.x; // x = 650
    const w = walker(k, v(edge - 25, top + 5, 470), v(1, 0, 0));
    let sawSide = false, minF = Infinity;
    for (let i = 0; i < 400; i++) {
      const st = walkerStep(k.field, w, null, CRUISE, DT);
      expect(st).toBe('ok');
      minF = Math.min(minF, k.field.sample(w.pos));
      if (w.up.x > 0.95 && w.fwd.y < -0.95) sawSide = true;
      if (sawSide && w.up.y > 0.95) break;
    }
    expect(sawSide).toBe(true); // went down the side face
    expect(w.up.y).toBeGreaterThan(0.95); // and out onto the ground beyond
    expect(w.pos.x).toBeGreaterThan(edge);
    expect(w.pos.y).toBeLessThan(top - 20);
    expect(minF).toBeGreaterThan(0.9 * w.footOffset);
  });

  it('circles a cylinder (table leg) and stays attached', () => {
    const { k, scene: s } = scene();
    const leg = s.world.prims.find((p) => p.id === s.ids.tableLeg)!;
    const r = leg.size.x;
    const w = walker(k, v(leg.pos.x + r + 1, leg.pos.y + 10, leg.pos.z), v(0, 0, 1), v(-1, 0, 0));
    const y0 = w.pos.y;
    let angle = 0, prev = Math.atan2(w.pos.z - leg.pos.z, w.pos.x - leg.pos.x);
    for (let i = 0; i < 300; i++) {
      expect(walkerStep(k.field, w, null, CRUISE, DT)).toBe('ok');
      const a = Math.atan2(w.pos.z - leg.pos.z, w.pos.x - leg.pos.x);
      let d = a - prev;
      if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
      angle += d;
      prev = a;
      const rad = Math.hypot(w.pos.x - leg.pos.x, w.pos.z - leg.pos.z);
      expect(Math.abs(rad - (r + w.footOffset))).toBeLessThan(0.05);
    }
    expect(Math.abs(angle)).toBeGreaterThan(4 * Math.PI); // two full turns
    expect(Math.abs(w.pos.y - y0)).toBeLessThan(0.5); // a horizontal geodesic stays level
  });

  it('walks onto the ceiling of a chamber and along it upside down', () => {
    const { k, scene: s } = scene();
    const c1 = s.nest.chambers[0];
    const w = walker(k, v(c1.c.x - 8, c1.c.y - 4, c1.c.z), v(1, 0, 0));
    let onCeiling = 0;
    for (let i = 0; i < 600; i++) {
      expect(walkerStep(k.field, w, null, CRUISE, DT)).toBe('ok');
      onLevelSet(k, w);
      if (w.up.y < -0.95) onCeiling++;
      expect(w.medium).toBe('cavity');
    }
    expect(onCeiling).toBeGreaterThan(30);
  });

  it('descends the entrance shaft to the deepest chamber and returns along BFS fields', () => {
    const { k, scene: s } = scene();
    const ent = s.nest.entrance;
    const w = walker(k, v(ent.x - 22, 20, ent.z - 14), v(1, 0, 0.6));
    const target = v(0, 0, 0), want = v(0, 0, 0);
    const rng = rngSeed(3);
    const run = (field: string, arrive: number, maxTicks: number): number => {
      let blocked = 0;
      for (let t = 0; t < maxTicks; t++) {
        const d = k.nav.lookahead(field, w.pos, 4, target);
        if (d <= arrive) return t;
        if (d === Infinity) { want.x = ent.x - w.pos.x; want.y = ent.y - 6 - w.pos.y; want.z = ent.z - w.pos.z; }
        else { want.x = target.x - w.pos.x; want.y = target.y - w.pos.y; want.z = target.z - w.pos.z; }
        if (blocked > 2) { want.x += (rngFloat(rng) - 0.5) * 40; want.z += (rngFloat(rng) - 0.5) * 40; }
        walkerSnapshot(w);
        let st = 'ok';
        for (let sub = 0; sub < 6; sub++) st = walkerStep(k.field, w, want, CRUISE, DT);
        blocked = st === 'blocked' ? blocked + 1 : 0;
        expect(k.field.sample(w.pos)).toBeGreaterThan(0.3 * w.footOffset);
      }
      return -1;
    };
    const down = run('C3', 3 * BU, 3000);
    expect(down).toBeGreaterThan(0);
    expect(w.medium).toBe('cavity');
    expect(w.pos.y).toBeLessThan(s.nest.chambers[2].c.y + 10);
    const up = run('exit', BU, 3000);
    expect(up).toBeGreaterThan(0);
    // out of the hole: a few more steps along the exit direction put the walker on the open surface
    expect(Math.hypot(w.pos.x - ent.x, w.pos.z - ent.z)).toBeLessThan(4 * BU);
  });

  it('lets go from a table underside, falls and lands on the ground', () => {
    const { k, scene: s } = scene();
    const top = s.world.prims.find((p) => p.id === s.ids.tableTop)!;
    const under = top.pos.y - top.size.y;
    const w = walker(k, v(top.pos.x + 20, under - 2, top.pos.z + 10), v(1, 0, 0), v(0, 1, 0));
    expect(w.up.y).toBeLessThan(-0.99);
    walkerLetGo(k.field, w);
    let st = 'falling', n = 0;
    while (st !== 'landed' && n++ < 400) st = walkerStep(k.field, w, null, 0, DT);
    expect(st).toBe('landed');
    expect(w.up.y).toBeGreaterThan(0.95);
    expect(Math.abs(k.field.sample(w.pos) - w.footOffset)).toBeLessThan(0.05);
    expect(w.pos.y).toBeLessThan(under - 30);
  });

  it('re-attaches after a nearby carve and lets go when buried, then pops out', () => {
    const { k } = scene();
    const w = walker(k, v(120, 20, 120), v(1, 0, 0));
    const floor = v(w.pos.x, w.pos.y - w.footOffset, w.pos.z);
    // a small dig just ahead of the feet: still attached
    k.carveSphere(v(floor.x + 3, floor.y - 1, floor.z), 1.2);
    expect(walkerSurfaceChanged(k.field, w)).toBe(true);
    onLevelSet(k, w);
    // a big pit under the walker: lets go and lands in the pit
    k.carveSphere(v(floor.x, floor.y - 6, floor.z), 8);
    expect(walkerSurfaceChanged(k.field, w)).toBe(false);
    let st = 'falling', n = 0;
    while (st !== 'landed' && n++ < 400) st = walkerStep(k.field, w, null, 0, DT);
    expect(st).toBe('landed');
    onLevelSet(k, w);
    // bury it: fill the pit; the walker falls "inside" and pops out on landing
    k.fillSphere(v(floor.x, floor.y - 6, floor.z), 9);
    walkerStep(k.field, w, null, CRUISE, DT);
    n = 0;
    while (w.medium === 'air' && n++ < 50) walkerStep(k.field, w, null, 0, DT);
    expect(w.medium).not.toBe('air');
    onLevelSet(k, w);
  });

  it('ignores NaN input and never writes NaN', () => {
    const { k } = scene();
    const w = walker(k, v(160, 20, 160), v(0, 0, 1));
    expect(walkerStep(k.field, w, v(NaN, 0, 1), CRUISE, DT)).toBe('ok');
    expect(walkerStep(k.field, w, null, NaN, DT)).toBe('ok');
    expect(walkerStep(k.field, w, null, CRUISE, NaN)).toBe('ok');
    expect(Number.isFinite(w.pos.x + w.pos.y + w.pos.z + w.fwd.x + w.up.y)).toBe(true);
  });

  it('caps the distance of one call (a bogus speed * dt moves at most maxStepDist)', () => {
    const { k } = scene();
    const w = walker(k, v(160, 20, 160), v(0, 0, 1));
    const start = v(w.pos.x, w.pos.y, w.pos.z);
    const st = walkerStep(k.field, w, null, 1e9, 0.1);
    expect(st === 'ok' || st === 'blocked').toBe(true);
    const moved = Math.hypot(w.pos.x - start.x, w.pos.y - start.y, w.pos.z - start.z);
    expect(moved).toBeGreaterThan(0.5 * k.walker.maxStepDist);
    expect(moved).toBeLessThanOrEqual(1.01 * k.walker.maxStepDist);
    onLevelSet(k, w);
  });

  it('soak: 200 walkers x 5,000 random steps keep f >= 0.3 footOffset and never NaN', () => {
    const { k, scene: s } = scene();
    const rng = rngSeed(2024);
    const ws: WalkerKin[] = [];
    const spots: Vec3[] = [
      ...s.nest.chambers.map((c) => c.c), s.nest.entrance, v(340, -20, 310), v(300, -60, 330),
      ...s.world.prims.map((p) => v(p.pos.x + p.size.x + 3, p.pos.y, p.pos.z)),
    ];
    for (let i = 0; ws.length < 200 && i < 2000; i++) {
      const surface = i % 3 === 0;
      const base = surface ? v(rngFloat(rng) * 680 + 10, 30, rngFloat(rng) * 680 + 10) : spots[i % spots.length];
      const p = v(base.x + (rngFloat(rng) - 0.5) * 6, base.y + (rngFloat(rng) - 0.5) * 6, base.z + (rngFloat(rng) - 0.5) * 6);
      const w = createWalkerKin(k.walker.footOffset);
      const a = rngFloat(rng) * 6.283;
      if (walkerPlace(k.field, w, p, { heading: v(Math.cos(a), 0, Math.sin(a)) })) ws.push(w);
    }
    expect(ws.length).toBe(200);
    const dir = v(0, 0, 0);
    let minRatio = Infinity, failed = 0, letGo = 0;
    for (const w of ws) {
      for (let step = 0; step < 5000; step++) {
        if (step % 25 === 0) { dir.x = rngFloat(rng) - 0.5; dir.y = rngFloat(rng) - 0.5; dir.z = rngFloat(rng) - 0.5; }
        if (rngFloat(rng) < 0.002) { walkerLetGo(k.field, w); letGo++; }
        const st = walkerStep(k.field, w, step % 25 === 0 ? dir : null, rngFloat(rng) * 2 * CRUISE, 0.02 + rngFloat(rng) * 0.08);
        if (st === 'failed') failed++;
        const f = k.field.sample(w.pos);
        const ratio = f / w.footOffset;
        if (ratio < minRatio) minRatio = ratio;
        if (!(ratio >= 0.3) || !Number.isFinite(w.pos.x + w.pos.y + w.pos.z + w.up.x + w.up.y + w.up.z + w.fwd.x + w.fwd.y + w.fwd.z)) {
          throw new Error(`walker invariant broken: f=${f} pos=${JSON.stringify(w.pos)} status=${st}`);
        }
      }
    }
    expect(minRatio).toBeGreaterThanOrEqual(0.3);
    expect(letGo).toBeGreaterThan(100);
    // failures (reverted steps) must stay rare
    expect(failed).toBeLessThan(200 * 5000 * 0.001);
  }, 120_000);
});
