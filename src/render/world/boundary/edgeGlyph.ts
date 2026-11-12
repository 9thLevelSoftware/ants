// The "edge of the locality" glyph hook (GDD 04 §14): true while the possessed ant presses outward against the hard
// limit. The limit itself (positions clamped to [8 BU, side - 8 BU], sliding along it) is locomotion's
// (src/sim/locomotion/system.ts clampToMap); this only tells the HUD when to show the glyph. Pure.
import { LOCO_TUNING } from '@/sim/locomotion/params';
import { EDGE_GLYPH_BAND_BU, EDGE_GLYPH_MIN_OUTWARD } from './tuning';

export interface XZ { x: number; z: number }

/**
 * `pos` the ant (mm), `dir` its intended world direction (any length; only x and z are used), `size` the map side
 * and `bu` the body unit (mm). True when the ant is within EDGE_GLYPH_BAND_BU of the hard limit on a side and the
 * intended direction points out through that side.
 */
export function edgeGlyphActive(pos: XZ, dir: XZ, size: number, bu: number): boolean {
  const len = Math.hypot(dir.x, dir.z);
  if (!(len > 1e-6) || !(size > 0)) return false;
  const dx = dir.x / len, dz = dir.z / len;
  const lim = LOCO_TUNING.edgeHardBU * bu, band = EDGE_GLYPH_BAND_BU * bu, k = EDGE_GLYPH_MIN_OUTWARD;
  return (pos.x <= lim + band && -dx >= k) || (pos.x >= size - lim - band && dx >= k)
    || (pos.z <= lim + band && -dz >= k) || (pos.z >= size - lim - band && dz >= k);
}
