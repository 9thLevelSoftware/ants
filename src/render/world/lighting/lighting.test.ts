// Light by sun elevation (GDD 08 11.2), weather (11.4), haze (11.3), underground (11.5); shadow snapping;
// the simulation adapter (sun from the calendar, deformation tiles, moved objects, hole probe on the real kernel).
import { describe, expect, it } from 'vitest';
import { Color, Vector3 } from 'three';
import { createKernel } from '@/sim/kernel';
import { emptyCarve, makeFlatWorld } from '@/sim/kernel.testWorld';
import type { Primitive, Sim, WorldData } from '@/sim/types';
import { HAZE_VIS_BU, HAZE_HEIGHT_K, LIGHT_KEYS, NIGHT_LOOK, SUN_INTENSITY, UNDERGROUND } from './constants';
import { snapShadowCenter, lightBasis } from './shadowSnap';
import {
  applyHeightDeltas, fieldHoleProbe, HOLE_MARGIN_BU, moonFromSun, movedStaticPrims, sunFromCalendar,
} from './simAdapter';
import { computeLighting, keyframesAt, type LightingInput } from './timeOfDay';

function input(elev: number, over: Partial<LightingInput> = {}): LightingInput {
  const e = (elev * Math.PI) / 180;
  return {
    sunDir: new Vector3(0, Math.sin(e), Math.cos(e)), sunElevDeg: elev, moonDir: new Vector3(0, 0.6, -0.8), moonIllum: 1,
    weather: 'clear', cloud: 0.1, fog: 0, zone: 'lawn', bu: 4, under: 0, hazeScale: 1, ...over,
  };
}

describe('light by sun elevation', () => {
  it('uses the GDD 08 11.2 colours and levels at the table rows', () => {
    const day = computeLighting(input(60));
    expect(day.keyIntensity).toBeCloseTo(SUN_INTENSITY, 5);
    expect(day.keyColor.getHexString()).toBe(new Color('#FFF4E5').getHexString());
    const dawn = computeLighting(input(0));
    expect(dawn.keyColor.getHexString()).toBe(new Color('#FFC08A').getHexString());
    const night = computeLighting(input(-30));
    expect(night.moonlit).toBe(true);
    expect(night.keyColor.getHexString()).toBe(new Color('#C9D6FF').getHexString());
    expect(night.keyIntensity).toBeLessThan(0.1 * SUN_INTENSITY);
    expect(night.stars).toBeGreaterThan(0);
  });
  it('keyframes are ordered and interpolate', () => {
    for (let i = 1; i < LIGHT_KEYS.length; i++) expect(LIGHT_KEYS[i].elevDeg).toBeGreaterThan(LIGHT_KEYS[i - 1].elevDeg);
    const k = keyframesAt(3);
    expect(k.a.elevDeg).toBe(0);
    expect(k.t).toBeGreaterThan(0);
    expect(k.t).toBeLessThan(1);
  });
  it('raises exposure for night and low sun (night stays readable), never below the day value', () => {
    const day = computeLighting(input(60)).exposureEV;
    const golden = computeLighting(input(8)).exposureEV;
    const night = computeLighting(input(-30)).exposureEV;
    expect(day).toBeCloseTo(0, 5);
    expect(golden).toBeGreaterThan(0.3);
    expect(night).toBeGreaterThanOrEqual(1.2);
    expect(night).toBeGreaterThan(golden);
  });
  it('sky horizon equals the fog colour (no seam), sun below the horizon never lights from below', () => {
    const l = computeLighting(input(20));
    expect(l.fogColor.equals(l.skyHorizon)).toBe(true);
    const low = computeLighting(input(-1));
    expect(low.keyDir.y).toBeGreaterThan(0);
  });
});

describe('weather and places', () => {
  it('overcast: sun x0.35, soft shadows, denser haze', () => {
    const clear = computeLighting(input(50));
    const ov = computeLighting(input(50, { weather: 'overcast', cloud: 0.9 }));
    expect(ov.keyIntensity / clear.keyIntensity).toBeCloseTo(0.35, 2);
    expect(ov.penumbra).toBeCloseTo(4, 5);
    expect(ov.fogDensity / clear.fogDensity).toBeCloseTo(1.2, 2); // GDD 08 11.4: +20 % (counted once)
    expect(ov.overcast).toBe(1);
  });
  it('haze visibility per habitat (63 % at HAZE_VIS_BU), thinner for high cameras', () => {
    const lawn = computeLighting(input(50, { zone: 'lawn' }));
    expect(lawn.fogDensity).toBeCloseTo(1 / (HAZE_VIS_BU.lawn * 4), 8);
    const asphalt = computeLighting(input(50, { zone: 'asphalt' }));
    expect(asphalt.fogDensity).toBeLessThan(lawn.fogDensity);
    const high = computeLighting(input(50, { zone: 'lawn', cameraHeightBU: 100 }));
    expect(high.fogDensity).toBeCloseTo(1 / ((HAZE_VIS_BU.lawn + HAZE_HEIGHT_K * 100) * 4), 8);
    expect(computeLighting(input(50, { hazeScale: 0 })).fogDensity).toBe(0);
  });
  it('underground dims the surface and uses the nest fog (visibility 30 BU)', () => {
    const u = computeLighting(input(50, { under: 1 }));
    expect(u.keyIntensity).toBeCloseTo(SUN_INTENSITY * UNDERGROUND.surfaceDim, 4);
    expect(u.fogDensity).toBeCloseTo(1 / (UNDERGROUND.visBU * 4), 8);
  });
  it('heat: asphalt haze closes in to 250 BU, other habitats keep theirs (GDD 08 11.3)', () => {
    const hot = computeLighting(input(50, { weather: 'heat', cloud: 0.05, zone: 'asphalt' }));
    expect(hot.fogDensity).toBeCloseTo(1 / (250 * 4), 8);
    const lawn = computeLighting(input(50, { weather: 'heat', cloud: 0.05, zone: 'lawn' }));
    expect(lawn.fogDensity).toBeCloseTo(1 / (HAZE_VIS_BU.lawn * 4), 8);
  });
  it('frost: blue shadow fill #5A6E8C at the clear-sky fill brightness (GDD 08 11.4)', () => {
    const clear = computeLighting(input(20));
    const frost = computeLighting(input(20, { weather: 'frost' }));
    const lum = (c: Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    expect(lum(frost.hemiSky)).toBeCloseTo(lum(clear.hemiSky), 5);
    const want = new Color('#5A6E8C');
    expect(frost.hemiSky.b / frost.hemiSky.r).toBeCloseTo(want.b / want.r, 4);
  });
  it('exposure: GDD 08 11.2 column plus the recorded metering (constants.ts AUTO_EXPOSURE_K)', () => {
    // pinned so any change of the departure is deliberate; see the RECORDED DEPARTURE note in constants.ts
    const ev = (e: number) => computeLighting(input(e)).exposureEV;
    expect(ev(-30)).toBeCloseTo(3.42, 1); // night: metered, pinned at the value the screenshots were tuned at (lookPass2.test.ts)
    expect(ev(0)).toBeCloseTo(2.24, 1); // dusk: half-way into the night metering (NIGHT_LOOK blend)
    expect(ev(8)).toBeCloseTo(1.28, 1);
    expect(ev(30)).toBeLessThan(0.5);
    expect(ev(60)).toBeCloseTo(0, 5);
  });
  it('interior: warm ambient, little direct sun', () => {
    const out = computeLighting(input(50));
    const ins = computeLighting(input(50, { interior: 1 }));
    expect(ins.keyIntensity).toBeLessThan(out.keyIntensity * 0.5);
    expect(ins.hemiSky.r).toBeGreaterThan(ins.hemiSky.b);
  });
});

describe('shadow snapping', () => {
  it('moves the frustum in whole texels in light space', () => {
    const toLight = new Vector3(0.3, 0.8, 0.5).normalize();
    const right = new Vector3(), up = new Vector3(), fwd = new Vector3();
    lightBasis(toLight, right, up, fwd);
    const texel = (2 * 560) / 2048;
    const out = new Vector3();
    for (const c of [new Vector3(8000, 3, 8000), new Vector3(8000.13, 3, 8000.2), new Vector3(123.4, -50, 9876.5)]) {
      snapShadowCenter(c, toLight, 560, 2048, out);
      expect(Math.abs(out.dot(right) / texel - Math.round(out.dot(right) / texel))).toBeLessThan(1e-6);
      expect(Math.abs(out.dot(up) / texel - Math.round(out.dot(up) / texel))).toBeLessThan(1e-6);
      expect(out.distanceTo(c)).toBeLessThan(texel);
    }
  });
});

describe('simulation adapter', () => {
  it('sun rises east, culminates south at noon, sets west', () => {
    const d = new Vector3();
    expect(sunFromCalendar(6, 6, 18, d)).toBeCloseTo(0, 6);
    expect(d.x).toBeCloseTo(1, 5);
    const noon = sunFromCalendar(12, 6, 18, d);
    expect(noon).toBeGreaterThan(30);
    expect(d.z).toBeGreaterThan(0.4);
    expect(Math.abs(d.x)).toBeLessThan(1e-6);
    sunFromCalendar(18, 6, 18, d);
    expect(d.x).toBeCloseTo(-1, 5);
    expect(sunFromCalendar(0, 6, 18, d)).toBeLessThan(-20);
    const m = moonFromSun(d, new Vector3());
    expect(m.y).toBeGreaterThan(0.1);
  });
  it('applies height deformation tiles (32 x 32 points, 1/16 mm)', () => {
    const nx = 40, nz = 40, h = new Float32Array(nx * nz);
    const data = new Int16Array(32 * 32);
    data[0] = 16; data[5 * 32 + 3] = -32;
    applyHeightDeltas(h, nx, nz, [{ tileIndex: 0, data }]);
    expect(h[0]).toBeCloseTo(1, 6);
    expect(h[5 * nx + 3]).toBeCloseTo(-2, 6);
    const data2 = new Int16Array(32 * 32).fill(16);
    applyHeightDeltas(h, nx, nz, [{ tileIndex: 1, data: data2 }]); // tile x = 1 covers ix 32..39 only
    expect(h[39]).toBeCloseTo(1, 6);
  });
  it('moves the primitives of a moved object rigidly', () => {
    const p: Primitive = { id: 9, shape: 'box', pos: { x: 110, y: 0, z: 100 }, rot: { x: 0, y: 0, z: 0, w: 1 }, size: { x: 1, y: 1, z: 1 }, round: 0, material: 'metal', flags: 0, objectId: 1 };
    const world = { prims: [p], objects: [{ id: 1, templateId: 't', pos: { x: 100, y: 0, z: 100 }, rot: { x: 0, y: 0, z: 0, w: 1 }, primStart: 0, primCount: 1, tags: [], routeIds: [], poiIds: [] }] } as unknown as WorldData;
    const s = Math.SQRT1_2;
    const moved = movedStaticPrims(world, [{ objectId: 1, state: 'moved', pos: { x: 200, y: 0, z: 100 }, rot: { x: 0, y: s, z: 0, w: s }, tick: 1 }], new Map());
    const q = moved.get(9)!;
    expect(q.pos.x).toBeCloseTo(200, 6); // 10 mm along +x rotated 90 deg about +y -> -z
    expect(q.pos.z).toBeCloseTo(90, 6);
    expect(q.rot.y).toBeCloseTo(s, 6);
  });
  it('hole probe opens where the kernel carved through the ground, shrunk by the margin', () => {
    const world = makeFlatWorld({ size: 400, bu: 4, h0: 0 });
    const kernel = createKernel(world, emptyCarve(4));
    kernel.carveSphere({ x: 200, y: 0, z: 200 }, 8);
    const sim = { world, field: kernel.field, carve: kernel.carve } as unknown as Sim;
    const probe = fieldHoleProbe(sim)!;
    expect(probe(200, 200)).toBeGreaterThan(0);
    expect(probe(200 + 7, 200)).toBeGreaterThan(-HOLE_MARGIN_BU * 4 - 1);
    expect(probe(260, 200)).toBeLessThan(0);
  });
});
