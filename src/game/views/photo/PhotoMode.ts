// Photo mode (GDD 01 6.9, GDD 08 7.9): a quiet tool for looking. The camera rig (src/render/camera/photoRig.ts) and the
// view switch (viewSwitch.ts) already freeze time and keep the origin view; this controller adds what a photographer
// needs on top: the subject (the possessed ant by default, any picked thing otherwise) with subject / centre / click
// focus, orbiting it, the look grade, guides, hidden outlines, the post chain's depth of field, exposure and vignette,
// the overlays the player may toggle, and the capture with its delivery routes. It owns no simulation state and never
// advances time. The panel (src/ui/screens/photo) talks to it through `PhotoActions`.
import { vec3 } from '@/core';
import type { InputState } from '@/input';
import type { PerspectiveCamera } from 'three';
import type { RenderApp } from '@/render/app';
import type { GradeParams } from '@/render/app/look';
import { neutralGrade } from '@/render/app/look';
import { PHOTO_FOCUS_BU, type PhotoOutput, type PhotoRig } from '@/render/camera';
import { overlays as overlaySignal, setOverlay } from '@/ui/overlays/state';
import { OVERLAY_IDS, type OverlaySet } from '@/ui/overlays/catalogue';
import { photoActions, publishPhoto, type PhotoActions, type PhotoFocusMode, type PhotoGuides, type PhotoPreviewUi, type PhotoUi } from '@/ui/screens/photo/store';
import type { GameSession } from '../../session';
import type { GameMode } from '../../time/speedRules';
import type { ViewsState } from '../viewsState';
import type { ScenePick } from '../picking/scenePick';
import { captureBaseSize, captureFrame, readGpuLimits, type CaptureImage } from './capture';
import { maxCaptureScale } from './captureSize';
import { browserEnv, copyImage, downloadNote, makeUrl, openInNewTab, revokeUrl, tabsBlocked, tryDownload, type DownloadOutcome, type PhotoEnv } from './deliver';
import { filenamePartsOf, photoFilename } from './filename';
import { aimAt, LENS_RANGES, readLens, resetLens, setExposureEV, setFNumber, setFocalMm, setFocusBu, setFocusMm, setRollDeg, viewDirection } from './lens';
import { applyLook, isLookId, LOOKS, LOOK_IDS, type LookId } from './looks';
import { defaultSubjectRef, resolveSubject, type Subject, type SubjectKind, type SubjectRef } from './subject';

/** What the photo controller asks of the Game (Game satisfies it structurally; every member but the session is optional). */
export interface PhotoGame {
  readonly session: GameSession | null;
  readonly mode: GameMode;
  readonly camera: PerspectiveCamera;
  readonly app?: RenderApp;
  readonly opts?: { readonly canvas: HTMLCanvasElement; readonly testMode: boolean };
  toast(text: string): void;
  requestRender?(): void;
  /** Leaves photo mode (the F2 toggle). */
  togglePhoto?(): void;
  /** Synchronous render of the current state (settles the camera first when asked). */
  renderNow?(settleS?: number): void;
}

/** What the controller reads of the views layer. */
export interface PhotoLayer {
  readonly state: Pick<ViewsState, 'selected'>;
  pick(s: GameSession): ScenePick | null;
}

export interface PhotoCaptureInfo {
  filename: string;
  width: number;
  height: number;
  bytes: number;
  scale: number;
  reduced: boolean;
  method: string;
  download: DownloadOutcome;
  /** Object URL of the image ('' when the browser refused one). */
  url: string;
  /** The PNG (for scripts; not part of the debug JSON). */
  blob: Blob;
}

const ENTITY_KINDS: readonly SubjectKind[] = ['ant', 'creature', 'brood', 'item', 'source'];
/** UI publishes at most this often while frames run (real ms). */
const PUBLISH_MS = 100;

export class PhotoMode implements PhotoActions {
  /** The scene shows no markers or outlines (the "hide markers and outlines" toggle, on by default). */
  hideMarkers = true;
  look: LookId = 'natural';
  guides: PhotoGuides = 'off';
  focusMode: PhotoFocusMode = 'centre';
  /** The player's wish to orbit the subject (the toggle); it only takes effect while there is a subject. */
  private orbitPref = true;
  lastCapture: PhotoCaptureInfo | null = null;
  private entered = false;
  private session: GameSession | null = null;
  private subjectRef: SubjectRef | null = null;
  private subject: Subject | null = null;
  private entryOverlays: OverlaySet | null = null;
  private baseEV = 0;
  private appliedEV = 0;
  private readonly baseGrade: GradeParams = neutralGrade();
  private readonly outGrade: GradeParams = neutralGrade();
  /** Lens changed outside a frame: the next capture first runs a frame. */
  private stale = false;
  private capturing = false;
  private preview: { info: PhotoCaptureInfo; ui: PhotoPreviewUi } | null = null;
  private error: string | null = null;
  private lastPublish = -Infinity;
  private env: PhotoEnv | null = null;
  private captureScale = 1;
  /** Tick interpolation of the frame being drawn: the subject point is where the ant is drawn. */
  private alpha = 1;
  /** Focal length the camera had on entry (Reset lens returns to it). */
  private entryFocalMm = 24;
  private readonly _v = vec3();

  constructor(private readonly game: PhotoGame, private readonly layer: PhotoLayer) {}

  get active(): boolean { return this.entered; }
  /** Look input pivots the camera about the subject. */
  get orbit(): boolean { return this.orbitPref && !!this.subject; }
  /** Who the photo is of and where (mm), null when nobody. */
  subjectInfo(): Subject | null { return this.subject; }
  /** Highlights, rings and markers are hidden this frame. */
  get hidesMarkers(): boolean { return this.entered && this.hideMarkers; }

  private rig(): PhotoRig | null { return this.session?.views.photo ?? null; }
  private envNow(): PhotoEnv { return (this.env ??= browserEnv()); }
  /** Test hook: replace the page environment of the delivery routes. */
  useEnv(env: PhotoEnv | null): void { this.env = env; }

  // ------------------------------------------------------------------ enter / leave
  /** Brings the controller in line with the view (idempotent): opens on entry to the photo view, closes on leaving it. */
  sync(s: GameSession, alpha: number = this.alpha): void {
    this.alpha = alpha;
    if (s.view === 'photo' && !this.entered) this.enter(s);
    else if (s.view !== 'photo' && this.entered) this.leave();
    else if (this.entered && this.session !== s) { this.leave(); this.enter(s); }
  }

  private enter(s: GameSession): void {
    this.session = s;
    this.entered = true;
    const rig = s.views.photo;
    this.entryFocalMm = readLens(rig).focalMm;
    resetLens(rig);
    this.subjectRef = defaultSubjectRef(s, this.layer.state.selected);
    this.subject = this.subjectRef ? resolveSubject(s, this.subjectRef, this.alpha) : null;
    this.focusMode = this.subject ? 'subject' : 'centre';
    this.orbitPref = true;
    this.entryOverlays = { scent: overlaySignal.peek().scent, other: overlaySignal.peek().other };
    this.appliedEV = rig.exposureEV;
    this.error = null;
    photoActions.value = this;
    this.pushLook();
    this.publish(true);
    this.game.requestRender?.();
  }

  private leave(): void {
    const s = this.session;
    this.entered = false;
    if (s) s.views.photoOrbit = null;
    this.restoreRender();
    this.restoreOverlays();
    this.closePreview();
    this.session = null;
    this.subject = null; this.subjectRef = null;
    publishPhoto(null);
    this.game.requestRender?.();
  }

  /** A game ended or a new one began. */
  reset(): void {
    if (this.entered) this.leave();
    this.session = null;
    this.lastCapture = null;
    this.baseEV = 0;
    Object.assign(this.baseGrade, neutralGrade());
  }

  dispose(): void {
    this.reset();
    if (photoActions.peek() === this) photoActions.value = null;
  }

  // ------------------------------------------------------------------ per frame
  /** Before the camera rig updates: keys, subject, focus, orbit target. `input` is null while only settling. */
  frame(s: GameSession, input: InputState | null, alpha: number = this.alpha): void {
    if (!this.entered) return;
    this.alpha = alpha;
    const rig = s.views.photo;
    this.refreshSubject(s);
    if (input) this.handleInput(s, input);
    if (this.focusMode === 'subject' && this.subject) setFocusMm(rig, Math.hypot(this.subject.pos.x - rig.pos.x, this.subject.pos.y - rig.pos.y, this.subject.pos.z - rig.pos.z));
    else if (this.focusMode === 'centre') this.focusAtCentre(s, rig);
    s.views.photoOrbit = this.orbit && this.subject ? this.subject.pos : null;
    this.publish(false);
  }

  private refreshSubject(s: GameSession): void {
    if (!this.subjectRef) return;
    this.subject = resolveSubject(s, this.subjectRef, this.alpha);
    if (this.subject) return;
    this.game.toast('The subject of the photo is gone.');
    this.subjectRef = null;
    if (this.focusMode === 'subject') this.focusMode = 'centre';
  }

  private handleInput(s: GameSession, input: InputState): void {
    if (input.pressed('ph-guides')) this.setGuides(this.guides === 'off' ? 'thirds' : 'off');
    if (input.pressed('ph-capture')) void this.capture(this.captureScale);
    if (input.zoom('ph-focus-dist') !== 0 && this.focusMode !== 'manual') this.focusMode = 'manual'; // Shift+wheel: the hand takes over
    if (input.pressed('ph-focus')) {
      if (input.activeDevice === 'pad') this.focusCentreOnce(s); // pad A: "focus at centre" (GDD 01 5.5); there is no cursor
      else this.clickFocus(s);
    }
  }

  /** Click to focus (GDD 08 7.9): the point under the cursor; an ant or creature there becomes the subject. */
  private clickFocus(s: GameSession): boolean {
    const pick = this.layer.pick(s), rig = s.views.photo;
    if (!pick) return false;
    const hit = pick.hits.find((h) => (ENTITY_KINDS as readonly string[]).includes(h.kind));
    if (hit) { this.setSubject({ kind: hit.kind as SubjectKind, id: hit.id }); return true; }
    if (!pick.surface) return false;
    this.focusMode = 'manual';
    rig.focusAt(pick.surface.point);
    this.touch();
    return true;
  }

  /** Focuses once on whatever the view axis meets, then leaves the focus where it is. */
  private focusCentreOnce(s: GameSession): void {
    this.focusAtCentre(s, s.views.photo);
    this.focusMode = 'manual';
    this.touch();
  }

  /** Autofocus on whatever the view axis meets (GDD 08 7.9 "Auto follows the screen centre"). */
  private focusAtCentre(s: GameSession, rig: PhotoRig): void {
    const max = PHOTO_FOCUS_BU[1] * rig.bu, d = viewDirection(rig, this._v);
    const free = s.sim.field.sphereTrace(rig.pos, d, max, 0);
    setFocusMm(rig, free >= max ? max : free);
  }

  /** After the camera rig updated and the game set the focus: pushes the lens to the render app. */
  afterCamera(s: GameSession, instant: boolean): void {
    if (!this.entered) return;
    const app = this.game.app;
    if (!app) return;
    const out = s.views.photo.out;
    app.setFocus(out.dof.focusDistance, out.dof.focusRange, instant);
    this.applyPost(app, out, 1);
    if (out.exposureEV !== this.appliedEV) { this.appliedEV = out.exposureEV; app.setExposure(this.baseEV + out.exposureEV); }
    this.stale = false;
  }

  private applyPost(app: RenderApp, out: PhotoOutput, boost: number): void {
    const look = LOOKS[this.look];
    app.post?.setHooks({
      bokehOverride: out.dof.bokehScale * boost, dofStrength: 1,
      vignetteOffset: look.vignette?.offset ?? null, vignetteDarkness: look.vignette?.darkness ?? null,
    });
  }

  // ------------------------------------------------------------------ renderer hooks (called by Game.boot's wrappers)
  /** The world's exposure (EV) as the renderer should apply it: plus the photo's compensation. */
  mapExposure(worldEV: number): number {
    this.baseEV = worldEV;
    return this.entered ? worldEV + this.appliedEV : worldEV;
  }

  /** The world's colour grade as the renderer should apply it: through the photo look. */
  mapGrade(g: GradeParams): GradeParams {
    this.baseGrade.saturation = g.saturation;
    for (let i = 0; i < 3; i++) this.baseGrade.gain[i] = g.gain[i];
    if (!this.entered || this.look === 'natural') return g;
    return applyLook(this.outGrade, g, this.look);
  }

  private pushLook(): void {
    const app = this.game.app;
    if (!app) return;
    app.setGrade(this.mapGrade(this.baseGrade));
    const out = this.rig()?.out;
    if (out) this.applyPost(app, out, 1);
    this.game.requestRender?.();
  }

  private restoreRender(): void {
    const app = this.game.app;
    this.appliedEV = 0;
    if (!app) return;
    app.post?.setHooks({ bokehOverride: null, dofStrength: 1, vignetteOffset: null, vignetteDarkness: null });
    app.setExposure(this.baseEV);
    app.setGrade({ saturation: this.baseGrade.saturation, gain: [this.baseGrade.gain[0], this.baseGrade.gain[1], this.baseGrade.gain[2]] });
  }

  private restoreOverlays(): void {
    const was = this.entryOverlays, now = overlaySignal.peek();
    this.entryOverlays = null;
    if (!was) return;
    if (now.other !== was.other) {
      if (was.other) setOverlay(was.other, true);
      else if (now.other) setOverlay(now.other, false);
    }
    if (now.scent !== was.scent) setOverlay('scent', was.scent);
  }

  // ------------------------------------------------------------------ actions (UI, keys, debug API)
  private touch(): void {
    this.stale = true;
    this.game.requestRender?.();
    this.publish(true);
  }

  setFocalMm(v: number): void { const r = this.rig(); if (r) { setFocalMm(r, v); this.touch(); } }
  setFNumber(v: number): void { const r = this.rig(); if (r) { setFNumber(r, v); this.touch(); } }
  setFocusBu(v: number): void { const r = this.rig(); if (r) { this.focusMode = 'manual'; setFocusBu(r, v); this.touch(); } }
  setExposureEV(v: number): void { const r = this.rig(); if (r) { setExposureEV(r, v); this.touch(); } }
  setRollDeg(v: number): void { const r = this.rig(); if (r) { setRollDeg(r, v); this.touch(); } }
  setFocusMode(m: PhotoFocusMode): void {
    if (m === 'subject' && !this.subject) return;
    this.focusMode = m;
    this.touch();
  }
  setOrbit(on: boolean): void { this.orbitPref = on; this.touch(); }
  setLook(id: string): void { if (isLookId(id)) { this.look = id; this.pushLook(); this.publish(true); } }
  setGuides(g: PhotoGuides): void { this.guides = g; this.publish(true); }
  setHideMarkers(on: boolean): void { this.hideMarkers = on; this.touch(); }
  setCaptureScale(n: number): void { this.captureScale = n >= 2 ? 2 : 1; this.publish(true); }
  resetLens(): void { const r = this.rig(); if (r) { resetLens(r); setFocalMm(r, this.entryFocalMm); this.touch(); } }

  /** Makes a thing the subject of the photo and focuses on it. */
  setSubject(ref: SubjectRef | null): boolean {
    const s = this.session;
    if (!s) return false;
    const sub = ref ? resolveSubject(s, ref, this.alpha) : null;
    if (ref && !sub) return false;
    this.subjectRef = ref; this.subject = sub;
    this.focusMode = sub ? 'subject' : 'centre';
    this.touch();
    return true;
  }

  /** Aims the camera at the subject and focuses on it. */
  frameSubject(): void {
    const r = this.rig();
    if (!r || !this.subject) return;
    aimAt(r, this.subject.pos);
    this.focusMode = 'subject';
    this.touch();
  }

  // ------------------------------------------------------------------ capture
  /** Renders and encodes the frame at `scale` (1 = canvas size, 2 = twice that when the GPU allows), then delivers it. */
  async capture(scale: number = 1): Promise<PhotoCaptureInfo | null> {
    const s = this.session, app = this.game.app;
    if (!this.entered || !s || !app || this.capturing) return null;
    this.capturing = true; this.error = null; this.captureScale = scale >= 2 ? 2 : 1;
    this.publish(true);
    try {
      // ph-capture is read in the middle of a frame: render only once that frame is over, so no input is handled twice
      await Promise.resolve();
      if (!this.entered || this.session !== s) return null;
      if (this.stale) this.game.renderNow?.(0); // a lens change not yet drawn
      const out = s.views.photo.out;
      const img = await captureFrame(app, scale, {
        before: (k) => { this.applyPost(app, out, k); },
        after: () => { this.applyPost(app, out, 1); },
      });
      return this.deliver(s, img);
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      this.game.toast(`The photo could not be taken: ${this.error}`);
      return null;
    } finally {
      this.capturing = false;
      this.publish(true);
    }
  }

  private deliver(s: GameSession, img: CaptureImage): PhotoCaptureInfo {
    const env = this.envNow(), filename = photoFilename(filenamePartsOf(s.sim));
    this.dropPreview();
    const url = makeUrl(img.blob, env) ?? '';
    const download = tryDownload(img.blob, filename, env);
    const info: PhotoCaptureInfo = {
      filename, width: img.width, height: img.height, bytes: img.blob.size, scale: img.scale, reduced: img.reduced, method: img.method, download, url, blob: img.blob,
    };
    const ui: PhotoPreviewUi = {
      url, filename, width: img.width, height: img.height, bytes: img.blob.size, scale: img.scale, reduced: img.reduced, download,
      note: downloadNote(download, env.framed, filename), message: url ? null : 'This browser would not show the image here.',
      canOpenTab: !!url && !tabsBlocked(env),
    };
    this.preview = { info, ui };
    this.lastCapture = info;
    return info;
  }

  private setPreviewMessage(m: string): void {
    if (this.preview) this.preview.ui = { ...this.preview.ui, message: m };
    this.publish(true);
  }

  saveAgain(): void {
    const p = this.preview;
    if (!p) return;
    const env = this.envNow(), o = tryDownload(p.info.blob, p.info.filename, env);
    p.ui = { ...p.ui, download: o, note: downloadNote(o, env.framed, p.info.filename) };
    this.publish(true);
  }

  openInTab(): void {
    const p = this.preview;
    if (!p) return;
    const env = this.envNow();
    if (tabsBlocked(env)) { this.setPreviewMessage('This page sits in a frame that does not allow new tabs. Right-click the image to save it.'); return; }
    const ok = openInNewTab(p.info.url || null, env);
    this.setPreviewMessage(ok ? 'Opened in a new tab.' : 'Your browser did not open a new tab here. Right-click the image to save it.');
  }

  async copyImage(): Promise<void> {
    const p = this.preview;
    if (!p) return;
    const ok = await copyImage(p.info.blob, this.envNow());
    this.setPreviewMessage(ok ? 'Copied to the clipboard.' : 'Your browser did not allow copying the image here. Right-click the image to copy or save it.');
  }

  closePreview(): void {
    this.dropPreview();
    this.publish(true);
  }

  private dropPreview(): void {
    if (this.preview) revokeUrl(this.preview.info.url || null, this.envNow());
    this.preview = null;
  }

  exit(): void {
    if (this.entered) this.game.togglePhoto?.();
  }

  // ------------------------------------------------------------------ UI read-out
  ui(): PhotoUi | null {
    const s = this.session, rig = this.rig();
    if (!this.entered || !s || !rig) return null;
    const app = this.game.app, lens = readLens(rig);
    const hasDof = !!app?.post && app.post.current.dof.enabled && app.post.current.dof.bokehScale > 0;
    const post = app?.post?.current;
    let w = 0, h = 0, maxScale = 1;
    if (app) {
      try { const base = captureBaseSize(app); w = base.width; h = base.height; } catch { w = app.renderer.domElement.width; h = app.renderer.domElement.height; }
      try { maxScale = maxCaptureScale(w, h, readGpuLimits(app.renderer.getContext())); } catch { maxScale = 1; }
    }
    return {
      active: true, lens, ranges: { focalMm: [...LENS_RANGES.focalMm], fNumber: [...LENS_RANGES.fNumber], focusBu: [...LENS_RANGES.focusBu], exposureEV: [...LENS_RANGES.exposureEV], rollDeg: [...LENS_RANGES.rollDeg] },
      focusMode: this.focusMode, look: this.look, looks: LOOK_IDS.map((id) => ({ id, label: LOOKS[id].label })), guides: this.guides,
      hideMarkers: this.hideMarkers, orbit: this.orbit, subject: this.subject?.label ?? null,
      caps: { depthOfField: hasDof, vignette: !!post?.vignette.enabled, maxScale, width: w, height: h, quality: app?.quality.id ?? 'unknown' },
      captureScale: this.captureScale, capturing: this.capturing, preview: this.preview ? this.preview.ui : null, error: this.error,
    };
  }

  /** Publishes the read-out to the panel (throttled while frames run). */
  publish(force: boolean): void {
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    if (!force && now - this.lastPublish < PUBLISH_MS) return;
    this.lastPublish = now;
    publishPhoto(this.ui());
  }
}
