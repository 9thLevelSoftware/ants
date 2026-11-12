// The views layer: picking and the per-view tools on top of the camera rigs (views task). Game calls frame() once
// per rendered frame, before the camera rig updates: it picks under the cursor with the camera the player is looking
// through, handles the observer's and the colony view's clicks and keys, sets the hover / inspect highlights, feeds a
// followed creature to the observer, and redraws the markers, plan outlines and the planner's ghost.
// The HUD reads the inspect target through `inspectTarget` (a plain getter; see the task report).
import type { PerspectiveCamera, Scene } from 'three';
import type { InputState } from '@/input';
import type { HighlightRef, RenderRegistry } from '@/render';
import { MarkerRenderer } from '@/render/fx/markers/MarkerRenderer';
import type { NestGhost, NestPick } from '@/render/nest';
import type { Command, Sim } from '@/sim/types';
import type { GameSession } from '../session';
import type { GameMode } from '../time/speedRules';
import { colonyCancel, colonyClick, colonyHover, colonyKeys, plannerActive, selectTool, type ColonyHost, type ColonyTools } from './colony/colonyControl';
import { DigPlanner } from './colony/digPlanner';
import { buildMarkerScene } from './colony/markerScene';
import { MarkerTool } from './colony/markerTool';
import { observerInput, type ObserverHost } from './observerControl';
import { highlightRefOf, type PickTarget } from './picking/entityPick';
import { scenePick, type ScenePick } from './picking/scenePick';
import { CursorTracker } from './pointer';
import type { ViewSubject } from './viewDirector';
import { ViewsState, type ColonyTool } from './viewsState';

/** What the views layer asks of the Game (Game satisfies it structurally). */
export interface ViewsGame {
  readonly session: GameSession | null;
  readonly mode: GameMode;
  readonly camera: PerspectiveCamera;
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
  /** Followed creature (the session follows ants itself), -1 none. */
  followCreatureId = -1;
  lastPick: ScenePick | null = null;
  private markers: MarkerRenderer | null = null;
  private nest: NestLike | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private appliedHover: HighlightRef | null = null;
  private appliedInspect: HighlightRef | null = null;
  private pickKey = '';
  private lastView = '';
  private readonly subj: ViewSubject = { pos: { x: 0, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, fwd: { x: 1, y: 0, z: 0 }, lengthBu: 1, underground: false, airborne: false };

  constructor(private readonly game: ViewsGame) {}

  /** The selection the inspect card shows (observer / colony click), null none. */
  get inspectTarget(): PickTarget | null { return this.state.selected; }
  /** What is under the cursor, null none. */
  get hoverTarget(): PickTarget | null { return this.state.hover; }

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
    this.tools.markers.selectedId = -1;
    this.followCreatureId = -1;
    this.pickKey = '';
    this.lastPick = null;
    this.markers?.update(null);
  }

  /**
   * One frame, before the camera rig updates. `input` is null while the camera is only being settled (scripted
   * screenshots): picking and drawing still happen, clicks do not.
   */
  frame(s: GameSession, input: InputState | null, nowS: number): void {
    const view = s.view, st = this.state, entered = this.lastView !== view;
    this.lastView = view;
    s.views.colonyCapture = view === 'colony' && plannerActive(st);
    if (view === 'colony') {
      const rig = s.views.colony;
      rig.setDeepest(deepestNestY(s.sim));
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
    }
    if (view !== 'colony' && st.tool) selectTool(st, this.tools, null);
    this.feedCreature(s);
    this.applyHighlights();
    this.markers?.update(buildMarkerScene({
      sim: s.sim, colony: view === 'colony', selectedMarkerId: this.tools.markers.selectedId, selectedPlanId: st.selectedPlanId,
      preview: view === 'colony' && plannerActive(st) ? this.tools.planner.preview : null, tunnelStart: this.tools.planner.tunnelStart?.pos ?? null,
      hover: view === 'possess' ? null : st.hover, selected: st.selected, cutaway: view === 'colony' ? s.views.colony.cutaway.mode : 'off',
    }));
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

  /** Writes hover / inspect highlights only when they changed here (so a debug-API highlight is not overwritten). */
  private applyHighlights(): void {
    const h = highlightRefOf(this.state.hover), i = highlightRefOf(this.state.selected);
    if (!sameRef(h, this.appliedHover)) { this.game.hover = h; this.appliedHover = h; }
    if (!sameRef(i, this.appliedInspect)) { this.game.inspect = i; this.appliedInspect = i; }
  }

  dispose(): void {
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

function sameRef(a: HighlightRef | null, b: HighlightRef | null): boolean {
  return a === b || (!!a && !!b && a.kind === b.kind && a.id === b.id);
}
