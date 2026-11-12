// The colony view's marker tool (GDD 08 §4.3, GDD 02 §12.2): place forage / avoid / rally markers with a radius,
// move-brood / move-queen on a chamber; select a marker, move it (remove + place again: there is no move command)
// or delete it; undo the last placements, removals and moves (a stack of 10; a move undoes as one step). Commands
// go through the host (Game) so they are applied and logged like any other; in real time they are resolved after
// the next tick (pendingCommands.ts) and the tool reacts the same way then. The dig planner is digPlanner.ts.
import type { Vec3 } from '@/core';
import { MARKER_CAP, MARKER_DEFAULT_RADIUS_BU, MARKER_RADIUS_RANGE_BU } from '@/sim/balance/colony';
import type { Marker, MarkerKind, PlanPriority, RallyMode, Sim } from '@/sim/types';
import { PendingCommands, type CommandHost } from './pendingCommands';
import { markerLimitText, markerRefusalText } from './reasons';

export interface ToolHost extends CommandHost {
  toast(text: string): void;
}

/** Marker kinds this tool places itself (dig and entrance are plans: digPlanner.ts). */
export const MARKER_TOOL_KINDS = ['forage', 'avoid', 'rally', 'move-brood', 'move-queen'] as const;
export type MarkerToolKind = (typeof MARKER_TOOL_KINDS)[number];

/** Undo stack depth (GDD 08 §4.3). */
export const MARKER_UNDO_MAX = 10;

export interface PlaceResult {
  ok: boolean;
  /** The new marker, -1 when refused or still queued (real time). */
  markerId: number;
  /** Player-facing reason when refused. */
  reason: string | null;
  /** Queued for the next tick: the outcome follows (a refusal is toasted then). */
  pending?: boolean;
}

/** Everything needed to place a marker again. */
interface MarkerSpec {
  kind: MarkerKind;
  pos: Vec3;
  /** mm */
  radius: number;
  params: { mode?: RallyMode; priority?: PlanPriority };
  chamberIds: number[];
}

/** Undo steps; marker ids are kept current when a later step re-creates the marker under a new id (remap). */
type UndoEntry =
  | { op: 'placed'; markerId: number }
  | { op: 'removed'; spec: MarkerSpec; oldId: number }
  | { op: 'moved'; from: MarkerSpec; markerId: number };

type Placed = (id: number, reason: string | null, late: boolean) => void;

export class MarkerTool {
  /** Radius per kind, BU (remembered between placements). */
  readonly radiusBu: Record<MarkerKind, number> = { ...MARKER_DEFAULT_RADIUS_BU };
  rallyMode: RallyMode = 'defend';
  priority: PlanPriority = 'normal';
  /** Selected marker id, -1 none. */
  selectedId = -1;
  readonly pending = new PendingCommands();
  private undoStack: UndoEntry[] = [];

  /** Sets a kind's radius, clamped to its range (BU). */
  setRadius(kind: MarkerKind, bu: number): number {
    const r = MARKER_RADIUS_RANGE_BU[kind];
    this.radiusBu[kind] = r ? Math.max(r[0], Math.min(r[1], bu)) : bu;
    return this.radiusBu[kind];
  }

  /** Resolves commands queued in real time (once per frame). */
  poll(sim: Sim): void {
    this.pending.poll(sim);
  }

  /** New game: no selection, no undo history, nothing queued. */
  reset(): void {
    this.selectedId = -1;
    this.undoStack = [];
    this.pending.clear();
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
   * (`chamberId`). Refusals come back with the words to show (or are toasted when they arrive a tick later).
   */
  place(h: ToolHost, kind: MarkerToolKind, pos: Vec3, chamberId = -1, radiusBu?: number): PlaceResult {
    if (MarkerTool.atCap(h.sim, kind)) return { ok: false, markerId: -1, reason: markerLimitText(kind) };
    if ((kind === 'move-brood' || kind === 'move-queen') && chamberId < 0) return { ok: false, markerId: -1, reason: 'Choose a chamber of the nest' };
    const radius = (radiusBu === undefined ? this.radiusBu[kind] : this.setRadius(kind, radiusBu)) * h.sim.world.bu;
    const spec: MarkerSpec = {
      kind, pos: { ...pos }, radius, chamberIds: chamberId >= 0 ? [chamberId] : [],
      params: { mode: kind === 'rally' ? this.rallyMode : undefined, priority: kind === 'forage' ? this.priority : undefined },
    };
    const res: PlaceResult = { ok: true, markerId: -1, reason: null, pending: true };
    this.issuePlace(h, spec, (id, reason, late) => {
      res.pending = false;
      if (reason) { res.ok = false; res.reason = reason; if (late) h.toast(reason); return; }
      res.markerId = id;
      this.push({ op: 'placed', markerId: id });
      this.selectedId = id;
    });
    return res;
  }

  /** Deletes a marker (select + Delete). False when there is none or the sim kept it. */
  remove(h: ToolHost, markerId: number): boolean {
    const m = h.sim.stores.markers.get(markerId);
    if (!m || !m.alive) return false;
    const spec = specOf(m);
    let ok = true;
    this.pending.send(h, { type: 'removeMarker', markerId }, (o) => {
      if (o.refused || h.sim.stores.markers.get(markerId)?.alive) { ok = false; return; }
      this.push({ op: 'removed', spec, oldId: markerId });
      if (this.selectedId === markerId) this.selectedId = -1;
    });
    return ok;
  }

  /**
   * Moves a marker (keeps its kind, radius and parameters): remove it, place it again at `to`. A refused spot puts
   * it back where it was, still selected. One undo step.
   */
  move(h: ToolHost, markerId: number, to: Vec3, chamberId = -1): PlaceResult {
    const m = h.sim.stores.markers.get(markerId);
    if (!m || !m.alive) return { ok: false, markerId: -1, reason: 'Nothing to move' };
    const from = specOf(m);
    const dest: MarkerSpec = { ...from, pos: { ...to }, chamberIds: chamberId >= 0 ? [chamberId] : from.chamberIds };
    const res: PlaceResult = { ok: true, markerId: -1, reason: null, pending: true };
    this.pending.send(h, { type: 'removeMarker', markerId }, () => { /* the placement below reports */ });
    this.issuePlace(h, dest, (id, reason, late) => {
      res.pending = false;
      if (reason) {
        res.ok = false; res.reason = reason;
        if (late) h.toast(reason);
        this.issuePlace(h, from, (back) => this.recreated(markerId, back)); // put it back
        return;
      }
      res.markerId = id;
      this.recreated(markerId, id);
      this.push({ op: 'moved', from, markerId: id });
    });
    return res;
  }

  /** Undoes the last placement, removal or move; false when there is nothing left to undo. */
  undo(h: ToolHost): boolean {
    for (let e = this.undoStack.pop(); e; e = this.undoStack.pop()) {
      if (e.op === 'removed') {
        this.issuePlace(h, e.spec, (id) => { if (id >= 0) this.remap(e.oldId, id); });
        return true;
      }
      const id = e.markerId;
      if (!h.sim.stores.markers.get(id)?.alive) continue; // removed by other means since: nothing to undo here
      this.pending.send(h, { type: 'removeMarker', markerId: id }, () => { if (this.selectedId === id && e.op === 'placed') this.selectedId = -1; });
      if (e.op === 'moved') this.issuePlace(h, e.from, (back) => this.recreated(id, back));
      return true;
    }
    return false;
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

  /** A marker was placed again as `newId` (-1: it could not be): undo entries and the selection follow it. */
  private recreated(oldId: number, newId: number): void {
    if (newId >= 0) this.remap(oldId, newId);
    if (this.selectedId === oldId) this.selectedId = newId;
  }

  private remap(oldId: number, newId: number): void {
    for (const e of this.undoStack) {
      if (e.op === 'removed') { if (e.oldId === oldId) e.oldId = newId; } else if (e.markerId === oldId) e.markerId = newId;
    }
  }

  /** Sends placeMarker; `done` gets the new marker's id (nearest new marker of the kind) or the refusal words. */
  private issuePlace(h: ToolHost, s: MarkerSpec, done: Placed): void {
    this.pending.send(h, { type: 'placeMarker', kind: s.kind, pos: { ...s.pos }, radius: s.radius, chamberIds: [...s.chamberIds], params: { ...s.params } }, (o) => {
      if (o.refused) { done(-1, markerRefusalText(s.kind, o.refused), o.late); return; }
      const id = newMarkerNear(h.sim, s, o.firstNewId);
      done(id, id < 0 ? markerRefusalText(s.kind, '') : null, o.late);
    });
  }

  private push(e: UndoEntry): void {
    this.undoStack.push(e);
    if (this.undoStack.length > MARKER_UNDO_MAX) this.undoStack.shift();
  }
}

function specOf(m: Marker): MarkerSpec {
  return { kind: m.kind, pos: { ...m.pos }, radius: m.radius, params: { mode: m.params.mode ?? undefined, priority: m.params.priority ?? undefined }, chamberIds: chamberIdsOf(m) };
}

/** The marker of this kind created since `firstNewId` nearest to where it was asked for, -1 none. */
function newMarkerNear(sim: Sim, s: MarkerSpec, firstNewId: number): number {
  const col = sim.state.colonies[0]?.id ?? -1;
  let best = -1, bestD = Infinity;
  for (const m of sim.state.markers) {
    if (!m.alive || m.id < firstNewId || m.kind !== s.kind || m.colony !== col) continue;
    const d = Math.hypot(m.pos.x - s.pos.x, m.pos.y - s.pos.y, m.pos.z - s.pos.z);
    if (d < bestD) { best = m.id; bestD = d; }
  }
  return best;
}

function chamberIdsOf(m: Marker): number[] {
  const ids: number[] = [];
  if (m.targetChamberId >= 0) ids.push(m.targetChamberId);
  if (m.sourceChamberId >= 0) ids.push(m.sourceChamberId);
  return ids;
}
