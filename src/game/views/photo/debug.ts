// `__game.views.photo.*`: scripted access to photo mode (tests/e2e/photo.mjs). Every call goes through the same
// functions the panel and the keys use. Screen positions are CSS px on the canvas.
import type { Vec3 } from '@/core';
import type { Game } from '../../Game';
import { orbitAround } from './orbit';
import { aimAt } from './lens';
import type { SubjectKind } from './subject';
import type { PhotoCaptureInfo } from './PhotoMode';

const plain = (v: unknown): unknown => JSON.parse(JSON.stringify(v ?? null));

export interface PhotoSet {
  focalMm?: number; fNumber?: number; focusBu?: number; exposureEV?: number; rollDeg?: number;
  look?: string; guides?: 'off' | 'thirds' | 'centre'; hideMarkers?: boolean; orbit?: boolean; focusMode?: 'manual' | 'centre' | 'subject';
}

function bytesToBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export function buildPhotoDebug(game: Game) {
  const photo = () => game.viewsLayer.photo;
  const session = () => {
    if (!game.session) throw new Error('__game.views.photo: no game running');
    return game.session;
  };
  const info = (c: PhotoCaptureInfo | null) => (c ? { filename: c.filename, width: c.width, height: c.height, bytes: c.bytes, scale: c.scale, reduced: c.reduced, method: c.method, download: c.download } : null);
  const api = {
    /** The panel's read-out (null outside photo mode). */
    state() { photo().publish(true); return plain(photo().ui()); },
    /** Enter / leave photo mode through the F2 toggle. */
    enter() { const s = session(); if (s.view !== 'photo') game.togglePhoto(); return s.view; },
    exit() { const s = session(); if (s.view === 'photo') game.togglePhoto(); return s.view; },
    /** Lens and look values, exactly as the sliders set them (clamped); null / undefined keep. */
    set(o: PhotoSet) {
      const p = photo();
      if (o.focalMm !== undefined) p.setFocalMm(o.focalMm);
      if (o.fNumber !== undefined) p.setFNumber(o.fNumber);
      if (o.focusMode) p.setFocusMode(o.focusMode);
      if (o.focusBu !== undefined) p.setFocusBu(o.focusBu);
      if (o.exposureEV !== undefined) p.setExposureEV(o.exposureEV);
      if (o.rollDeg !== undefined) p.setRollDeg(o.rollDeg);
      if (o.look !== undefined) p.setLook(o.look);
      if (o.guides !== undefined) p.setGuides(o.guides);
      if (o.hideMarkers !== undefined) p.setHideMarkers(o.hideMarkers);
      if (o.orbit !== undefined) p.setOrbit(o.orbit);
      game.requestRender();
      return api.state();
    },
    /** Makes a thing the subject (and focuses on it); null clears the subject. */
    subject(t: { kind: string; id: number } | null) {
      const ok = photo().setSubject(t ? { kind: t.kind as SubjectKind, id: t.id } : null);
      return { ok, state: api.state() };
    },
    frameSubject() { photo().frameSubject(); return api.state(); },
    /** Click to focus at a canvas position (CSS px): an entity there becomes the subject. */
    clickFocus(x: number, y: number) {
      const s = session();
      game.viewsLayer.cursor.set({ x, y });
      const rig = s.views.photo, before = rig.focusMm;
      game.renderNow(0);
      const p = game.viewsLayer.pick(s);
      const hit = p?.hits.find((h) => h.kind === 'ant' || h.kind === 'creature' || h.kind === 'brood' || h.kind === 'item' || h.kind === 'source');
      if (hit) photo().setSubject({ kind: hit.kind as SubjectKind, id: hit.id });
      else if (p?.surface) { photo().setFocusMode('manual'); rig.focusAt(p.surface.point); }
      game.requestRender();
      return plain({ hit: hit ?? null, surface: p?.surface?.point ?? null, focusMm: rig.focusMm, before, state: api.state() });
    },
    /** Camera pose of the photo rig. */
    pose() {
      const r = session().views.photo;
      return plain({ subject: photo().subjectInfo(), pos: r.pos, yaw: r.yaw, pitch: r.pitch, roll: r.roll, fov: r.fov, focusMm: r.focusMm, out: { look: r.out.look, near: r.out.near, dof: r.out.dof, exposureEV: r.out.exposureEV, fNumber: r.out.fNumber, focalMm: r.out.focalMm } });
    },
    /** Aims the camera at a point (mm). */
    aimAt(p: Vec3) { const ok = aimAt(session().views.photo, p); game.requestRender(); return ok; },
    /** Turns the view in place like a free look: `yawDeg` to the right, `pitchDeg` up (the subject leaves the centre of the frame). */
    turnView(yawDeg: number, pitchDeg = 0) {
      const rig = session().views.photo;
      if (Number.isFinite(yawDeg)) rig.yaw -= (yawDeg * Math.PI) / 180;
      if (Number.isFinite(pitchDeg)) rig.pitch = Math.max(-1.5, Math.min(1.5, rig.pitch + (pitchDeg * Math.PI) / 180));
      game.requestRender();
      return api.pose();
    },
    /** Flies (collision on) like WASD / Q / E held for `seconds`; `move` x right, y forward. */
    fly(o: { move?: { x: number; y: number }; vertical?: number; seconds?: number; fast?: boolean }) {
      const s = session(), rig = s.views.photo, trace = (a: Vec3, d: Vec3, m: number, r: number) => s.sim.field.sphereTrace(a, d, m, r);
      const move = o.move ?? { x: 0, y: 0 }, steps = Math.max(1, Math.round((o.seconds ?? 0.5) / 0.05));
      for (let i = 0; i < steps; i++) {
        rig.update(0.05, { yawDeg: 0, pitchDeg: 0, zoomLog: 0, move, vertical: o.vertical ?? 0, focalLog: 0, focusLog: 0, apertureSteps: 0, exposureSteps: 0, roll: 0, fast: !!o.fast }, trace);
      }
      game.requestRender();
      return api.pose();
    },
    /** Orbit the subject (or `center`) by these degrees, with collision. */
    orbit(yawDeg: number, pitchDeg: number, center?: Vec3) {
      const s = session(), rig = s.views.photo;
      const c = center ?? (s.views.photoOrbit ?? null);
      if (!c) return { ok: false, reason: 'no-subject' };
      const turned = orbitAround(rig, c, yawDeg, pitchDeg, (a, d, m, r) => s.sim.field.sphereTrace(a, d, m, r));
      game.requestRender();
      return { ok: true, turned, pose: api.pose() };
    },
    /** Captures at `scale` (1 or 2). `data: true` returns the PNG as a base64 string. */
    async capture(o: { scale?: number; data?: boolean } = {}) {
      session();
      game.renderNow(0);
      const c = await photo().capture(o.scale ?? 1);
      if (!c) return plain({ ok: false, error: photo().ui()?.error ?? 'not in photo mode' });
      const data = o.data ? bytesToBase64(new Uint8Array(await c.blob.arrayBuffer())) : undefined;
      return plain({ ok: true, ...info(c), ...(data ? { data } : {}) });
    },
    lastCapture() { return plain(info(photo().lastCapture)); },
    /** Preview routes (the buttons of the preview card). */
    saveAgain() { photo().saveAgain(); return api.state(); },
    openInTab() { photo().openInTab(); return api.state(); },
    async copyImage() { await photo().copyImage(); return api.state(); },
    closePreview() { photo().closePreview(); return api.state(); },
  };
  return api;
}
