// Independent review of photo mode (task photo): edge cases and failure paths the implementer's tests do not cover.
// Tests marked "BUG" fail on purpose: they demonstrate a defect reported in the review and stay for the fixer.
import { afterEach, describe, expect, it } from 'vitest';
import { PhotoRig, makePose, makeSphereTracer } from '@/render/camera';
import { orbitAround } from './orbit';
import { readLens, setExposureEV, setFNumber, setFocalMm, setFocusBu, setRollDeg, viewDirection } from './lens';
import { browserEnv, openInNewTab, tryDownload, type PhotoEnv } from './deliver';
import { planCapture } from './captureSize';
import { photoFilename } from './filename';
import { applyLook } from './looks';
import { neutralGrade } from '@/render/app/look';

const BU = 4;
const ground = makeSphereTracer((_x, y) => y); // f = y: free above the plane y = 0
const open = makeSphereTracer(() => 1e6);

function rigAt(pos: { x: number; y: number; z: number }, look: { x: number; y: number; z: number }): PhotoRig {
  const r = new PhotoRig(BU);
  const p = makePose();
  p.pos = { ...pos }; p.look = { ...look };
  r.enter(p);
  return r;
}
const finite = (r: PhotoRig) => [r.pos.x, r.pos.y, r.pos.z, r.yaw, r.pitch].every(Number.isFinite);

describe('orbit: continuity and degenerate input', () => {
  it('BUG: a 1 degree orbit input does not teleport the camera when the subject is off the view axis', () => {
    // subject 40 mm to the camera's right (90 degrees off the view axis): e.g. after flying, or framed on a third
    const c = { x: 40, y: 100, z: 40 };
    const r = rigAt({ x: 0, y: 100, z: 40 }, { x: 0, y: 100, z: 0 }); // looks along -z
    const p0 = { ...r.pos };
    orbitAround(r, c, 1, 0, open);
    const moved = Math.hypot(r.pos.x - p0.x, r.pos.y - p0.y, r.pos.z - p0.z);
    // a 1 degree turn about a subject 40 mm away moves the camera about 40 * 0.0175 = 0.7 mm; allow 5x that
    expect(moved).toBeLessThan(5 * 40 * (Math.PI / 180));
  });

  it('camera exactly at the subject: no NaN, the camera backs off to the minimum radius', () => {
    const c = { x: 10, y: 50, z: 10 };
    const r = rigAt(c, { x: 10, y: 50, z: 0 });
    orbitAround(r, c, 20, 5, open);
    expect(finite(r)).toBe(true);
    expect(Math.hypot(r.pos.x - c.x, r.pos.y - c.y, r.pos.z - c.z)).toBeGreaterThan(0.5 * BU);
  });

  it('huge, infinite and NaN inputs never leave a non-finite pose', () => {
    const c = { x: 0, y: 30, z: 0 };
    const r = rigAt({ x: 0, y: 30, z: 40 }, c);
    orbitAround(r, c, 1e9, -1e9, ground);
    expect(finite(r)).toBe(true);
    expect(orbitAround(r, c, Infinity, 0, ground)).toBe(0);
    expect(orbitAround(r, c, 0, NaN, ground)).toBe(0);
    expect(finite(r)).toBe(true);
    expect(r.pos.y).toBeGreaterThan(0);
  });

  it('blocked by the ground: the camera stops short of it and still faces the subject', () => {
    const c = { x: 0, y: 4, z: 0 };
    const r = rigAt({ x: 0, y: 4, z: 30 }, c);
    for (let i = 0; i < 10; i++) orbitAround(r, c, 0, 30, ground); // pitch the view up: the camera swings down
    expect(r.pos.y).toBeGreaterThan(0);
    const v = viewDirection(r, { x: 0, y: 0, z: 0 });
    const to = { x: c.x - r.pos.x, y: c.y - r.pos.y, z: c.z - r.pos.z }, l = Math.hypot(to.x, to.y, to.z);
    expect((v.x * to.x + v.y * to.y + v.z * to.z) / l).toBeGreaterThan(0.999);
  });
});

describe('lens setters: non-finite and extreme input', () => {
  it('Infinity / -Infinity / NaN keep the previous value; every value stays in range', () => {
    const r = rigAt({ x: 0, y: 20, z: 0 }, { x: 0, y: 20, z: -40 });
    const before = readLens(r);
    for (const v of [NaN, Infinity, -Infinity]) { setFocalMm(r, v); setFNumber(r, v); setFocusBu(r, v); setExposureEV(r, v); setRollDeg(r, v); }
    const after = readLens(r);
    expect(after.focalMm).toBeCloseTo(before.focalMm, 9);
    expect(after.fNumber).toBeCloseTo(before.fNumber, 9);
    expect(after.focusBu).toBeCloseTo(before.focusBu, 9);
    expect(after.exposureEV).toBe(before.exposureEV);
    expect(after.rollDeg).toBe(before.rollDeg);
  });

  it('the rig output (what reaches the post chain) is finite at the range ends', () => {
    const r = rigAt({ x: 0, y: 20, z: 0 }, { x: 0, y: 20, z: -40 });
    const inp = { yawDeg: 0, pitchDeg: 0, zoomLog: 0, move: { x: 0, y: 0 }, vertical: 0, focalLog: 0, focusLog: 0, apertureSteps: 0, exposureSteps: 0, roll: 0 };
    for (const [f, n, d] of [[24, 1.4, 0.5], [200, 22, 200]] as const) {
      setFocalMm(r, f); setFNumber(r, n); setFocusBu(r, d);
      const o = r.update(0.016, inp, open);
      expect([o.dof.focusDistance, o.dof.focusRange, o.dof.bokehScale, o.fov, o.near, o.far].every(Number.isFinite)).toBe(true);
      expect(o.dof.bokehScale).toBeCloseTo(9 / n, 6); // GDD 08 7.9: PHOTO_BOKEH_K / N
      expect(o.near).toBeLessThan(o.dof.focusDistance); // the focused point is never clipped by the near plane
    }
  });
});

describe('capture plan edge cases', () => {
  const lim = { maxTextureSize: 8192, maxRenderbufferSize: 8192, maxViewport: [8192, 8192] as const };
  it('NaN, zero and negative requests give the canvas size', () => {
    for (const w of [NaN, 0, -2]) {
      const p = planCapture(1280, 720, w, lim);
      expect([p.scale, p.width, p.height]).toEqual([1, 1280, 720]);
    }
  });
  it('a zero-sized canvas still plans a 1x1 image (no 0-pixel PNG)', () => {
    const p = planCapture(0, 0, 2, lim);
    expect(p.width).toBeGreaterThan(0);
    expect(p.height).toBeGreaterThan(0);
  });
  it('2x is refused past the texture limit (GDD 08 7.9) and reported as reduced', () => {
    const p = planCapture(4200, 2000, 2, lim);
    expect(p).toMatchObject({ scale: 1, width: 4200, height: 2000, reduced: true });
  });
});

describe('file name edge cases', () => {
  it('end of day, negative values and odd season words stay in the documented pattern', () => {
    const n = photoFilename({ seed: -1, year: 0, season: 'Late Summer!', day: -5, hour: 23.9999 });
    expect(n).toMatch(/^foundress-\d+-y\d+-[a-z]+-d\d+-\d{4}\.png$/);
    expect(n.endsWith('-2359.png')).toBe(true);
    expect(photoFilename({ seed: 7, year: 2, season: '', day: 3, hour: NaN })).toBe('foundress-7-y2-season-d3-0000.png');
  });
});

describe('looks on degenerate world grades', () => {
  it('a NaN world grade never produces a NaN look', () => {
    const base = neutralGrade();
    base.saturation = NaN; base.gain[1] = NaN;
    const out = applyLook(neutralGrade(), base, 'plate');
    expect([out.saturation, ...out.gain].every(Number.isFinite)).toBe(true);
  });
});

describe('delivery routes in the real page environment (browserEnv)', () => {
  const g = globalThis as Record<string, unknown>;
  const saved = { window: g.window };
  afterEach(() => { g.window = saved.window; });

  /** window.open as the HTML standard defines it: with the "noopener" feature it returns null even when the tab opened. */
  function stubWindow(opened: string[]) {
    g.window = {
      location: { search: '' },
      open: (url: string, _t?: string, features?: string) => { opened.push(url); return /noopener/.test(features ?? '') ? null : { closed: false }; },
    };
    (g.window as { self: unknown; top: unknown }).self = g.window;
    (g.window as { self: unknown; top: unknown }).top = g.window;
  }

  it('BUG: "Open in new tab" reports success when the browser opened the tab', () => {
    const opened: string[] = [];
    stubWindow(opened);
    const ok = openInNewTab('blob:x/1', browserEnv());
    expect(opened).toEqual(['blob:x/1']); // the tab did open
    expect(ok).toBe(true); // ...but window.open(url, '_blank', 'noopener') returns null, so the card says it did not
  });

  it('a createAnchor that throws is a failed download, never an exception', () => {
    const env: PhotoEnv = { noDownload: false, framed: true, createObjectURL: () => 'blob:1', revokeObjectURL: () => {}, createAnchor: () => { throw new Error('no DOM'); } };
    expect(() => tryDownload(new Blob(['x']), 'a.png', env)).not.toThrow();
    expect(tryDownload(new Blob(['x']), 'a.png', env)).toBe('failed');
  });
});
