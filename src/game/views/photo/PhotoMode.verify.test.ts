// Independent review of photo mode (task photo): the controller on a real test sim. Tests marked "BUG" fail on purpose
// and demonstrate a defect reported in the review.
import { beforeEach, describe, expect, it } from 'vitest';
import type { RenderApp } from '@/render/app';
import { makeTestSim } from '@/sim/testing';
import { clearOverlays, overlays, setOverlay } from '@/ui/overlays/state';
import { photoActions, photoUi } from '@/ui/screens/photo/store';
import { GameSession } from '../../session';
import { togglePhoto, type ViewSwitchHost } from '../viewSwitch';
import { orbitAround } from './orbit';
import { PhotoMode, type PhotoGame } from './PhotoMode';

const CAM = { autoFollow: 'off' as const, fovOffset: 0, worldUpLock: false, reducedMotion: false };

function fakeApp(log: { exposure: number[]; hooks: Record<string, unknown>[] }): RenderApp {
  const gl = { MAX_VIEWPORT_DIMS: 1, MAX_TEXTURE_SIZE: 2, MAX_RENDERBUFFER_SIZE: 3, getParameter: (k: number) => (k === 1 ? [16384, 16384] : 8192) };
  return {
    post: { current: { dof: { enabled: true, bokehScale: 3.2 }, vignette: { enabled: true } }, setHooks: (h: Record<string, unknown>) => log.hooks.push({ ...h }) },
    setFocus: () => {}, setExposure: (ev: number) => log.exposure.push(ev), setGrade: () => {},
    quality: { id: 'high' }, renderer: { domElement: { width: 1280, height: 720 }, getContext: () => gl },
  } as unknown as RenderApp;
}

function setup() {
  const sim = makeTestSim({ nest: 'small', workers: 4 });
  const s = new GameSession(sim, CAM);
  const log = { exposure: [] as number[], hooks: [] as Record<string, unknown>[], toasts: [] as string[] };
  const ref: { photo?: PhotoMode } = {};
  const game: PhotoGame & ViewSwitchHost = {
    session: s, mode: 'playing', camera: {} as never, app: fakeApp(log), toast: (t) => { log.toasts.push(t); },
    command: () => {}, possess: () => {}, release: () => {}, viewChanged: () => {}, togglePhoto: () => togglePhoto(game),
    get viewsLayer() { return { photo: ref.photo! }; },
  };
  const photo = new PhotoMode(game, { state: { selected: null as never }, pick: () => null });
  ref.photo = photo;
  s.driver.enqueue(s.possessCommand('queen', true));
  s.driver.applyCommandsNow();
  s.update(0);
  s.views.settle(1, 0.05);
  return { sim, s, photo, game, log };
}

const frame = (s: GameSession, photo: PhotoMode) => { photo.frame(s, null); s.views.update(0.016, null); photo.afterCamera(s, true); };

beforeEach(() => { clearOverlays(); photoUi.value = null; photoActions.value = null; });

describe('entering from the possession view', () => {
  it('BUG: the first small orbit drag after entry keeps the camera where it was (no jump onto the subject axis)', () => {
    const { s, photo, game } = setup();
    togglePhoto(game);
    frame(s, photo);
    const rig = s.views.photo, sub = photo.subjectInfo()!;
    const p0 = { ...rig.pos }, r = Math.hypot(p0.x - sub.pos.x, p0.y - sub.pos.y, p0.z - sub.pos.z);
    orbitAround(rig, sub.pos, 1, 0, (a, d, m, rad) => s.sim.field.sphereTrace(a, d, m, rad));
    const moved = Math.hypot(rig.pos.x - p0.x, rig.pos.y - p0.y, rig.pos.z - p0.z);
    // a 1 degree orbit at radius r moves the camera r * 0.0175; the possession camera does not look exactly at the subject
    // point, so the first orbit step snaps the camera onto the subject axis instead
    expect(moved).toBeLessThan(5 * r * (Math.PI / 180));
  });

  it('a second toggle in the same frame and repeated sync calls are idempotent', () => {
    const { s, photo, game } = setup();
    togglePhoto(game);
    photo.sync(s); photo.sync(s);
    expect(photo.active).toBe(true);
    togglePhoto(game);
    photo.sync(s);
    expect(photo.active).toBe(false);
    expect(s.view).toBe('possess');
  });
});

describe('GDD 01 App. E 22: from the observer at 4x', () => {
  it('the tick holds for 5 real s, and on exit the speed is 4x and the camera pose equals the pre-entry pose', () => {
    const { s, sim, photo, game } = setup();
    s.driver.enqueue({ type: 'release', reason: 'player' });
    s.driver.applyCommandsNow(); s.update(0);
    s.setView('observer', true);
    s.driver.enqueue({ type: 'setSpeed', speed: 4 });
    s.driver.applyCommandsNow();
    s.views.settle(1, 0.05);
    const before = { pos: { ...s.views.pose.pos }, look: { ...s.views.pose.look }, fov: s.views.pose.fov };
    const tick = sim.state.tick;
    togglePhoto(game);
    for (let i = 0; i < 100; i++) {
      s.driver.frame(0.05, { frozen: true, realtime: true, now: null });
      photo.frame(s, null);
      s.views.photo.update(0.05, { yawDeg: 3, pitchDeg: 0, zoomLog: 0, move: { x: 0.5, y: 1 }, vertical: 0.2, focalLog: 0.01, focusLog: 0, apertureSteps: 0, exposureSteps: 0, roll: 1 }, () => 1e9);
      s.views.update(0.05, null);
    }
    expect(sim.state.tick).toBe(tick);
    togglePhoto(game);
    expect(s.view).toBe('observer');
    expect(s.driver.speed).toBe(4);
    s.views.update(0.016, null);
    const p = s.views.pose;
    expect(Math.hypot(p.pos.x - before.pos.x, p.pos.y - before.pos.y, p.pos.z - before.pos.z)).toBeLessThan(1e-3);
    expect(Math.hypot(p.look.x - before.look.x, p.look.y - before.look.y, p.look.z - before.look.z)).toBeLessThan(1e-3);
    expect(p.fov).toBeCloseTo(before.fov, 6);
  });
});

describe('lens state on re-entry', () => {
  it('exposure, roll and aperture start fresh on every entry; the world exposure is restored each time', () => {
    const { s, photo, game, log } = setup();
    photo.mapExposure(0.7); // the world asks for +0.7 EV
    togglePhoto(game);
    photo.setExposureEV(2); photo.setRollDeg(30); photo.setFNumber(16);
    frame(s, photo);
    expect(log.exposure[log.exposure.length - 1]).toBeCloseTo(2.7, 9);
    togglePhoto(game);
    expect(log.exposure[log.exposure.length - 1]).toBeCloseTo(0.7, 9);
    togglePhoto(game);
    const ui = photo.ui()!;
    expect(ui.lens.exposureEV).toBe(0);
    expect(ui.lens.rollDeg).toBe(0);
    expect(ui.lens.fNumber).toBeCloseTo(2.8, 6);
    frame(s, photo);
    expect(log.exposure[log.exposure.length - 1]).toBeCloseTo(0.7, 9);
    togglePhoto(game);
  });
});

describe('overlays and actions outside photo mode', () => {
  it('actions called after leaving do nothing and do not throw', async () => {
    const { photo, game } = setup();
    togglePhoto(game); togglePhoto(game);
    expect(() => { photo.setFocalMm(85); photo.setFNumber(4); photo.setLook('warm'); photo.frameSubject(); photo.saveAgain(); photo.openInTab(); photo.closePreview(); }).not.toThrow();
    expect(await photo.capture(2)).toBeNull();
    expect(photo.setSubject({ kind: 'ant', id: 1 })).toBe(false);
    expect(photoUi.value).toBeNull();
  });

  it('an overlay that was on at entry and switched to another in photo mode comes back', () => {
    const { photo, game } = setup();
    setOverlay('temperature', true);
    togglePhoto(game);
    setOverlay('moisture', true);
    setOverlay('scent', true);
    togglePhoto(game);
    expect(overlays.value).toEqual({ scent: false, other: 'temperature' });
    expect(photo.active).toBe(false);
  });

  it('setLook with an unknown id is ignored', () => {
    const { photo, game } = setup();
    togglePhoto(game);
    photo.setLook('sepia-ultra');
    expect(photo.ui()!.look).toBe('natural');
    togglePhoto(game);
  });
});
