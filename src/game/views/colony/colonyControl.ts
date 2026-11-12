// Colony-view clicks and keys (GDD 01 §5.4, §6.7; GDD 08 §4.3; GDD 03 §14.2): Shift+1..7 pick a tool, LMB places
// (marker or plan) or selects (marker, plan, ant, chamber, entrance), a double-click on an ant possesses it, RMB /
// Esc cancels the tool or the selection, Delete removes the selected marker or cancels the selected plan. While the
// planner holds a ghost, Q / E rotate it (15°) and Shift+wheel sizes it (the camera keeps R / F for the slice).
import type { Vec3 } from '@/core';
import type { InputState } from '@/input';
import type { Sim } from '@/sim/types';
import type { ScenePick } from '../picking/scenePick';
import { TOOL_ORDER, type ColonyTool, type ViewsState } from '../viewsState';
import { DigPlanner, playerNest } from './digPlanner';
import { MarkerTool, type MarkerToolKind, type ToolHost } from './markerTool';

/** Double-click window on the same ant, real s. */
export const COLONY_DBL_CLICK_S = 0.35;
/** Shift+wheel step of a marker radius, BU. */
export const MARKER_RADIUS_STEP_BU = 5;

export interface ColonyHost extends ToolHost {
  possess(antId: number): void;
}

export interface ColonyTools {
  markers: MarkerTool;
  planner: DigPlanner;
}

/** Selects a tool (null = the pointer); the planner gets the matching template. */
export function selectTool(st: ViewsState, tools: ColonyTools, tool: ColonyTool | null): void {
  st.tool = tool;
  tools.planner.cancel();
  if (tool === 'dig' && tools.planner.template === 'entrance') tools.planner.setTemplate('chamber');
  if (tool === 'entrance') tools.planner.setTemplate('entrance');
}

export function plannerActive(st: ViewsState): boolean {
  return st.tool === 'dig' || st.tool === 'entrance';
}

/** Keyboard part of one colony frame (tool hotkeys, planner rotate / size, marker radius, delete, undo). */
export function colonyKeys(input: InputState, st: ViewsState, tools: ColonyTools, h: ColonyHost): void {
  const shift = input.codeHeld('ShiftLeft') || input.codeHeld('ShiftRight');
  if (shift) {
    for (let i = 0; i < TOOL_ORDER.length; i++) if (input.codePressed(`Digit${i + 1}`)) selectTool(st, tools, TOOL_ORDER[i]);
  }
  // Shift+wheel arrives as the slice actions; R / F themselves are slice keys
  const wheelSteps = shift ? (input.pressed('cv-slice-up') && !input.codePressed('KeyR') ? 1 : 0) - (input.pressed('cv-slice-down') && !input.codePressed('KeyF') ? 1 : 0) : 0;
  if (plannerActive(st)) {
    const rot = (input.codePressed('KeyE') ? 1 : 0) - (input.codePressed('KeyQ') ? 1 : 0);
    if (rot) tools.planner.rotate(rot);
    if (wheelSteps) tools.planner.resize(wheelSteps);
  } else if (st.tool && wheelSteps) {
    tools.markers.setRadius(st.tool, tools.markers.radiusBu[st.tool] + wheelSteps * MARKER_RADIUS_STEP_BU);
  }
  if (input.pressed('cv-delete')) deleteSelected(st, tools, h);
  if (input.codePressed('KeyZ') && (input.codeHeld('ControlLeft') || input.codeHeld('ControlRight') || input.codeHeld('MetaLeft'))) tools.markers.undo(h);
}

/** Esc / RMB: cancel the tool (planner ghost first), else the selection. True when something was cancelled. */
export function colonyCancel(st: ViewsState, tools: ColonyTools): boolean {
  if (plannerActive(st) && tools.planner.tunnelStart) { tools.planner.tunnelStart = null; return true; }
  if (st.tool) { selectTool(st, tools, null); return true; }
  if (st.selected || tools.markers.selectedId >= 0 || st.selectedPlanId >= 0) {
    st.selected = null; tools.markers.selectedId = -1; st.selectedPlanId = -1;
    return true;
  }
  return false;
}

/** Live ghost of the planner for the point under the cursor. */
export function colonyHover(sim: Sim, pick: ScenePick | null, st: ViewsState, tools: ColonyTools): void {
  st.hover = pick?.hits[0] ?? null;
  if (plannerActive(st)) tools.planner.hover(sim, pick?.surface ?? null);
}

/** LMB in the colony view at the current pick; `shift`: move the selected marker here instead of selecting. */
export function colonyClick(sim: Sim, pick: ScenePick | null, st: ViewsState, tools: ColonyTools, h: ColonyHost, nowS: number, shift = false): void {
  st.message = null;
  if (plannerActive(st)) {
    const r = tools.planner.confirm(h);
    st.message = r.outcome === 'confirm-warnings' ? `${r.reason ?? 'Warning'}: click again to confirm` : r.reason;
    if (r.outcome === 'created') { st.selectedPlanId = r.planId; selectTool(st, tools, null); }
    return;
  }
  const surface = pick?.surface?.point ?? null;
  const chamber = pick?.hits.find((x) => x.kind === 'chamber') ?? null;
  if (st.tool) {
    const kind = st.tool as MarkerToolKind;
    let at: Vec3 | null = (kind === 'move-brood' || kind === 'move-queen') && chamber ? chamber.pos : surface;
    // forage / avoid mark the ground (GDD 08 §4.3): a click on a cut face or a nest wall marks the ground above it
    if (at && (kind === 'forage' || kind === 'avoid') && pick?.surface?.underground) at = { x: at.x, y: sim.field.height(at.x, at.z), z: at.z };
    if (!at) { st.message = 'Point at the ground or a chamber'; h.toast(st.message); return; }
    const r = tools.markers.place(h, kind, at, chamber?.id ?? -1);
    if (!r.ok && r.reason) { st.message = r.reason; h.toast(r.reason); }
    return;
  }
  // pointer: Shift+click moves the selected marker there; otherwise select what is under the cursor
  if (shift && tools.markers.selectedId >= 0 && surface) {
    const r = tools.markers.move(h, tools.markers.selectedId, surface, chamber?.id ?? -1);
    if (!r.ok && r.reason) { st.message = r.reason; h.toast(r.reason); }
    return;
  }
  const markerId = surface ? MarkerTool.markerAt(sim, surface) : -1;
  const top = pick?.hits[0] ?? null;
  if (top && top.kind === 'ant') {
    const dbl = nowS - st.lastClick.t <= COLONY_DBL_CLICK_S && st.lastClick.kind === 'ant' && st.lastClick.id === top.id;
    st.lastClick = { t: nowS, kind: 'ant', id: top.id };
    if (dbl && sim.stores.ants.get(top.id)?.colony === sim.state.colonies[0]?.id) { h.possess(top.id); return; }
  } else st.lastClick = { t: nowS, kind: top?.kind ?? '', id: top?.id ?? -1 };
  tools.markers.selectedId = markerId;
  st.selectedPlanId = markerId < 0 && surface ? planAt(sim, surface) : -1;
  st.selected = markerId < 0 && st.selectedPlanId < 0 ? top : null;
}

function deleteSelected(st: ViewsState, tools: ColonyTools, h: ColonyHost): void {
  if (tools.markers.selectedId >= 0) { tools.markers.remove(h, tools.markers.selectedId); return; }
  if (st.selectedPlanId >= 0) { h.command({ type: 'cancelPlan', planId: st.selectedPlanId }); st.selectedPlanId = -1; }
}

/** The player plan whose anchor or volume box contains / is nearest to p within 2 BU, -1 none. */
export function planAt(sim: Sim, p: Vec3): number {
  const nest = playerNest(sim);
  if (!nest) return -1;
  const pad = 2 * sim.world.bu;
  for (const plan of nest.digPlans) {
    if (plan.status === 'complete' || plan.status === 'cancelled') continue;
    for (const s of plan.spheres) if (Math.hypot(s.c.x - p.x, s.c.y - p.y, s.c.z - p.z) <= s.r + pad) return plan.id;
  }
  return -1;
}
