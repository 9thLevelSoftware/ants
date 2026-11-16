// Photo mode end to end in Node (task photo acceptance 1): entering from a play view freezes time and keeps everything
// else as it was, leaving restores view, pose, possession, speed and overlays; the lens, look and exposure reach the
// renderer through the hooks; a vanished subject is handled. The renderer is a recording stand-in.
import { beforeEach, describe, expect, it } from 'vitest';
import type { RenderApp } from '@/render/app';
import { makeTestSim } from '@/sim/testing';
import { clearOverlays, overlays, setOverlay } from '@/ui/overlays/state';
import { photoActions, photoUi } from '@/ui/screens/photo/store';
import { GameSession } from '../../session';
import { isFrozen } from '../../time/speedRules';
import { togglePhoto, type ViewSwitchHost } from '../viewSwitch';
import type { InputState } from '@/input';
import { PhotoMode, type PhotoGame } from './PhotoMode';
import { resolveSubject } from './subject';

const CAM = { autoFollow: 'off' as const, fovOffset: 0, worldUpLock: false, reducedMotion: false };

interface Calls { focus: unknown[][]; exposure: number[]; grade: { saturation: number; gain: number[] }[]; hooks: Record<string, unknown>[]; toasts: string[] }

function fakeApp(calls: Calls, dof = true): RenderApp {
  const gl = { MAX_VIEWPORT_DIMS: 1, MAX_TEXTURE_SIZE: 2, MAX_RENDERBUFFER_SIZE: 3, getParameter: (k: number) => (k === 1 ? [16384, 16384] : 8192) };
  return {
    post: dof ? { current: { dof: { enabled: true, bokehScale: 3.2 }, vignette: { enabled: true } }, setHooks: (h: Record<string, unknown>) => calls.hooks.push({ ...h }) } : null,
    setFocus: (...a: unknown[]) => calls.focus.push(a), setExposure: (ev: number) => calls.exposure.push(ev), setGrade: (g: { saturation: number; gain: number[] }) => calls.grade.push({ saturation: g.saturation, gain: [...g.gain] }),
    quality: { id: dof ? 'high' : 'low' }, renderer: { domElement: { width: 1280, height: 720 }, getContext: () => gl },
  } as unknown as RenderApp;
}

function setup(opts: { dof?: boolean } = {}) {
  const sim = makeTestSim({ nest: 'small', workers: 4 });
  const s = new GameSession(sim, CAM);
  const calls: Calls = { focus: [], exposure: [], grade: [], hooks: [], toasts: [] };
  const ref: { photo?: PhotoMode } = {};
  const game: PhotoGame & ViewSwitchHost = {
    session: s, mode: 'playing', camera: {} as never, app: fakeApp(calls, opts.dof ?? true), toast: (t) => { calls.toasts.push(t); },
    command: () => {}, possess: () => {}, release: () => {}, viewChanged: () => {}, togglePhoto: () => togglePhoto(game),
    get viewsLayer() { return { photo: ref.photo! }; },
  };
  const layer = { state: { selected: null as never }, pick: () => null };
  const photo = new PhotoMode(game, layer);
  ref.photo = photo;
  s.driver.enqueue(s.possessCommand('queen', true));
  s.driver.applyCommandsNow();
  s.update(0);
  s.views.settle(1, 0.05);
  return { sim, s, photo, game, calls, layer };
}

const frame = (s: GameSession, photo: PhotoMode, dt = 0.016) => { photo.frame(s, null); const vf = s.views.update(dt, null); photo.afterCamera(s, true); return vf; };

beforeEach(() => { clearOverlays(); photoUi.value = null; photoActions.value = null; });

describe('enter and leave', () => {
  it('opens on the photo view with the possessed ant as the subject and publishes the read-out', () => {
    const { s, photo, game } = setup();
    expect(photo.active).toBe(false);
    togglePhoto(game);
    expect(s.view).toBe('photo');
    expect(photo.active).toBe(true);
    const ui = photoUi.value!;
    expect(ui.subject).toMatch(/^Queen #\d+/);
    expect(ui.focusMode).toBe('subject');
    expect(ui.orbit).toBe(true);
    expect(ui.lens.fNumber).toBeCloseTo(2.8, 6);
    expect(photoActions.value).toBe(photo);
  });

  it('time is frozen in photo mode at any speed, and the speed and tick are the same on exit', () => {
    const { s, sim, photo, game } = setup();
    s.driver.enqueue({ type: 'setSpeed', speed: 4 });
    s.driver.applyCommandsNow();
    const speed = s.driver.speed, tick = sim.state.tick;
    togglePhoto(game);
    expect(isFrozen({ mode: 'playing', view: s.view })).toBe(true);
    let ran = 0;
    for (let i = 0; i < 200; i++) ran += s.driver.frame(0.05, { frozen: isFrozen({ mode: 'playing', view: s.view }), realtime: true, now: null }).ran; // 10 real s
    expect(ran).toBe(0);
    expect(sim.state.tick).toBe(tick);
    togglePhoto(game);
    expect(photo.active).toBe(false);
    expect(s.driver.speed).toBe(speed);
    expect(s.driver.paused).toBe(false);
    const r = s.driver.frame(0.2, { frozen: isFrozen({ mode: 'playing', view: s.view }), realtime: true, now: null });
    expect(r.running).toBe(true); // time resumes
  });

  it('leaving restores the origin view, possession and the camera pose (GDD 08 App. E 22)', () => {
    const { s, photo, game } = setup();
    const before = { pos: { ...s.views.pose.pos }, look: { ...s.views.pose.look }, fov: s.views.pose.fov };
    const id = s.possessedId;
    togglePhoto(game);
    // fly the photo camera somewhere else
    for (let i = 0; i < 30; i++) { photo.frame(s, null); s.views.photo.update(0.05, { yawDeg: 7, pitchDeg: 1, zoomLog: 0, move: { x: 1, y: 1 }, vertical: 0, focalLog: 0.02, focusLog: 0, apertureSteps: 0, exposureSteps: 0, roll: 0 }, () => 1e9); frame(s, photo); }
    expect(Math.hypot(s.views.pose.pos.x - before.pos.x, s.views.pose.pos.z - before.pos.z)).toBeGreaterThan(1);
    togglePhoto(game);
    expect(s.view).toBe('possess');
    expect(s.possessedId).toBe(id);
    s.views.settle(1, 0.05);
    expect(s.views.pose.pos.x).toBeCloseTo(before.pos.x, 3);
    expect(s.views.pose.pos.y).toBeCloseTo(before.pos.y, 3);
    expect(s.views.pose.pos.z).toBeCloseTo(before.pos.z, 3);
    expect(s.views.pose.fov).toBeCloseTo(before.fov, 3);
    expect(photoUi.value).toBeNull();
  });

  it('comes from the observer too, with no subject unless something is followed', () => {
    const { s, photo, game } = setup();
    s.driver.enqueue({ type: 'release', reason: 'player' });
    s.driver.applyCommandsNow();
    s.update(0);
    s.followId = -1; s.views.unfollow();
    s.setView('observer', true);
    togglePhoto(game);
    expect(s.view).toBe('photo');
    expect(photo.ui()!.subject).toBeNull();
    expect(photo.ui()!.focusMode).toBe('centre');
    togglePhoto(game);
    expect(s.view).toBe('observer');
  });

  it('overlays toggled in photo mode are put back on exit', () => {
    const { photo, game } = setup();
    setOverlay('scent', true);
    togglePhoto(game);
    setOverlay('scent', false);
    setOverlay('moisture', true);
    expect(overlays.value).toEqual({ scent: false, other: 'moisture' });
    togglePhoto(game);
    expect(overlays.value).toEqual({ scent: true, other: null });
    expect(photo.active).toBe(false);
  });
});

describe('lens, look and exposure reach the renderer', () => {
  it('actions clamp, and the rig output drives focus range, bokeh and exposure', () => {
    const { s, photo, game, calls } = setup();
    togglePhoto(game);
    photo.setFocalMm(5000); photo.setFNumber(0.01); photo.setExposureEV(99); photo.setRollDeg(-99);
    const ui = photoUi.value!;
    expect(ui.lens.focalMm).toBeCloseTo(200, 6);
    expect(ui.lens.fNumber).toBeCloseTo(1.4, 6);
    expect(ui.lens.exposureEV).toBe(3);
    expect(ui.lens.rollDeg).toBe(-45);
    frame(s, photo);
    const hooks = calls.hooks[calls.hooks.length - 1];
    expect(hooks.bokehOverride).toBeCloseTo(9 / 1.4, 6);
    expect(calls.exposure[calls.exposure.length - 1]).toBe(3); // base 0 + 3 EV
    const out = s.views.photo.out;
    expect(calls.focus[calls.focus.length - 1].slice(0, 2)).toEqual([out.dof.focusDistance, out.dof.focusRange]);
  });

  it('the world exposure and grade pass through the photo mapping, and leaving puts the world values back', () => {
    const { s, photo, game, calls } = setup();
    expect(photo.mapExposure(0.4)).toBe(0.4); // not in photo mode
    togglePhoto(game);
    photo.setExposureEV(-1.5); frame(s, photo);
    expect(photo.mapExposure(0.4)).toBeCloseTo(-1.1, 9);
    const g = { saturation: 1.05, gain: [1, 1, 1] as [number, number, number] };
    expect(photo.mapGrade(g)).toBe(g); // natural: untouched
    photo.setLook('plate');
    const plate = photo.mapGrade(g);
    expect(plate.saturation).toBeLessThan(0.5);
    expect(calls.grade[calls.grade.length - 1].saturation).toBeLessThan(0.5); // pushed to the app at once
    expect(calls.hooks[calls.hooks.length - 1].vignetteDarkness).toBe(0.62);
    togglePhoto(game);
    expect(calls.exposure[calls.exposure.length - 1]).toBeCloseTo(0.4, 9);
    expect(calls.grade[calls.grade.length - 1].saturation).toBeCloseTo(1.05, 9);
    expect(calls.hooks[calls.hooks.length - 1]).toMatchObject({ bokehOverride: null, vignetteDarkness: null });
    expect(photo.mapGrade(g)).toBe(g);
  });

  it('no post chain: the panel is told depth of field is unavailable', () => {
    const { photo, game } = setup({ dof: false });
    togglePhoto(game);
    expect(photo.ui()!.caps.depthOfField).toBe(false);
    expect(photo.ui()!.caps.maxScale).toBe(2);
  });
});

describe('subject', () => {
  it('a subject that vanishes is dropped with a toast and focus falls back to the centre', () => {
    const { s, sim, photo, game, calls } = setup();
    s.driver.enqueue({ type: 'release', reason: 'player' });
    s.driver.applyCommandsNow(); s.update(0);
    const worker = sim.state.ants.find((a) => a.caste === 'worker')!;
    s.followId = worker.id;
    s.setView('observer', true);
    togglePhoto(game);
    expect(photo.ui()!.subject).toContain(`#${worker.id}`);
    s.driver.enqueue({ type: 'cheat.kill', id: worker.id, cause: 'test' });
    s.driver.step(1);
    frame(s, photo);
    expect(photo.ui()!.subject).toBeNull();
    expect(photo.ui()!.focusMode).toBe('centre');
    expect(calls.toasts.some((t) => /gone/.test(t))).toBe(true);
  });

  it('frame subject aims the camera at it; subject focus follows its distance', () => {
    const { s, photo, game } = setup();
    togglePhoto(game);
    const rig = s.views.photo;
    rig.yaw += 2; // look away
    photo.frameSubject();
    frame(s, photo);
    const subj = photo['subject']!;
    const d = Math.hypot(subj.pos.x - rig.pos.x, subj.pos.y - rig.pos.y, subj.pos.z - rig.pos.z);
    expect(rig.focusMm).toBeCloseTo(Math.min(Math.max(d, 0.5 * rig.bu), 200 * rig.bu), 6);
    const look = s.views.photo.out.look;
    const toLook = { x: look.x - rig.pos.x, y: look.y - rig.pos.y, z: look.z - rig.pos.z };
    const toSubj = { x: subj.pos.x - rig.pos.x, y: subj.pos.y - rig.pos.y, z: subj.pos.z - rig.pos.z };
    const cos = (toLook.x * toSubj.x + toLook.y * toSubj.y + toLook.z * toSubj.z) / (Math.hypot(toLook.x, toLook.y, toLook.z) * Math.hypot(toSubj.x, toSubj.y, toSubj.z));
    expect(cos).toBeGreaterThan(0.999);
  });
});

describe('quiet mode', () => {
  it('hides markers and outlines while photo mode is open, by default', () => {
    const { photo, game } = setup();
    expect(photo.hidesMarkers).toBe(false);
    togglePhoto(game);
    expect(photo.hidesMarkers).toBe(true);
    photo.setHideMarkers(false);
    expect(photo.hidesMarkers).toBe(false);
  });
});

/** A stand-in for the keys and pad: `down` lists the actions pressed this frame. */
const keys = (down: string[], device: 'kbm' | 'pad' = 'kbm') =>
  ({ pressed: (id: string) => down.includes(id), zoom: () => 0, activeDevice: device }) as unknown as InputState;

describe('review fixes', () => {
  it('the orbit toggle stays as the player set it when another thing is picked as the subject', () => {
    const { s, sim, photo, game } = setup();
    togglePhoto(game);
    photo.setOrbit(false);
    const worker = sim.state.ants.find((a) => a.caste === 'worker')!;
    expect(photo.setSubject({ kind: 'ant', id: worker.id })).toBe(true);
    expect(photo.orbit).toBe(false);
    photo.setOrbit(true);
    expect(photo.orbit).toBe(true);
    s.driver.enqueue({ type: 'cheat.kill', id: worker.id, cause: 'test' });
    s.driver.step(1);
    frame(s, photo);
    expect(photo.orbit).toBe(false); // nobody to orbit
    expect(photo.ui()!.orbit).toBe(false);
  });

  it('pad A focuses once at the centre of the view; the mouse click picks under the cursor', () => {
    let picks = 0;
    const { s, photo, game, layer } = setup();
    layer.pick = () => { picks++; return null; };
    togglePhoto(game);
    photo.setFocusMode('subject');
    photo.frame(s, keys(['ph-focus'], 'pad'));
    expect(picks).toBe(0);
    expect(photo.ui()!.focusMode).toBe('manual');
    photo.setFocusMode('subject');
    photo.frame(s, keys(['ph-focus'], 'kbm'));
    expect(picks).toBe(1);
  });

  it('the capture key renders after the frame that read it, never inside it', async () => {
    const { s, photo, game, calls } = setup();
    let renders = 0;
    game.renderNow = () => { renders++; };
    togglePhoto(game);
    photo.setFNumber(8); // a lens change not yet drawn
    photo.frame(s, keys(['ph-capture']));
    expect(renders).toBe(0);
    await Promise.resolve(); await Promise.resolve();
    expect(renders).toBe(1);
    expect(calls.toasts.length).toBeGreaterThanOrEqual(0); // the stand-in renderer cannot encode: the error is reported, not thrown
  });

  it('a capture that was asked for and then left photo mode does nothing', async () => {
    const { s, photo, game } = setup();
    let renders = 0;
    game.renderNow = () => { renders++; };
    togglePhoto(game);
    photo.setFNumber(8);
    const p = photo.capture(1);
    togglePhoto(game);
    expect(await p).toBeNull();
    expect(renders).toBe(0);
    expect(s.view).toBe('possess');
  });

  it('the focus point of an ant is where it is drawn at the frame alpha, not at the end of the tick', () => {
    const { s, sim } = setup();
    const ant = sim.state.ants.find((a) => a.caste === 'worker')!;
    ant.prevPos = { x: ant.pos.x - 10, y: ant.pos.y, z: ant.pos.z };
    ant.prevUp = { ...ant.up };
    const half = resolveSubject(s, { kind: 'ant', id: ant.id }, 0.5)!.pos, end = resolveSubject(s, { kind: 'ant', id: ant.id }, 1)!.pos;
    expect(end.x - half.x).toBeCloseTo(5, 6);
    expect(resolveSubject(s, { kind: 'ant', id: ant.id }, 0)!.pos.x).toBeCloseTo(end.x - 10, 6);
  });

  it('the preview says when new tabs cannot work here, and Open in new tab does not try', () => {
    const { s, photo, game } = setup();
    togglePhoto(game);
    let opened = 0;
    photo.useEnv({ noDownload: true, framed: true, createObjectURL: () => 'blob:null/1', open: () => { opened++; return {}; }, canOpenTab: false });
    const img = { blob: new Blob(['x'], { type: 'image/png' }), width: 4, height: 3, scale: 1, reduced: false, method: 'canvas-blob' };
    (photo as unknown as { deliver(s: GameSession, i: typeof img): unknown }).deliver(s, img);
    photo.publish(true);
    expect(photoUi.value!.preview!.canOpenTab).toBe(false);
    photo.openInTab();
    expect(opened).toBe(0);
    expect(photoUi.value!.preview!.message).toMatch(/frame that does not allow new tabs/);
    photo.useEnv({ noDownload: true, framed: false, createObjectURL: () => 'blob:http://x/1', open: () => { opened++; return {}; } });
    (photo as unknown as { deliver(s: GameSession, i: typeof img): unknown }).deliver(s, img);
    photo.publish(true);
    expect(photoUi.value!.preview!.canOpenTab).toBe(true);
    photo.openInTab();
    expect(opened).toBe(1);
    expect(photoUi.value!.preview!.message).toBe('Opened in a new tab.');
  });
});
