// The panels' seam to the running Game (task ui-panels), built only from what Game already exposes: the views layer
// (tool state, designate / seal edits), the session (camera rigs, view switching), `hover` / `inspect` highlights and
// `command`. Everything is optional, so any facade (the demo page's mock) degrades to "nothing", never to an error.
import type { ChamberType, CodexUnlock } from '@/sim/types';
import { MARKER_RADIUS_RANGE_BU } from '@/sim/balance/colony';
import type { UiFocus } from '@/ui/api';
import type { ColonyToolId, PanelsBridge, PlanTemplateId, UiToolState } from '@/ui/panels/wiring/bridgeTypes';
import { selectTool } from '../../views/colony/colonyControl';
import { DigPlanner } from '../../views/colony/digPlanner';
import type { ViewsLayer } from '../../views/viewsLayer';
import { unlockLabel } from './dates';
import { playerNestOf } from './nestSlice';

interface RigLike {
  target: { x: number; y: number; z: number };
  distance: number;
  cutaway: { mode: string; planeY: number; minPlaneY: number };
}

interface GameLike {
  viewsLayer?: ViewsLayer;
  session?: {
    sim: { state: { config: { rules: { seasonLengthDays: number } } }; world: { bu: number }; field: { height(x: number, z: number): number }; species: { id: string } };
    views: { colony: RigLike; freeFlyAt(pos: { x: number; y: number; z: number }, look: { x: number; y: number; z: number }): void };
    followId: number;
    view: string;
  } | null;
  hover?: { kind: string; id: number } | null;
  inspect?: { kind: string; id: number } | null;
  setView?(view: 'possess' | 'observer' | 'colony' | 'photo'): void;
  requestRender?(): void;
  refreshUi?(): void;
  viewChanged?(): void;
  /** Optional facade method attached by the persistence layer: the profile's codex block. */
  codexUnlocks?(): Record<string, CodexUnlock>;
}

/** How long a "Show" target stays outlined (GDD 08 4.4: 1 Hz pulse for 4 real s). */
export const SHOW_OUTLINE_S = 4;
/** How long a jump into the colony view keeps re-applying its cutaway plane, ms (the views layer sets its own on the first frame). */
const HOLD_CUTAWAY_MS = 1000;
/** Colony-view distance for a chamber jump, BU. */
const JUMP_DISTANCE_BU = 40;
/** Observer distance behind and above a surface target, BU. */
const OBSERVER_BACK_BU = 22;
const OBSERVER_UP_BU = 14;

/** The palette offers normal and high; low and urgent (set by other callers) read as their nearest. */
const high = (p: string): 'normal' | 'high' => (p === 'high' || p === 'urgent' ? 'high' : 'normal');

const ENTITY_HIGHLIGHT = new Set(['ant', 'brood', 'item']);

export function installPanelsBridge(game: unknown): PanelsBridge {
  const g = (game ?? {}) as GameLike;
  const layer = () => g.viewsLayer;
  let outlineTimer: ReturnType<typeof setTimeout> | null = null;

  const toolState = (): UiToolState | null => {
    const l = layer(), s = g.session;
    if (!l || !s) return null;
    const { tools, state } = l;
    const radiusBu: Record<string, number> = {};
    const radiusRange: Record<string, [number, number]> = {};
    for (const k of ['forage', 'avoid', 'rally'] as const) {
      radiusBu[k] = tools.markers.radiusBu[k];
      const r = MARKER_RADIUS_RANGE_BU[k];
      if (r) radiusRange[k] = [r[0], r[1]];
    }
    const p = tools.planner;
    return {
      tool: (state.tool as ColonyToolId | null) ?? null, radiusBu, radiusRange, rallyMode: tools.markers.rallyMode, markerPriority: high(tools.markers.priority),
      planner: {
        template: p.template, chamberType: p.chamberType, chamberTypes: [...DigPlanner.chamberTypes(s.sim as never)], size: p.size, priority: high(p.priority),
      },
      message: state.message,
    };
  };

  /** True when this call switched the game into the colony view (the views layer then sets its entry slice on the next frame). */
  const toColony = (): boolean => {
    if (!g.session || g.session.view === 'colony') return false;
    g.setView?.('colony');
    return true;
  };

  /**
   * Cuts the colony view open at `planeY`. A view that was just entered gets its slice from the views layer on its first
   * frame (2 BU above the ant the camera rose from, which is on the surface), after this call: the plane is then set
   * again for the length of the view blend, so the chamber we jumped to is the one that is cut open.
   */
  let holdTimer = 0;
  const cutAt = (rig: RigLike, planeY: number, justEntered: boolean): void => {
    const set = (): void => { rig.cutaway.mode = 'slice'; rig.cutaway.planeY = Math.max(rig.cutaway.minPlaneY, Math.min(0, planeY)); };
    set();
    if (!justEntered || typeof requestAnimationFrame === 'undefined') return;
    const until = performance.now() + HOLD_CUTAWAY_MS;
    cancelAnimationFrame(holdTimer);
    const again = (): void => {
      set();
      g.requestRender?.();
      if (performance.now() < until && g.session?.view === 'colony') holdTimer = requestAnimationFrame(again);
    };
    holdTimer = requestAnimationFrame(again);
  };

  const outline = (kind: string, id: number): void => {
    if (!ENTITY_HIGHLIGHT.has(kind) || id < 0) return;
    g.inspect = { kind, id };
    g.requestRender?.();
    if (outlineTimer) clearTimeout(outlineTimer);
    outlineTimer = setTimeout(() => { outlineTimer = null; if (g.inspect && g.inspect.id === id) g.inspect = null; g.requestRender?.(); g.refreshUi?.(); }, SHOW_OUTLINE_S * 1000);
  };

  return {
    tool: toolState,
    selectTool(tool: ColonyToolId | null) {
      const l = layer();
      if (!l) return;
      if (tool) toColony();
      selectTool(l.state, l.tools, tool);
      g.requestRender?.();
      g.refreshUi?.();
    },
    setRadius(kind, bu) { layer()?.tools.markers.setRadius(kind as never, bu); g.refreshUi?.(); },
    setRallyMode(mode) { const l = layer(); if (l) l.tools.markers.rallyMode = mode; g.refreshUi?.(); },
    setMarkerPriority(p) { const l = layer(); if (l) l.tools.markers.priority = p; g.refreshUi?.(); },
    setPlanner(o) {
      const l = layer();
      if (!l) return;
      const p = l.tools.planner;
      if (o.template) p.setTemplate(o.template as PlanTemplateId);
      if (o.chamberType) p.chamberType = o.chamberType as ChamberType;
      if (o.size) p.size = o.size;
      if (o.priority) p.priority = o.priority;
      g.refreshUi?.();
    },
    jumpToChamber(id) {
      const s = g.session;
      const c = s ? playerNestOf(s.sim as never)?.chambers.find((x) => x.id === id) : undefined;
      if (!s || !c) return;
      const entered = toColony();
      const bu = s.sim.world.bu, r = s.views.colony;
      r.target.x = c.center.x; r.target.z = c.center.z; r.target.y = s.sim.field.height(c.center.x, c.center.z);
      r.distance = JUMP_DISTANCE_BU * bu;
      cutAt(r, c.center.y + 1 * bu, entered);
      g.requestRender?.();
    },
    jumpTo(focus: UiFocus) {
      const s = g.session;
      if (!s) return;
      const bu = s.sim.world.bu;
      const underground = focus.pos.y < s.sim.field.height(focus.pos.x, focus.pos.z) - 1.5 * bu;
      if (underground || focus.kind === 'chamber' || focus.kind === 'plan') {
        const entered = toColony();
        const r = s.views.colony;
        r.target.x = focus.pos.x; r.target.z = focus.pos.z; r.target.y = s.sim.field.height(focus.pos.x, focus.pos.z);
        r.distance = JUMP_DISTANCE_BU * bu;
        cutAt(r, focus.pos.y + 1 * bu, entered);
      } else {
        g.setView?.('observer'); // in possession the jump switches to the observer first
        const p = focus.pos;
        s.views.freeFlyAt({ x: p.x + OBSERVER_BACK_BU * bu, y: p.y + OBSERVER_UP_BU * bu, z: p.z + OBSERVER_BACK_BU * bu }, { ...p });
      }
      outline(focus.kind, focus.id);
      g.requestRender?.();
    },
    designateChamber(chamberId, type) { return !!layer()?.designateChamber(type as ChamberType, chamberId); },
    toggleEntrance(entranceId) { return layer()?.toggleEntrance(entranceId) ?? null; },
    codexDevice() {
      const out: Record<string, { label: string }> = {};
      const unlocks = g.codexUnlocks?.() ?? {};
      const len = g.session?.sim.state.config.rules.seasonLengthDays;
      for (const id of Object.keys(unlocks)) out[id] = { label: unlockLabel(unlocks[id], len) };
      return out;
    },
  };
}
