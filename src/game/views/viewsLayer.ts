// The views layer: picking and the per-view tools on top of the camera rigs (views task). Game calls frame() once
// per rendered frame, before the camera rig updates: it picks under the cursor with the camera the player is looking
// through, handles the observer's and the colony view's clicks and keys, sets the hover / inspect highlights, feeds a
// followed creature to the observer, and redraws the markers, plan outlines and the planner's ghost.
// The HUD reads the inspect target through `inspectTarget` (a plain getter; see the task report).
import type { PerspectiveCamera, Scene } from 'three';
import type { RenderApp } from '@/render/app';
import type { InputState } from '@/input';
import type { HighlightRef, RenderRegistry } from '@/render';
import { MarkerRenderer, type MarkerSceneDesc } from '@/render/fx/markers/MarkerRenderer';
import type { NestGhost, NestPick } from '@/render/nest';
import type { ChamberType, Command, Sim } from '@/sim/types';
import type { GameSession } from '../session';
import type { GameMode } from '../time/speedRules';
import { colonyCancel, colonyClick, colonyHover, colonyPoll, colonyKeys, plannerActive, selectTool, type ColonyHost, type ColonyTools } from './colony/colonyControl';
import { DigPlanner } from './colony/digPlanner';
import { ColonyEdits, type PlanEdit } from './colony/edits';
import { buildMarkerScene } from './colony/markerScene';
import { MarkerTool } from './colony/markerTool';
import { observerInput, type ObserverHost } from './observerControl';
import { highlightRefOf, type PickTarget } from './picking/entityPick';
import { scenePick, type ScenePick } from './picking/scenePick';
import { CursorTracker } from './pointer';
import { PhotoMode } from './photo/PhotoMode';
import { tremorStruck } from './tremorCue';
import type { CameraStateChange, ViewSubject } from './viewDirector';
import { ViewsState, type ColonyTool } from './viewsState';

/** What the views layer asks of the Game (Game satisfies it structurally). */
export interface ViewsGame {
  readonly session: GameSession | null;
  readonly mode: GameMode;
  readonly camera: PerspectiveCamera;
  /** Photo mode's needs of the renderer (optional: the layer works on a bare game in tests). */
  readonly app?: RenderApp;
  readonly opts?: { readonly canvas: HTMLCanvasElement; readonly testMode: boolean };
  requestRender?(): void;
  renderNow?(settleS?: number): void;
  togglePhoto?(): void;
  hover: HighlightRef | null;
  inspect: HighlightRef | null;
  possess(target: number, via?: 'command' | 'role-key' | 'cycle' | 'last'): unknown;
  command(cmd: Command): { applied: boolean; rejected: readonly { reason?: string }[] };
  toast(text: string): void;
}

interface NestLike {
  pick(ndcX: number, ndcY: number, maxDist?: number): NestPick | null;
  ghosts: { set(list: readonly NestGhost[]): void };
}

export class ViewsLayer {
  readonly cursor = new CursorTracker();
  readonly state = new ViewsState();
  readonly tools: ColonyTools = { markers: new MarkerTool(), planner: new DigPlanner() };
  /** Plan, chamber and entrance edits of the selection (GDD 03 §14.2; the inspect card calls editSelection etc.). */
  readonly edits = new ColonyEdits();
  /** Photo mode: the subject, focus, look and capture (src/game/views/photo). */
  readonly photo: PhotoMode;
  /** Followed creature (the session follows ants itself), -1 none. */
  followCreatureId = -1;
  lastPick: ScenePick | null = null;
  private markers: MarkerRenderer | null = null;
  /** What the marker renderer drew last (debug read-out: labels of the colony view). */
  lastMarkerScene: MarkerSceneDesc | null = null;
  private nest: NestLike | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private appliedHover: HighlightRef | null = null;
  private appliedInspect: HighlightRef | null = null;
  private pickKey = '';
  private lastView = '';
  /** Sim tick up to which tremor cues were checked, -1 not yet this game. */
  private tremorTick = -1;
  /** Footstep tremors that shook the possession camera since the game started (debug read-out, e2e). */
  tremorStrikes = 0;
  private readonly cameraStateListeners: ((e: CameraStateChange) => void)[] = [];
  private cameraStateSource: { onCameraState(cb: (e: CameraStateChange) => void): () => void } | null = null;
  private cameraStateOff: (() => void) | null = null;
  private readonly subj: ViewSubject = { pos: { x: 0, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, fwd: { x: 1, y: 0, z: 0 }, lengthBu: 1, underground: false, airborne: false };

  constructor(private readonly game: ViewsGame) {
    this.photo = new PhotoMode(game, this);
  }

  /** The selection the inspect card shows (observer / colony click), null none. */
  get inspectTarget(): PickTarget | null { return this.state.selected; }
  /** What is under the cursor, null none. */
  get hoverTarget(): PickTarget | null { return this.state.hover; }
  /** The selected dig plan (colony view), -1 none. */
  get selectedPlanId(): number { return this.state.selectedPlanId; }

  /** GDD 03 §14.2 "Edit": priority, pause / resume or cancel of the selected plan (or `planId`). */
  editPlan(edit: PlanEdit, planId = this.state.selectedPlanId): boolean {
    const s = this.game.session;
    if (!s || planId < 0) return false;
    const ok = this.edits.plan(this.colonyHost(s), planId, edit);
    if (ok && edit === 'cancel' && planId === this.state.selectedPlanId) this.state.selectedPlanId = -1;
    return ok;
  }

  /** GDD 03 §14.2: the selected chamber (or `chamberId`) takes a new use. */
  designateChamber(type: ChamberType, chamberId = this.state.selected?.kind === 'chamber' ? this.state.selected.id : -1): boolean {
    const s = this.game.session;
    return !!s && chamberId >= 0 && this.edits.designateChamber(this.colonyHost(s), chamberId, type);
  }

  /** GDD 03 §14.2: seal the selected entrance (or `entranceId`) when open, reopen it when sealed. */
  toggleEntrance(entranceId = this.state.selected?.kind === 'entrance' ? this.state.selected.id : -1): 'seal' | 'reopen' | null {
    const s = this.game.session;
    return s && entranceId >= 0 ? this.edits.toggleEntrance(this.colonyHost(s), entranceId) : null;
  }

  /**
   * GDD 01 App. C `camera-state-changed` (the possession camera's environment state) for the UI and audio; survives
   * new games. Returns the unsubscribe function.
   */
  onCameraState(cb: (e: CameraStateChange) => void): () => void {
    this.cameraStateListeners.push(cb);
    return () => { const i = this.cameraStateListeners.indexOf(cb); if (i >= 0) this.cameraStateListeners.splice(i, 1); };
  }

  /** Set-up after the renderers exist (Game.boot). */
  attach(canvas: HTMLCanvasElement, scene: Scene, registry: RenderRegistry): void {
    this.canvas = canvas;
    this.cursor.attach(canvas);
    const nestSlot = registry.entries.find((e) => e.slot === 'nest')?.renderer as unknown as { nest?: NestLike } | undefined;
    this.nest = nestSlot?.nest && typeof nestSlot.nest.pick === 'function' ? nestSlot.nest : null;
    this.markers = new MarkerRenderer(scene, this.nest ? (g) => this.nest!.ghosts.set(g) : null);
  }

  /** A new game or the end of one: tools and selections start empty. */
  reset(): void {
    this.state.hover = this.state.selected = null;
    this.state.selectedPlanId = -1;
    this.state.message = null;
    selectTool(this.state, this.tools, null);
    this.tools.markers.reset();
    this.tools.planner.reset();
    this.edits.reset();
    this.followCreatureId = -1;
    this.photo.reset();
    this.tremorTick = -1;
    this.tremorStrikes = 0;
    this.pickKey = '';
    this.lastPick = null;
    this.markers?.update(null);
  }

  /**
   * One frame, before the camera rig updates. `input` is null while the camera is only being settled (scripted
   * screenshots): picking and drawing still happen, clicks do not. `alpha` is the tick interpolation this frame is drawn at.
   */
  frame(s: GameSession, input: InputState | null, nowS: number, alpha = 1): void {
    const view = s.view, st = this.state, entered = this.lastView !== view;
    this.lastView = view;
    this.photo.sync(s, alpha);
    this.relayCameraState(s);
    this.checkTremor(s);
    colonyPoll(s.sim, st, this.tools, this.colonyHost(s));
    this.edits.poll(s.sim);
    s.views.colonyCapture = view === 'colony' && plannerActive(st);
    if (view === 'colony') {
      const rig = s.views.colony;
      rig.setDeepest(deepestNestY(s.sim));
      rig.setNestSpan(nestSpanBu(s.sim));
      // just entered: the slice starts 2 BU above the ant the camera rose from (ColonyRig.enter could only clamp it
      // to the default depth range: it does not know the nest)
      if (entered && rig.cutaway.mode === 'slice') {
        const a = s.sim.stores.ants.get(s.followId >= 0 ? s.followId : s.sim.state.player.returnAntId);
        if (a) rig.cutaway.planeY = Math.max(rig.cutaway.minPlaneY, Math.min(0, a.pos.y + 2 * s.sim.world.bu));
      }
    }
    const pick = view === 'observer' || view === 'colony' ? this.pick(s) : null;
    if (view === 'observer') {
      observerInput(input, pick?.hits ?? [], st, this.observerHost(s), nowS, this.cursor);
    } else if (view === 'colony') {
      colonyHover(s.sim, pick, st, this.tools);
      if (input) {
        colonyKeys(input, st, this.tools, this.colonyHost(s));
        if (input.pressed('cv-confirm')) colonyClick(s.sim, pick, st, this.tools, this.colonyHost(s), nowS, input.codeHeld('ShiftLeft') || input.codeHeld('ShiftRight'));
        if (input.pressed('cv-cancel')) colonyCancel(st, this.tools);
      }
    } else {
      st.hover = null;
      if (view === 'possess' && entered) st.selected = null; // the possessed ant inspects with T
      if (view === 'photo') this.photo.frame(s, input, alpha);
    }
    if (view !== 'colony' && st.tool) selectTool(st, this.tools, null);
    this.feedCreature(s);
    // photo mode's "hide markers and outlines" (on by default, GDD 08 §7.9): no outlines, rings or markers in the
    // picture, and that includes the dig-plans overlay's plan outlines (the overlay stays switched on underneath)
    const quiet = this.photo.hidesMarkers;
    this.applyHighlights(quiet);
    this.lastMarkerScene = buildMarkerScene({
      sim: s.sim, colony: view === 'colony', plans: this.digPlansOverlay() && !quiet, selectedMarkerId: this.tools.markers.selectedId, selectedPlanId: st.selectedPlanId,
      preview: view === 'colony' && plannerActive(st) ? this.tools.planner.preview : null, tunnelStart: this.tools.planner.tunnelStart?.pos ?? null,
      hover: view === 'possess' || quiet ? null : st.hover, selected: quiet ? null : st.selected, cutaway: view === 'colony' ? s.views.colony.cutaway.mode : 'off',
      slicePlaneY: view === 'colony' ? s.views.colony.cutaway.planeY : null,
    });
    this.markers?.update(this.lastMarkerScene);
  }

  /**
   * The dig-plans overlay is on (the fx renderer flags it on the marker layer, src/render/fx/overlays/FxRenderer.ts):
   * plan outlines are then drawn in every view, not only in the colony view.
   */
  private digPlansOverlay(): boolean {
    return this.markers?.group.userData.digPlansOverlay === true;
  }

  /** Esc in the colony view: cancels the active tool / ghost first (GDD 01 §5.4); true when it was used. */
  consumeEscape(s: GameSession | null): boolean {
    return !!s && s.view === 'colony' && colonyCancel(this.state, this.tools);
  }

  selectTool(tool: ColonyTool | null): void {
    selectTool(this.state, this.tools, tool);
  }

  /** The scene pick under the cursor (cached while neither the cursor, the camera nor the sim tick changed). */
  pick(s: GameSession): ScenePick | null {
    if (!this.cursor.inside || !this.canvas) { this.lastPick = null; this.pickKey = ''; return null; }
    const cam = this.game.camera, e = cam.matrixWorld.elements, c = s.views.view === 'colony' ? s.views.colony.cutaway : null;
    const key = [this.cursor.x, this.cursor.y, e[12], e[13], e[14], e[8], e[9], e[10], cam.fov, s.sim.state.tick, s.view, c ? `${c.mode}${c.planeY}` : ''].join(',');
    if (key === this.pickKey && this.lastPick) return this.lastPick;
    this.pickKey = key;
    const w = this.canvas.clientWidth || this.canvas.width, h = this.canvas.clientHeight || this.canvas.height;
    this.lastPick = scenePick({
      sim: s.sim, camera: cam, width: w, height: h, x: this.cursor.x, y: this.cursor.y, cutaway: c,
      underground: s.sim.field.substrate(cam.position) < 0, nestPick: this.nest ? (x, y) => this.nest!.pick(x, y) : null,
    });
    return this.lastPick;
  }

  observerHost(s: GameSession): ObserverHost {
    return {
      possess: (id) => { this.game.possess(id); },
      follow: (t) => this.follow(s, t),
      following: () => (s.followId >= 0 ? { kind: 'ant', id: s.followId, pos: { x: 0, y: 0, z: 0 } } : this.followCreatureId >= 0 ? { kind: 'creature', id: this.followCreatureId, pos: { x: 0, y: 0, z: 0 } } : null),
      colonyId: () => s.sim.state.colonies[0]?.id ?? -1,
      antColony: (id) => s.sim.stores.ants.get(id)?.colony ?? -2,
    };
  }

  colonyHost(s: GameSession): ColonyHost {
    const g = this.game;
    return { sim: s.sim, command: (cmd) => g.command(cmd), toast: (t) => g.toast(t), possess: (id) => { g.possess(id); } };
  }

  /** Observer follow of an ant or creature; null stops following (free fly from the current pose). */
  follow(s: GameSession, t: PickTarget | null): void {
    if (!t) {
      s.followId = -1; s.followItemId = -1; this.followCreatureId = -1;
      const p = s.views.pose;
      s.views.freeFlyAt({ ...p.pos }, { ...p.look });
      return;
    }
    if (t.kind === 'ant') {
      const a = s.sim.stores.ants.get(t.id);
      if (!a) return;
      this.followCreatureId = -1;
      s.followId = a.id; s.followItemId = -1;
      s.views.follow(s.subjectOf(a, 1));
    } else if (t.kind === 'creature') {
      s.followId = -1; s.followItemId = -1;
      this.followCreatureId = t.id;
      const sub = this.creatureSubject(s.sim, t.id);
      if (sub) s.views.follow(sub);
    }
  }

  private feedCreature(s: GameSession): void {
    if (this.followCreatureId < 0) return;
    if (s.view !== 'observer' || s.followId >= 0) { this.followCreatureId = -1; return; }
    const sub = this.creatureSubject(s.sim, this.followCreatureId);
    if (sub) s.views.setSubject(sub);
    else { this.followCreatureId = -1; s.views.unfollow(); } // gone: the observer holds, then flies free
  }

  private creatureSubject(sim: Sim, id: number): ViewSubject | null {
    const c = sim.state.creatures.find((x) => x.id === id && x.alive);
    if (!c) return null;
    const o = this.subj;
    o.pos = { ...c.pos }; o.up = { ...c.up }; o.fwd = { ...c.fwd };
    o.lengthBu = 3; o.underground = sim.field.substrate(c.pos) < 0; o.airborne = c.medium === 'air';
    return o;
  }

  /** Each session has its own ViewDirector: re-subscribe when it changes, and pass its events on. */
  private relayCameraState(s: GameSession): void {
    if (this.cameraStateSource === s.views) return;
    this.cameraStateOff?.();
    this.cameraStateSource = s.views;
    this.cameraStateOff = s.views.onCameraState((e) => { for (const cb of [...this.cameraStateListeners]) cb(e); });
  }

  /** A footstep tremor reaching the possessed ant shakes the possession camera (GDD 01 §6.1). */
  private checkTremor(s: GameSession): void {
    const tick = s.sim.state.tick, since = this.tremorTick;
    this.tremorTick = tick;
    if (since < 0 || s.view !== 'possess') return;
    const a = s.possessedAnt();
    if (a && tremorStruck(s.sim, a.pos, since)) { s.views.tremor(); this.tremorStrikes++; }
  }

  /** Writes hover / inspect highlights only when they changed here (so a debug-API highlight is not overwritten). */
  private applyHighlights(quiet = false): void {
    const h = quiet ? null : highlightRefOf(this.state.hover), i = quiet ? null : highlightRefOf(this.state.selected);
    if (!sameRef(h, this.appliedHover)) { this.game.hover = h; this.appliedHover = h; }
    if (!sameRef(i, this.appliedInspect)) { this.game.inspect = i; this.appliedInspect = i; }
  }

  dispose(): void {
    this.photo.dispose();
    this.cameraStateOff?.();
    this.cameraStateOff = null;
    this.cameraStateSource = null;
    this.cursor.detach();
    this.markers?.dispose();
    this.markers = null;
  }
}

/** Lowest point of the player colony's chambers and plans (mm): the colony slice may go 10 BU below it. */
export function deepestNestY(sim: Sim): number {
  let y = 0;
  const col = sim.state.colonies[0]?.id ?? -1;
  for (const n of sim.state.nests) {
    if (n.colony !== col) continue;
    for (const c of n.chambers) y = Math.min(y, c.center.y - c.radii.y);
    for (const p of n.digPlans) for (const sp of p.spheres) y = Math.min(y, sp.c.y - sp.r);
    for (const e of n.entrances) y = Math.min(y, e.pos.y);
  }
  return y;
}

/** Span of the player colony's nests (BU): the larger of the horizontal and vertical extent of chambers and entrances. */
export function nestSpanBu(sim: Sim): number {
  const col = sim.state.colonies[0]?.id ?? -1;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  const add = (x: number, y: number, z: number, rx: number, ry: number, rz: number) => {
    x0 = Math.min(x0, x - rx); x1 = Math.max(x1, x + rx);
    y0 = Math.min(y0, y - ry); y1 = Math.max(y1, y + ry);
    z0 = Math.min(z0, z - rz); z1 = Math.max(z1, z + rz);
  };
  for (const n of sim.state.nests) {
    if (n.colony !== col) continue;
    for (const c of n.chambers) add(c.center.x, c.center.y, c.center.z, c.radii.x, c.radii.y, c.radii.z);
    for (const e of n.entrances) add(e.pos.x, e.pos.y, e.pos.z, 0, 0, 0);
  }
  if (!Number.isFinite(x0)) return 0;
  return Math.max(x1 - x0, z1 - z0, y1 - y0) / sim.world.bu;
}

function sameRef(a: HighlightRef | null, b: HighlightRef | null): boolean {
  return a === b || (!!a && !!b && a.kind === b.kind && a.id === b.id);
}
