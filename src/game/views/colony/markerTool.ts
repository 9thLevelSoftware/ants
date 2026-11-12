// The colony view's marker tool (GDD 08 §4.3, GDD 02 §12.2): place forage / avoid / rally markers with a radius,
// move-brood / move-queen on a chamber; select a marker, move it (remove + place again: there is no move command)
// or delete it; undo the last placements and removals (a stack of 10). Commands go through the host (Game) so they
// are applied and logged like any other. The dig planner (dig and entrance tools) is digPlanner.ts.
import type { Vec3 } from '@/core';
import { MARKER_CAP, MARKER_DEFAULT_RADIUS_BU, MARKER_RADIUS_RANGE_BU } from '@/sim/balance/colony';
import type { Command, Marker, MarkerKind, PlanPriority, RallyMode, Sim } from '@/sim/types';
import { markerLimitText, markerRefusalText } from './reasons';

export interface ToolHost {
  readonly sim: Sim;
  /** Enqueue a command (applied at once while the clock is manual / paused); the sim's refusals come back. */
  command(cmd: Command): { applied: boolean; rejected: readonly { reason?: string }[] };
  toast(text: string): void;
}

/** Marker kinds this tool places itself (dig and entrance are plans: digPlanner.ts). */
export const MARKER_TOOL_KINDS = ['forage', 'avoid', 'rally', 'move-brood', 'move-queen'] as const;
export type MarkerToolKind = (typeof MARKER_TOOL_KINDS)[number];

/** Undo stack depth (GDD 08 §4.3). */
export const MARKER_UNDO_MAX = 10;

export interface PlaceResult {
  ok: boolean;
  markerId: number;
  /** Player-facing reason when refused. */
  reason: string | null;
}

interface UndoEntry {
  op: 'placed' | 'removed';
  kind: MarkerKind;
  pos: Vec3;
  radius: number;
  params: Marker['params'];
  chamberIds: number[];
  /** The marker the operation created (placed), -1 for removals. */
  markerId: number;
}

export class MarkerTool {
  /** Radius per kind, BU (remembered between placements). */
  readonly radiusBu: Record<MarkerKind, number> = { ...MARKER_DEFAULT_RADIUS_BU };
  rallyMode: RallyMode = 'defend';
  priority: PlanPriority = 'normal';
  /** Selected marker id, -1 none. */
  selectedId = -1;
  private undoStack: UndoEntry[] = [];

  /** Sets a kind's radius, clamped to its range (BU). */
  setRadius(kind: MarkerKind, bu: number): number {
    const r = MARKER_RADIUS_RANGE_BU[kind];
    this.radiusBu[kind] = r ? Math.max(r[0], Math.min(r[1], bu)) : bu;
    return this.radiusBu[kind];
  }

  /** Living markers of a kind of the player colony. */
  static count(sim: Sim, kind: MarkerKind): number {
    const col = sim.state.colonies[0]?.id ?? -1;
    return sim.state.markers.filter((m) => m.alive && m.colony === col && m.kind === kind).length;
  }

  static atCap(sim: Sim, kind: MarkerKind): boolean {
    return MarkerTool.count(sim, kind) >= MARKER_CAP[kind];
  }

  /**
   * Places a marker at a surface / cavity point. move-brood / move-queen need the chamber under the cursor
   * (`chamberId`). Refusals come back with the words to show.
   */
  place(h: ToolHost, kind: MarkerToolKind, pos: Vec3, chamberId = -1, radiusBu?: number): PlaceResult {
    if (MarkerTool.atCap(h.sim, kind)) return { ok: false, markerId: -1, reason: markerLimitText(kind) };
    if ((kind === 'move-brood' || kind === 'move-queen') && chamberId < 0) return { ok: false, markerId: -1, reason: 'Choose a chamber of the nest' };
    const r = (radiusBu === undefined ? this.radiusBu[kind] : this.setRadius(kind, radiusBu)) * h.sim.world.bu;
    const params = { mode: kind === 'rally' ? this.rallyMode : undefined, priority: kind === 'forage' ? this.priority : undefined };
    const chamberIds = chamberId >= 0 ? [chamberId] : [];
    const id = this.issuePlace(h, kind, pos, r, params, chamberIds);
    if (id.reason) return { ok: false, markerId: -1, reason: id.reason };
    this.push({ op: 'placed', kind, pos: { ...pos }, radius: r, params: { mode: params.mode ?? null, priority: params.priority ?? null, chamberType: null, planId: -1 }, chamberIds, markerId: id.id });
    this.selectedId = id.id;
    return { ok: true, markerId: id.id, reason: null };
  }

  /** Deletes a marker (select + Delete). */
  remove(h: ToolHost, markerId: number): boolean {
    const m = h.sim.stores.markers.get(markerId);
    if (!m || !m.alive) return false;
    const entry: UndoEntry = { op: 'removed', kind: m.kind, pos: { ...m.pos }, radius: m.radius, params: { ...m.params }, chamberIds: chamberIdsOf(m), markerId: -1 };
    h.command({ type: 'removeMarker', markerId });
    if (h.sim.stores.markers.get(markerId)?.alive) return false;
    this.push(entry);
    if (this.selectedId === markerId) this.selectedId = -1;
    return true;
  }

  /** Moves a marker (and keeps its kind, radius and parameters): remove it, place it again at `to`. */
  move(h: ToolHost, markerId: number, to: Vec3, chamberId = -1): PlaceResult {
    const m = h.sim.stores.markers.get(markerId);
    if (!m || !m.alive) return { ok: false, markerId: -1, reason: 'Nothing to move' };
    const kind = m.kind, radius = m.radius, params = { ...m.params };
    const ids = chamberId >= 0 ? [chamberId] : chamberIdsOf(m);
    h.command({ type: 'removeMarker', markerId });
    const placed = this.issuePlace(h, kind, to, radius, { mode: params.mode ?? undefined, priority: params.priority ?? undefined }, ids);
    if (placed.reason) {
      this.issuePlace(h, kind, m.pos, radius, { mode: params.mode ?? undefined, priority: params.priority ?? undefined }, chamberIdsOf(m)); // put it back
      return { ok: false, markerId: -1, reason: placed.reason };
    }
    this.selectedId = placed.id;
    return { ok: true, markerId: placed.id, reason: null };
  }

  /** Undoes the last placement or removal; false when the stack is empty. */
  undo(h: ToolHost): boolean {
    const e = this.undoStack.pop();
    if (!e) return false;
    if (e.op === 'placed') {
      if (h.sim.stores.markers.get(e.markerId)?.alive) h.command({ type: 'removeMarker', markerId: e.markerId });
    } else {
      this.issuePlace(h, e.kind, e.pos, e.radius, { mode: e.params.mode ?? undefined, priority: e.params.priority ?? undefined }, e.chamberIds);
    }
    return true;
  }

  get undoDepth(): number {
    return this.undoStack.length;
  }

  /**
   * The marker whose disc contains p (horizontal distance, cavity markers also within their radius in height),
   * nearest centre first; -1 none.
   */
  static markerAt(sim: Sim, p: Vec3): number {
    const col = sim.state.colonies[0]?.id ?? -1;
    let best = -1, bestD = Infinity;
    for (const m of sim.state.markers) {
      if (!m.alive || m.colony !== col) continue;
      const d = Math.hypot(m.pos.x - p.x, m.pos.z - p.z);
      const r = Math.max(m.radius, 2 * sim.world.bu);
      if (d <= r && Math.abs(m.pos.y - p.y) <= Math.max(r, 6 * sim.world.bu) && d < bestD) { best = m.id; bestD = d; }
    }
    return best;
  }

  private issuePlace(h: ToolHost, kind: MarkerKind, pos: Vec3, radiusMm: number, params: { mode?: RallyMode; priority?: PlanPriority }, chamberIds: number[]): { id: number; reason: string | null } {
    const before = h.sim.state.nextId;
    const r = h.command({ type: 'placeMarker', kind, pos: { ...pos }, radius: radiusMm, chamberIds, params });
    const refusal = r.rejected[0];
    if (refusal) return { id: -1, reason: markerRefusalText(kind, refusal.reason ?? '') };
    const m = h.sim.state.markers.find((x) => x.alive && x.id >= before && x.kind === kind);
    if (!m) return { id: -1, reason: r.applied ? markerRefusalText(kind, '') : null };
    return { id: m.id, reason: null };
  }

  private push(e: UndoEntry): void {
    this.undoStack.push(e);
    if (this.undoStack.length > MARKER_UNDO_MAX) this.undoStack.shift();
  }
}

function chamberIdsOf(m: Marker): number[] {
  const ids: number[] = [];
  if (m.targetChamberId >= 0) ids.push(m.targetChamberId);
  if (m.sourceChamberId >= 0) ids.push(m.sourceChamberId);
  return ids;
}
