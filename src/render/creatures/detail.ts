/**
 * Detail of one creature from its projected body length. Near detail needs nearPx (and a place under the near cap);
 * mid detail needs midPx AND a triangle count no larger than the reference ant's at the same projected size
 * (acceptance 4: per projected pixel a creature never costs more than an ant). Far detail is the floor.
 */
import type { Detail } from './geometry/builder';
import { ANT_REFERENCE_TRIS, type CreatureLodSettings } from './tuning';

/** Triangles the reference ant is drawn with at `px` projected length under the ants' LOD rule. */
export function antTrisAt(px: number, s: CreatureLodSettings): number {
  const t = ANT_REFERENCE_TRIS;
  return px >= s.antPx[0] ? t[0] : px >= s.antPx[1] ? t[1] : px >= s.antPx[2] ? t[2] : t[3];
}

/** `midTris` = the look's mid-detail triangle count; `nearOk` = within the near cap. */
export function detailFor(px: number, midTris: number, s: CreatureLodSettings, nearOk: boolean): Detail {
  if (nearOk && px >= s.nearPx) return 0;
  if (px >= s.midPx && midTris <= antTrisAt(px, s)) return 1;
  return 2;
}
