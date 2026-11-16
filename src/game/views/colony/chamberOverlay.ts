// The colony view's chamber read-out (task int-1B-app addendum: "the cut face, chamber labels and markers must make
// the nest's structure obvious at a glance"). In both cutaway modes every chamber of the player's nests is named;
// in the slice, a chamber the plane cuts gets its outline on the plane (the ellipse where the plane meets it), so the
// cut face shows which hole is which room. Pure: reads sim state, writes line / label descriptions.
import type { ChamberType, Sim } from '@/sim/types';
import type { MarkerLabel, MarkerLineSet } from '@/render/fx/markers/MarkerRenderer';
import { CHAMBER_LABEL_COLOR, CHAMBER_OUTLINE_COLOR } from '@/render/fx/markers/palette';
import { pushEllipse } from '@/render/fx/markers/shapes';

/** The word on a chamber's label (GDD 03 chamber types; GDD 08 §4.4 nest overview names). */
export const CHAMBER_WORDS: Record<ChamberType, string> = {
  founding: 'Founding chamber', royal: 'Royal chamber', nursery: 'Nursery', food: 'Food store', granary: 'Granary',
  fungus: 'Fungus garden', midden: 'Midden', rest: 'Rest chamber', general: 'Chamber',
};

/** Outline lift above the slice plane, BU (the cap is drawn on the plane; the line must not z-fight it). */
const OUTLINE_LIFT_BU = 0.05;
/** A chamber cut closer than this to its top or bottom pole gives a sliver: no outline then (label only). */
const MIN_CUT_FRACTION = 0.15;

export interface ChamberOverlayInput {
  sim: Sim;
  mode: 'slice' | 'xray';
  /** Slice plane height, mm (slice mode). */
  planeY: number | null;
}

/** Adds the chamber outlines and labels; returns the version parts (what changed). */
export function chamberOverlay(p: ChamberOverlayInput, lines: MarkerLineSet[], labels: MarkerLabel[]): (string | number)[] {
  const { sim } = p, bu = sim.world.bu;
  const col = sim.state.colonies[0]?.id ?? -1;
  const key: (string | number)[] = ['c', p.mode, p.planeY === null ? '-' : Math.round(p.planeY)];
  const outline: number[] = [];
  for (const n of sim.state.nests) {
    if (!n.alive || n.colony !== col) continue;
    for (const c of n.chambers) {
      const top = c.center.y + c.radii.y;
      if (p.mode === 'slice' && p.planeY !== null) {
        if (c.center.y - c.radii.y > p.planeY) continue; // wholly above the plane: hidden by the cut, no label
        const t = (p.planeY - c.center.y) / c.radii.y; // -1 bottom pole .. 1 top pole
        if (Math.abs(t) < 1 - MIN_CUT_FRACTION) {
          const k = Math.sqrt(1 - t * t);
          const y = p.planeY + OUTLINE_LIFT_BU * bu;
          pushEllipse(outline, { x: c.center.x, y, z: c.center.z }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, c.radii.x * k, c.radii.z * k);
        }
      }
      const slice = p.mode === 'slice' && p.planeY !== null;
      const y = slice ? Math.min(top, p.planeY!) + bu : top + bu;
      // a room wholly under the plane is hidden by the cap: its label says so (the player moves the slice down to it)
      const word = CHAMBER_WORDS[c.type] ?? c.type;
      labels.push({ pos: { x: c.center.x, y, z: c.center.z }, text: slice && top < p.planeY! ? `${word} (below)` : word, color: CHAMBER_LABEL_COLOR });
      key.push(c.id, c.type, Math.round(c.radii.x), Math.round(c.radii.z));
    }
  }
  if (outline.length) lines.push({ positions: outline, color: CHAMBER_OUTLINE_COLOR, style: 'solid' });
  return key;
}
