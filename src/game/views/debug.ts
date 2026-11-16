// `__game.views.*`: scripted access to picking and the view tools (tests/e2e/views.mjs). Every call goes through the
// same functions the mouse and keys use; screen positions are CSS px on the canvas. Call `renderFrame()` before
// picking so the camera is where the screenshot shows it.
import { Vector3 } from 'three';
import type { Vec3 } from '@/core';
import type { CutawayMode } from '@/render/camera';
import type { ChamberSize, ChamberType, PlanPriority } from '@/sim/types';
import type { Game } from '../Game';
import { colonyCancel, colonyClick, plannerActive } from './colony/colonyControl';
import type { PlanTemplate } from './colony/digPlanner';
import { possessTarget } from './observerControl';
import type { PlanEdit } from './colony/edits';
import type { ViewsState } from './viewsState';
import type { ColonyTool } from './viewsState';

const plain = (v: unknown): unknown => JSON.parse(JSON.stringify(v ?? null));
const _v = new Vector3();

export function buildViewsDebug(game: Game) {
  const L = game.viewsLayer;
  const session = () => {
    if (!game.session) throw new Error('__game.views: no game running');
    return game.session;
  };
  const at = (x?: number, y?: number) => { if (x !== undefined && y !== undefined) L.cursor.set({ x, y }); };
  const describeState = (st: ViewsState) => {
    const s = game.session;
    const p = L.tools.planner.preview;
    return plain({
      view: s?.view ?? null, tool: st.tool, hover: st.hover, selected: st.selected, selectedPlanId: st.selectedPlanId,
      selectedMarkerId: L.tools.markers.selectedId, message: st.message, followId: s?.followId ?? -1, followCreatureId: L.followCreatureId,
      cutaway: s && s.view === 'colony' ? s.views.colony.cutaway : null,
      planner: plannerActive(st) ? {
        template: L.tools.planner.template, chamberType: L.tools.planner.chamberType, size: L.tools.planner.size, yawDeg: L.tools.planner.yawDeg,
        tunnelStart: L.tools.planner.tunnelStart,
        preview: p ? { validity: p.validity, codes: p.codes, warnings: p.warnings, reason: p.reason, targetVolume: p.targetVolume, ms: p.ms, kind: p.spec.kind, anchor: p.anchor } : null,
      } : null,
    });
  };
  const api = {
    /** Places the scripted cursor (CSS px); null moves it off the canvas. */
    pointer(x: number | null, y?: number) { L.cursor.set(x === null ? null : { x, y: y ?? 0 }); return { x: L.cursor.x, y: L.cursor.y, inside: L.cursor.inside }; },
    /** What is under the cursor (hits nearest first, the surface point). */
    pick(x?: number, y?: number) {
      at(x, y);
      const p = L.pick(session());
      return plain(p ? { hits: p.hits.slice(0, 8), surface: p.surface } : null);
    },
    /** Screen position (CSS px) of a world point with the current camera; null when behind the camera. */
    project(p: Vec3) {
      const c = game.opts.canvas;
      _v.set(p.x, p.y, p.z).project(game.camera);
      if (_v.z > 1) return null;
      return { x: (_v.x + 1) / 2 * (c.clientWidth || c.width), y: (1 - _v.y) / 2 * (c.clientHeight || c.height) };
    },
    /** The view's left click at (x, y): observer select (cycles overlaps), colony place / select / double-click. */
    click(x?: number, y?: number, opts: { shift?: boolean } = {}) {
      at(x, y);
      const s = session();
      const pick = L.pick(s);
      if (s.view === 'observer') L.state.selected = L.state.cycler.choose(pick?.hits ?? [], L.cursor.x, L.cursor.y, performance.now() / 1000);
      else if (s.view === 'colony') colonyClick(s.sim, pick, L.state, L.tools, L.colonyHost(s), performance.now() / 1000, !!opts.shift);
      game.requestRender();
      return api.state();
    },
    /** Observer click-hold / E: possess the ant under the cursor (or the selected one). */
    possessAt(x?: number, y?: number) {
      at(x, y);
      const s = session();
      const pick = L.pick(s);
      const id = possessTarget(pick?.hits ?? [], { ...L.state, hover: pick?.hits.find((h) => h.kind === 'ant') ?? null } as ViewsState, L.observerHost(s))?.id ?? -1;
      if (id < 0) return { ok: false, reason: 'no-ant' };
      game.possess(id);
      return { ok: s.possessedId === id, id, view: s.view };
    },
    /** Observer F: follow the selection / hovered ant or creature; `false` stops following. */
    follow(on = true) {
      const s = session();
      const t = on ? (L.state.selected ?? L.state.hover) : null;
      L.follow(s, t && (t.kind === 'ant' || t.kind === 'creature') ? t : null);
      return api.state();
    },
    select(t: { kind: string; id: number } | null) {
      L.state.selected = t ? { kind: t.kind as never, id: t.id, pos: { x: 0, y: 0, z: 0 } } : null;
      return api.state();
    },
    tool(t: ColonyTool | null) { L.selectTool(t); return api.state(); },
    planner(o: { template?: PlanTemplate; chamberType?: ChamberType; size?: ChamberSize; yawDeg?: number; shaftUp?: boolean; priority?: PlanPriority; shaftLengthBu?: number }) {
      const p = L.tools.planner;
      if (o.template) p.setTemplate(o.template);
      if (o.chamberType) p.chamberType = o.chamberType;
      if (o.size) p.size = o.size;
      if (o.yawDeg !== undefined) { p.yawDeg = 0; p.rotate(Math.round(o.yawDeg / 15)); }
      if (o.shaftUp !== undefined) p.shaftUp = o.shaftUp;
      if (o.priority) p.priority = o.priority;
      if (o.shaftLengthBu !== undefined) p.shaftLengthBu = o.shaftLengthBu;
      return api.state();
    },
    /** Live ghost at (x, y) (pointer move). */
    hoverPlan(x?: number, y?: number) {
      at(x, y);
      const s = session();
      L.tools.planner.hover(s.sim, L.pick(s)?.surface ?? null);
      game.requestRender();
      return api.state();
    },
    rotate(steps: number) { L.tools.planner.rotate(steps); return api.state(); },
    resize(steps: number) { L.tools.planner.resize(steps); return api.state(); },
    radius(kind: ColonyTool, bu: number) { return L.tools.markers.setRadius(kind, bu); },
    /** Esc / RMB in the colony view. */
    cancel() { colonyCancel(L.state, L.tools); return api.state(); },
    deleteSelected() {
      const s = session();
      if (L.tools.markers.selectedId >= 0) L.tools.markers.remove(L.colonyHost(s), L.tools.markers.selectedId);
      else if (L.state.selectedPlanId >= 0) { game.command({ type: 'cancelPlan', planId: L.state.selectedPlanId }); L.state.selectedPlanId = -1; }
      return api.state();
    },
    undo() { return L.tools.markers.undo(L.colonyHost(session())); },
    /** GDD 03 §14.2 edits of the selection: a plan edit, a chamber's type, an entrance's seal / reopen. */
    editPlan(edit: PlanEdit, planId?: number) { return L.editPlan(edit, planId); },
    designateChamber(type: ChamberType, chamberId?: number) { return L.designateChamber(type, chamberId); },
    toggleEntrance(entranceId?: number) { return L.toggleEntrance(entranceId); },
    /** Footstep tremor on the possession camera (GDD 01 §6.1; the human-events task triggers it in play). */
    tremor() { session().views.tremor(); game.requestRender(); return true; },
    /** Colony view camera: target (mm), distance (BU), pitch and yaw (deg); cutaway mode and slice depth (BU below 0). */
    colonyCamera(o: { x?: number; z?: number; distBu?: number; pitchDeg?: number; yawDeg?: number; cutaway?: CutawayMode; planeYBu?: number; radiusBu?: number }) {
      const s = session();
      const r = s.views.colony, bu = s.sim.world.bu;
      if (o.x !== undefined && o.z !== undefined) { r.target.x = o.x; r.target.z = o.z; }
      if (o.distBu !== undefined) r.distance = o.distBu * bu;
      if (o.pitchDeg !== undefined) r.pitch = (o.pitchDeg * Math.PI) / 180;
      if (o.yawDeg !== undefined) r.yaw = (o.yawDeg * Math.PI) / 180;
      if (o.cutaway) r.cutaway.mode = o.cutaway;
      if (o.planeYBu !== undefined) r.cutaway.planeY = Math.max(r.cutaway.minPlaneY, Math.min(0, o.planeYBu * bu));
      if (o.radiusBu !== undefined) r.setCutRadius(o.radiusBu);
      game.requestRender();
      return plain({ target: r.target, distance: r.distance / bu, cutaway: r.cutaway });
    },
    /** Labels the colony view draws now (chamber names, the planner's reason): texts and positions, mm. */
    markerLabels() { return plain((L.lastMarkerScene?.labels ?? []).map((l) => ({ text: l.text, pos: l.pos }))); },
    /** Possession camera options not in the settings yet (ceiling comfort). */
    cameraOptions(o: { ceilingComfort?: boolean }) { session().views.third.setOptions(o); return plain(session().views.third.opts); },
    /** Possession camera read-out of the last frame. */
    possession() {
      const o = session().views.third.out;
      return plain({ state: o.state, distance: o.distance, pinch: o.pinch, occlusion: o.fade.occlusion, opacity: o.fade.target, occludedFor: o.occludedFor, guarded: o.guarded, pos: o.pos, clearance: session().views.third.clearanceMm });
    },
    /**
     * Steps the sim `ticks` ticks with the possessed ant steered toward `toward` (mm; else along `dir`, world space),
     * updating the possession camera every tick (dt 0.1 s, no rendering) and sampling it against the field: the
     * camera has a real trail behind the ant for the next screenshot, and the walk is checked frame by frame.
     */
    walk(ticks: number, o: { toward?: Vec3; dir?: Vec3; hurry?: boolean } = {}) {
      const s = session(), sim = s.sim;
      const stats = { ticks: 0, minF: Infinity, clearance: s.views.third.clearanceMm, states: {} as Record<string, number>, maxDistL: 0, minDistL: Infinity, guarded: 0, maxOccludedFor: 0 };
      for (let i = 0; i < ticks; i++) {
        const a = s.possessedAnt();
        if (!a) break;
        let d = o.dir ?? { x: 0, y: 0, z: 0 };
        if (o.toward) d = { x: o.toward.x - a.pos.x, y: o.toward.y - a.pos.y, z: o.toward.z - a.pos.z };
        const l = Math.hypot(d.x, d.y, d.z) || 1;
        game.setDebugIntent({ dir: { x: d.x / l, y: d.y / l, z: d.z / l }, hurry: !!o.hurry, grip: false, held: [], flight: null });
        s.driver.step(1);
        const sub = s.currentSubject(1);
        if (sub) s.views.setSubject(sub);
        const f = s.views.update(0.1, null), out = s.views.third.out, L = a.lengthBu * sim.world.bu;
        stats.ticks++;
        stats.minF = Math.min(stats.minF, sim.field.sampleXYZ(f.pose.pos.x, f.pose.pos.y, f.pose.pos.z));
        stats.states[out.state] = (stats.states[out.state] ?? 0) + 1;
        const dist = Math.hypot(f.pose.pos.x - a.pos.x, f.pose.pos.y - a.pos.y, f.pose.pos.z - a.pos.z) / L;
        stats.maxDistL = Math.max(stats.maxDistL, dist);
        stats.minDistL = Math.min(stats.minDistL, dist);
        if (out.guarded) stats.guarded++;
        stats.maxOccludedFor = Math.max(stats.maxOccludedFor, out.occludedFor);
      }
      game.setDebugIntent({ dir: { x: 0, y: 0, z: 0 }, hurry: false, grip: false, held: [], flight: null });
      game.afterStep(s, stats.ticks);
      return plain(stats);
    },
    /**
     * Tab / Shift+Tab `times` times inside one frame (so inside TAB_LIST_TTL_S however slow software GL renders):
     * the Game's own cycle (the input's possess-next / possess-prev); returns the possessed id after each press.
     */
    cycle(dir: 1 | -1 = 1, times = 1) {
      const ids: number[] = [];
      for (let i = 0; i < times; i++) { game.cycle(dir); ids.push(session().possessedId); }
      return ids;
    },
    state() { return describeState(L.state); },
    /** Living markers of the player colony (kind, position, radius mm). */
    markers() {
      const s = session(), col = s.sim.state.colonies[0]?.id ?? -1;
      return plain(s.sim.state.markers.filter((m) => m.alive && m.colony === col).map((m) => ({ id: m.id, kind: m.kind, pos: m.pos, radius: m.radius, targetChamberId: m.targetChamberId })));
    },
    inspectTarget() { return plain(L.inspectTarget); },
  };
  return api;
}
