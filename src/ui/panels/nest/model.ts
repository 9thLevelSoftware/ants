// Nest overview, pure part (GDD 08 4.6): chamber rows (type, volume, occupancy against capacity, climate with the
// brood comfort mark, risk words), the 4-step occupancy shading and the schematic side elevation: chambers at their
// real (distance along the nest's main axis, depth) positions scaled to fit, tunnels as lines, entrances as notches on
// the ground line, mounds as humps. A chamber that no finished tunnel reaches is linked to the nearest connected part
// of the nest with an "inferred" dashed line, so the diagram always reads as one nest.
import type { UiChamber, UiChamberLoad, UiNest, UiNestPoint } from '../../api';
import { NEST_CANVAS, NEST_FLOODED_MIN, NEST_FLOOD_RISK_MIN, NEST_OCCUPANCY_STEPS } from '../balance';

export const CHAMBER_WORD: Readonly<Record<string, string>> = {
  founding: 'Founding cell', royal: 'Royal chamber', nursery: 'Nursery', food: 'Food store', granary: 'Granary', fungus: 'Fungus garden',
  midden: 'Midden', rest: 'Resting chamber', general: 'General chamber',
};

export function chamberWord(type: string): string {
  return CHAMBER_WORD[type] ?? type;
}

/** One-word names for the table, where the column is narrow. */
export const CHAMBER_SHORT: Readonly<Record<string, string>> = {
  founding: 'Founding', royal: 'Royal', nursery: 'Nursery', food: 'Food', granary: 'Granary', fungus: 'Fungus', midden: 'Midden', rest: 'Rest', general: 'General',
};
export const chamberShort = (type: string): string => CHAMBER_SHORT[type] ?? type;

/** Chambers whose temperature has a comfort band: the ones that hold brood. */
const BROOD_TYPES = new Set(['founding', 'royal', 'nursery']);

export interface LoadPart {
  /** 'ants' | 'brood' | 'food' */
  key: 'ants' | 'brood' | 'food';
  n: number;
  cap: number;
}

/** The parts of a chamber's load that have a capacity ("14 / 30 ants"); `other` has no place in the table. */
export function loadParts(occ: UiChamberLoad, cap: UiChamberLoad): LoadPart[] {
  const parts: LoadPart[] = [];
  if (cap.adults > 0) parts.push({ key: 'ants', n: occ.adults, cap: cap.adults });
  if (cap.brood > 0) parts.push({ key: 'brood', n: occ.brood, cap: cap.brood });
  if (cap.food > 0) parts.push({ key: 'food', n: occ.food, cap: cap.food });
  return parts;
}

/** The fullest relevant load as a ratio of capacity (0 when the chamber has no capacity). A type's main use decides: brood chambers by brood, stores by food. */
export function occupancyRatio(c: Pick<UiChamber, 'type' | 'occupancy' | 'capacity'>): number {
  const main = c.type === 'food' || c.type === 'granary' ? 'food' : c.type === 'nursery' || c.type === 'royal' || c.type === 'founding' || c.type === 'fungus' ? 'brood' : 'ants';
  const parts = loadParts(c.occupancy, c.capacity);
  const mainPart = parts.find((p) => p.key === main);
  const used = mainPart ?? parts.reduce<LoadPart | null>((a, p) => (!a || p.n / p.cap > a.n / a.cap ? p : a), null);
  return used && used.cap > 0 ? used.n / used.cap : 0;
}

/** 0..3: how full a chamber is, in the 4 steps of the pattern shading (empty, light, half, full). */
export function occupancyStep(ratio: number): number {
  if (!(ratio > 0)) return 0;
  return Math.min(NEST_OCCUPANCY_STEPS - 1, Math.max(1, Math.ceil(ratio * (NEST_OCCUPANCY_STEPS - 1))));
}

export function loadText(c: Pick<UiChamber, 'occupancy' | 'capacity'>): string {
  const parts = loadParts(c.occupancy, c.capacity);
  if (parts.length === 0) return 'no capacity';
  return parts.map((p) => `${Math.round(p.n)} / ${Math.round(p.cap)} ${p.key}`).join(', ');
}

export type Comfort = 'within' | 'outside' | 'none';

/** Brood chambers are compared with the species' brood band; other chambers have no comfort mark. */
export function comfortOf(c: Pick<UiChamber, 'type' | 'temp'>, band: UiNest['broodBand']): Comfort {
  if (!band || !BROOD_TYPES.has(c.type)) return 'none';
  return c.temp >= band.lo && c.temp <= band.hi ? 'within' : 'outside';
}

export interface RiskWord {
  word: string;
  /** Shape that goes with the word (never colour alone). */
  shape: 'bad' | 'warn' | 'watch';
}

export function risksOf(c: UiChamber, band: UiNest['broodBand']): RiskWord[] {
  const out: RiskWord[] = [];
  if (c.flooded > NEST_FLOODED_MIN) out.push({ word: 'Flooded', shape: 'bad' });
  else if (c.floodRisk >= NEST_FLOOD_RISK_MIN) out.push({ word: 'Flood risk', shape: 'warn' });
  if (band && BROOD_TYPES.has(c.type) && c.humidity < band.rhLo) out.push({ word: 'Dry', shape: 'warn' });
  if (occupancyRatio(c) > 1) out.push({ word: 'Crowded', shape: 'watch' });
  return out;
}

export interface ChamberRow {
  id: number;
  type: string;
  word: string;
  volume: number;
  load: string;
  ratio: number;
  step: number;
  temp: number;
  comfort: Comfort;
  humidityPct: number;
  risks: RiskWord[];
  /** Types it may be given now (always includes the current one when it is a valid use). */
  options: string[];
}

export function chamberRows(n: UiNest): ChamberRow[] {
  return n.chambers.map((c) => {
    const ratio = occupancyRatio(c);
    return {
      id: c.id, type: c.type, word: `${chamberWord(c.type)} ${c.id}`, volume: Math.round(c.volume), load: loadText(c), ratio, step: occupancyStep(ratio),
      temp: Math.round(c.temp), comfort: comfortOf(c, n.broodBand), humidityPct: Math.round(c.humidity * 100), risks: risksOf(c, n.broodBand),
      options: c.allowed,
    };
  }).sort((a, b) => a.id - b.id);
}

// ---- schematic -------------------------------------------------------------------------------------------------

export interface SchematicChamber {
  id: number;
  type: string;
  x: number;
  y: number;
  rx: number;
  ry: number;
  step: number;
}

export interface SchematicEntrance {
  id: number;
  x: number;
  status: string;
  /** Mound hump height, px (0 none). */
  mound: number;
}

export interface SchematicLink {
  kind: 'tunnel' | 'inferred';
  pts: { x: number; y: number }[];
}

export interface Schematic {
  w: number;
  h: number;
  /** y of the ground line. */
  ground: number;
  chambers: SchematicChamber[];
  entrances: SchematicEntrance[];
  links: SchematicLink[];
  /** px per BU, and the BU length of the scale bar. */
  scale: number;
  /** Horizontal axis the nest was projected on (unit vector in x, z). */
  axis: { x: number; z: number };
}

const MARGIN = 14;
const GROUND_BAND = 30;
const MIN_SPAN_BU = 24;
const MIN_DEPTH_BU = 14;
const MAX_SCALE = 14;
const SNAP_BU = 6;

/** Principal horizontal axis (unit vector) of a set of points: the direction the nest extends most. */
export function mainAxis(pts: readonly { x: number; z: number }[]): { x: number; z: number } {
  if (pts.length < 2) return { x: 1, z: 0 };
  const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length, mz = pts.reduce((a, p) => a + p.z, 0) / pts.length;
  let sxx = 0, szz = 0, sxz = 0;
  for (const p of pts) { sxx += (p.x - mx) ** 2; szz += (p.z - mz) ** 2; sxz += (p.x - mx) * (p.z - mz); }
  if (sxx + szz < 1e-9) return { x: 1, z: 0 };
  const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  return { x: Math.cos(ang), z: Math.sin(ang) };
}

interface Node { key: string; u: number; d: number }

/** Lays the nest out in the canvas (368 x 300 dp by default). */
export function layoutSchematic(n: UiNest, w: number = NEST_CANVAS.w, h: number = NEST_CANVAS.h): Schematic {
  const all: UiNestPoint[] = [...n.chambers.map((c) => c.p), ...n.entrances.map((e) => e.p), ...n.tunnels.flatMap((t) => t.pts)];
  let axis = mainAxis(all);
  // the entrances sit at the left when the nest leans one way, so the same nest always draws the same way round
  const ent = n.entrances.length ? n.entrances : null;
  if (ent) {
    const cu = n.chambers.length ? n.chambers.reduce((a, c) => a + c.p.x * axis.x + c.p.z * axis.z, 0) / n.chambers.length : 0;
    const eu = ent.reduce((a, e) => a + e.p.x * axis.x + e.p.z * axis.z, 0) / ent.length;
    if (cu < eu) axis = { x: -axis.x, z: -axis.z };
  }
  const U = (p: UiNestPoint): number => p.x * axis.x + p.z * axis.z;
  const us = all.map(U);
  const uMin = us.length ? Math.min(...us) : 0, uMax = us.length ? Math.max(...us) : 0;
  const maxReach = Math.max(0, ...n.chambers.map((c) => c.p.depth + c.radius), ...n.tunnels.flatMap((t) => t.pts.map((p) => p.depth)));
  const padU = Math.max(0, ...n.chambers.map((c) => c.radius));
  const spanU = Math.max(MIN_SPAN_BU, uMax - uMin + 2 * padU);
  const spanD = Math.max(MIN_DEPTH_BU, maxReach);
  const scale = Math.min(MAX_SCALE, (w - 2 * MARGIN) / spanU, (h - GROUND_BAND - MARGIN) / spanD);
  const cu0 = (uMin + uMax) / 2;
  const ground = GROUND_BAND;
  const X = (u: number): number => w / 2 + (u - cu0) * scale;
  const Y = (d: number): number => ground + d * scale;

  const chambers: SchematicChamber[] = n.chambers.map((c) => {
    const rx = Math.max(9, c.radius * scale), ry = Math.max(6, rx * 0.62);
    return { id: c.id, type: c.type, x: X(U(c.p)), y: Y(c.p.depth), rx, ry, step: occupancyStep(occupancyRatio(c)) };
  });
  const entrances: SchematicEntrance[] = n.entrances.map((e) => ({ id: e.id, x: X(U(e.p)), status: e.status, mound: e.moundBu ? Math.min(16, Math.max(3, e.moundBu * scale)) : 0 }));

  const links: SchematicLink[] = n.tunnels.map((t) => ({ kind: 'tunnel' as const, pts: t.pts.map((p) => ({ x: X(U(p)), y: Y(p.depth) })) }));

  // connectivity: nodes are the entrances and chambers; a tunnel joins the nodes near its two ends
  const nodes: Node[] = [
    ...n.entrances.map((e) => ({ key: `e${e.id}`, u: U(e.p), d: 0 })),
    ...n.chambers.map((c) => ({ key: `c${c.id}`, u: U(c.p), d: c.p.depth })),
  ];
  const parent = new Map<string, string>(nodes.map((nd) => [nd.key, nd.key]));
  const find = (k: string): string => { let r = k; while (parent.get(r) !== r) r = parent.get(r)!; return r; };
  const union = (a: string, b: string): void => { parent.set(find(a), find(b)); };
  const near = (u: number, d: number, reach: number): Node | null => {
    let best: Node | null = null, bd = Infinity;
    for (const nd of nodes) {
      const dist = Math.hypot(nd.u - u, nd.d - d);
      const radius = nd.key.startsWith('c') ? (n.chambers.find((c) => `c${c.id}` === nd.key)?.radius ?? 0) + reach : reach;
      if (dist <= radius && dist < bd) { bd = dist; best = nd; }
    }
    return best;
  };
  for (const t of n.tunnels) {
    const touched = new Set<string>();
    for (const p of t.pts) { const nd = near(U(p), p.depth, SNAP_BU); if (nd) touched.add(nd.key); }
    const list = [...touched];
    for (let i = 1; i < list.length; i++) union(list[0], list[i]);
  }
  // inferred links: every component without an entrance joins the nearest node of a component that has one (nearest first)
  const entranceKeys = nodes.filter((nd) => nd.key.startsWith('e')).map((nd) => nd.key);
  const rooted = (k: string): boolean => entranceKeys.some((e) => find(e) === find(k));
  if (entranceKeys.length > 0) {
    for (let guard = 0; guard < nodes.length; guard++) {
      let best: { a: Node; b: Node; d: number } | null = null;
      for (const a of nodes) {
        if (rooted(a.key)) continue;
        for (const b of nodes) {
          if (!rooted(b.key)) continue;
          const d = Math.hypot(a.u - b.u, a.d - b.d);
          if (!best || d < best.d) best = { a, b, d };
        }
      }
      if (!best) break;
      links.push({ kind: 'inferred', pts: [{ x: X(best.a.u), y: Y(best.a.d) }, { x: X(best.b.u), y: Y(best.b.d) }] });
      union(best.a.key, best.b.key);
    }
  }
  return { w, h, ground, chambers, entrances, links, scale, axis };
}
