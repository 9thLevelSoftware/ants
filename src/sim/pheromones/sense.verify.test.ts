// Reviewer regression tests (phero task, AC3 and AC8 beyond the implementer's cases): trail following on a
// ceiling, on slopes whose trail crosses vertical cell layers, at negative coordinates and with the surface right
// at a cell boundary; and reload determinism with the runtime hooks installed. These pass.
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/math/vec3';
import { decode, encode } from '@/core/serialize';
import type { PheromoneState } from '@/sim/types';
import { TRAIL_DAB_SPACING_BU, TRAIL_DETECT } from './balance';
import { createPheromoneField, type PheromoneRuntime } from './field';
import { pheroDecayRateMult } from './factors';
import { emptyPheroState, newField, TEST_BU, testRandom } from './testkit';

interface Plane { origin: Vec3; u: Vec3; v: Vec3; up: Vec3 }

const at = (pl: Plane, a: number, b: number): Vec3 => ({
  x: pl.origin.x + pl.u.x * a + pl.v.x * b,
  y: pl.origin.y + pl.u.y * a + pl.v.y * b,
  z: pl.origin.z + pl.u.z * a + pl.v.z * b,
});

/** S-curve in plane coordinates, mm: straight, 90 deg left, 135 deg right, straight. */
function curve(): [number, number][] {
  const pts: [number, number][] = [];
  const step = 0.25 * TEST_BU;
  let x = 0, y = 0, h = 0;
  const seg = (len: number, rate: number) => {
    for (let s = 0; s < len; s += step) { pts.push([x, y]); h += rate * step; x += Math.cos(h) * step; y += Math.sin(h) * step; }
  };
  seg(20 * TEST_BU, 0);
  seg(60 * TEST_BU, Math.PI / 2 / (60 * TEST_BU));
  seg(70 * TEST_BU, -(Math.PI * 0.75) / (70 * TEST_BU));
  seg(20 * TEST_BU, 0);
  pts.push([x, y]);
  return pts;
}

function followOn(pl: Plane): { reached: boolean; worstBu: number; minStrength: number } {
  const f = newField();
  const pts = curve();
  let acc = Infinity;
  for (let i = 1; i < pts.length; i++) {
    acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc >= TRAIL_DAB_SPACING_BU * TEST_BU) { acc = 0; f.deposit(1, 'trail', at(pl, pts[i][0], pts[i][1]), 2.5); }
  }
  const pos = at(pl, pts[0][0], pts[0][1]);
  const p1 = at(pl, pts[8][0], pts[8][1]);
  const l = Math.hypot(p1.x - pos.x, p1.y - pos.y, p1.z - pos.z);
  const fwd = { x: (p1.x - pos.x) / l, y: (p1.y - pos.y) / l, z: (p1.z - pos.z) / l };
  const end = at(pl, pts[pts.length - 1][0], pts[pts.length - 1][1]);
  const out = { x: 0, y: 0, z: 0 };
  let worst = 0, minStrength = Infinity, reached = false;
  for (let i = 0; i < 2000; i++) {
    minStrength = Math.min(minStrength, f.sense(1, 'trail', pos, fwd, pl.up, out));
    fwd.x = out.x; fwd.y = out.y; fwd.z = out.z;
    pos.x += fwd.x * 0.6 * TEST_BU; pos.y += fwd.y * 0.6 * TEST_BU; pos.z += fwd.z * 0.6 * TEST_BU;
    if (i > 10) {
      let best = Infinity;
      for (const [a, b] of pts) { const q = at(pl, a, b); best = Math.min(best, Math.hypot(q.x - pos.x, q.y - pos.y, q.z - pos.z)); }
      worst = Math.max(worst, best);
    }
    if (Math.hypot(pos.x - end.x, pos.y - end.y, pos.z - end.z) < 2 * TEST_BU) { reached = true; break; }
  }
  return { reached, worstBu: worst / TEST_BU, minStrength };
}

describe('senseDirection on more surfaces (reviewer)', () => {
  const flat = (origin: Vec3, up: Vec3): Plane => ({ origin, u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 }, up });
  const slope = (deg: number): Plane => {
    const a = (deg * Math.PI) / 180;
    return {
      origin: { x: 300.3, y: 0.6, z: 300.3 }, u: { x: Math.cos(a), y: Math.sin(a), z: 0 }, v: { x: 0, y: 0, z: 1 },
      up: { x: -Math.sin(a), y: Math.cos(a), z: 0 },
    };
  };
  const cases: [string, Plane][] = [
    ['ceiling (up = -Y)', flat({ x: 300.3, y: 99.4, z: 300.3 }, { x: 0, y: -1, z: 0 })],
    ['20 deg slope (trail crosses cell layers)', slope(20)],
    ['45 deg slope', slope(45)],
    ['negative coordinates', flat({ x: -900.3, y: -50.6, z: -700 }, { x: 0, y: 1, z: 0 })],
    ['surface just below a cell boundary', flat({ x: 300.3, y: 15.9, z: 300.3 }, { x: 0, y: 1, z: 0 })],
  ];
  for (const [name, pl] of cases) {
    it(`follows the curved trail end to end: ${name}`, () => {
      const r = followOn(pl);
      expect(r.reached).toBe(true);
      expect(r.worstBu).toBeLessThan(4);
      expect(r.minStrength).toBeGreaterThan(TRAIL_DETECT);
    });
  }
});

describe('determinism with hooks installed (reviewer)', () => {
  it('reloading mid-run with a decay modifier and a free-space test gives identical bytes', () => {
    const hooks = (f: PheromoneRuntime) => f.setHooks({
      decayModifier: (ch, x, _y, z) => pheroDecayRateMult(ch, { tempC: 15 + ((x + z) % 400) / 20, exposure: x < 300 ? 'sheltered' : 'normal' }),
      isFree: (_x, y) => y > 0,
    });
    const a = createPheromoneField(emptyPheroState());
    let b = createPheromoneField(emptyPheroState());
    hooks(a); hooks(b);
    const ra = testRandom(11), rb = testRandom(11);
    const op = (f: PheromoneRuntime, r: () => number) => {
      const p = { x: r() * 600, y: r() * 40 - 8, z: r() * 600 };
      const ch = (['trail', 'home', 'alarm'] as const)[Math.floor(r() * 3)];
      if (r() < 0.8) f.deposit(1 + Math.floor(r() * 2), ch, p, r() * 4);
      else f.step(1 + r() * 3);
    };
    for (let i = 0; i < 6000; i++) {
      op(a, ra); op(b, rb);
      if (i % 700 === 350) {
        b = createPheromoneField(decode(encode(b.data)) as PheromoneState);
        hooks(b);
      }
    }
    const ea = encode(a.data), eb = encode(b.data);
    let same = ea.length === eb.length;
    for (let i = 0; same && i < ea.length; i++) same = ea[i] === eb[i];
    expect(same).toBe(true);
    expect(a.validate()).toEqual([]);
  }, 60000);
});
