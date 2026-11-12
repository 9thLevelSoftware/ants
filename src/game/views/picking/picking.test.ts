// Picking maths (GDD 01 §3.2): rays through the cursor, sphere / ellipsoid hits, PICK_MIN_PX inflation, nearest
// first, overlap cycling, and the entity pick on a real test sim.
import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import { PickCycler, pickEntities, type PickHit } from './entityPick';
import { inflatedRadius, makeRay, mmPerPx, PICK_MIN_PX, pxToNdc, rayEllipsoid, rayFromNdc, raySphere, type PickCamera } from './pickMath';

function camAt(pos: { x: number; y: number; z: number }, fwd: { x: number; y: number; z: number }): PickCamera {
  const l = Math.hypot(fwd.x, fwd.y, fwd.z);
  const f = { x: fwd.x / l, y: fwd.y / l, z: fwd.z / l };
  // right = f x worldUp, up = right x f
  const r = { x: -f.z, y: 0, z: f.x };
  const rl = Math.hypot(r.x, r.z) || 1;
  r.x /= rl; r.z /= rl;
  const u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x };
  return { pos, right: r, up: u, fwd: f, tanHalfFov: Math.tan(Math.PI / 6), aspect: 16 / 9, heightPx: 720 };
}

describe('pick maths', () => {
  it('the centre ray goes along the view; corners spread by the FOV and aspect', () => {
    const cam = camAt({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 });
    const ray = rayFromNdc(cam, 0, 0, makeRay());
    expect(ray.d.z).toBeCloseTo(-1);
    rayFromNdc(cam, 0, 1, ray);
    expect(Math.atan2(ray.d.y, -ray.d.z)).toBeCloseTo(Math.PI / 6); // half of the 60 degree vertical FOV
    rayFromNdc(cam, 1, 0, ray);
    expect(ray.d.x / -ray.d.z).toBeCloseTo(Math.tan(Math.PI / 6) * 16 / 9);
    const ndc = pxToNdc(1280, 0, 1280, 720);
    expect(ndc).toEqual({ x: 1, y: 1 });
  });

  it('ray-sphere and ray-ellipsoid hit distances, inside = 0, behind = miss', () => {
    const ray = makeRay();
    ray.o = { x: 0, y: 0, z: 0 }; ray.d = { x: 0, y: 0, z: -1 };
    expect(raySphere(ray, { x: 0, y: 0, z: -10 }, 2)).toBeCloseTo(8);
    expect(raySphere(ray, { x: 0, y: 3, z: -10 }, 2)).toBe(-1);
    expect(raySphere(ray, { x: 0, y: 0, z: 10 }, 2)).toBe(-1);
    expect(raySphere(ray, { x: 0, y: 0, z: 0.5 }, 2)).toBe(0);
    expect(rayEllipsoid(ray, { x: 0, y: 0, z: -10 }, { x: 1, y: 1, z: 4 })).toBeCloseTo(6);
    expect(rayEllipsoid(ray, { x: 3, y: 0, z: -10 }, { x: 1, y: 1, z: 4 })).toBe(-1);
  });

  it('small or far things are inflated to PICK_MIN_PX on screen', () => {
    const cam = camAt({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 });
    const far = { x: 0, y: 0, z: -1000 };
    expect(inflatedRadius(cam, far, 0.1)).toBeCloseTo(PICK_MIN_PX * mmPerPx(cam, 1000));
    expect(inflatedRadius(cam, { x: 0, y: 0, z: -1 }, 5)).toBe(5);
    // an ant 0.5 mm off the centre ray at 1 m still gets hit thanks to the inflation
    const ray = rayFromNdc(cam, 0, 0, makeRay());
    const c = { x: 0, y: 0.5 * PICK_MIN_PX * mmPerPx(cam, 1000), z: -1000 };
    expect(raySphere(ray, c, 0.5)).toBe(-1);
    expect(raySphere(ray, c, inflatedRadius(cam, c, 0.5))).toBeGreaterThan(0);
  });

  it('repeated clicks on one spot within 1 s cycle through overlapping candidates', () => {
    const hits = [{ id: 1 }, { id: 2 }, { id: 3 }].map((h, i) => ({ kind: 'ant', id: h.id, pos: { x: 0, y: 0, z: 0 }, t: i })) as PickHit[];
    const c = new PickCycler();
    expect(c.choose(hits, 100, 100, 0)?.id).toBe(1);
    expect(c.choose(hits, 101, 100, 0.5)?.id).toBe(2);
    expect(c.choose(hits, 101, 100, 0.9)?.id).toBe(3);
    expect(c.choose(hits, 101, 100, 1.2)?.id).toBe(1);
    expect(c.choose(hits, 101, 100, 5)?.id).toBe(1); // too late: starts over
    expect(c.choose(hits, 300, 100, 5.1)?.id).toBe(1); // elsewhere: starts over
  });
});

describe('entity pick on a test sim', () => {
  it('nearest ant first, nothing behind the occluder, chambers only as structures after entities', () => {
    const sim = makeTestSim({ nest: 'small', workers: 6, systems: [] });
    const bu = sim.world.bu;
    const nest = sim.state.nests[0];
    const royal = nest.chambers.find((c) => c.type === 'royal')!;
    const ant = sim.state.ants.find((a) => a.alive && a.chamberId === royal.id)!;
    // camera above the ant looking straight down at it
    const cam = camAt({ x: ant.pos.x + 0.01, y: ant.pos.y + 20 * bu, z: ant.pos.z }, { x: -0.01, y: -20 * bu, z: 0 });
    const ray = rayFromNdc(cam, 0, 0, makeRay());
    const out: PickHit[] = [];
    pickEntities(sim, cam, ray, { occluderT: Infinity, structures: true }, out);
    expect(out[0].kind).toBe('ant');
    expect(out[0].id).toBe(ant.id);
    expect(out.some((h) => h.kind === 'chamber' && h.id === royal.id)).toBe(true);
    expect(out.findIndex((h) => h.kind === 'chamber')).toBeGreaterThan(0);
    // an occluder between the camera and the ant hides it
    pickEntities(sim, cam, ray, { occluderT: 5 * bu, structures: false }, out);
    expect(out.length).toBe(0);
  });
});
