// Look pass 2, work item 4 (reviewer's round): the nearest backdrop shapes must read as soft silhouettes, not dissolve
// into the sky. With BOUNDARY_FOG_SCALE 0.35 a fence at its nearest distance kept 30 % of its colour in this model (less
// in the real frames, which add weather haze: the noon surface frame showed pale slabs); at 0.15 it keeps 41 %. The
// checks keep a fence panel at least 35 % visible and let trees fade with distance.
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { computeLighting } from '../lighting/timeOfDay';
import { BACKDROP_BAND_MM, BOUNDARY_FOG_SCALE, EDGE_HAZE_K_L, EDGE_HAZE_MIN_MM } from './tuning';

/** Share of a backdrop shape's own colour that survives the fog and the edge haze (what the boundary shader mixes). */
function visible(distFromEdgeMm: number, mapSideMm: number): number {
  const day = computeLighting({
    sunDir: new Vector3(0, 0.9, 0.4).normalize(), sunElevDeg: 60, moonDir: new Vector3(0, -1, 0), moonIllum: 0, weather: 'clear', cloud: 0.1, fog: 0,
    zone: 'lawn', bu: 4, under: 0, hazeScale: 1,
  });
  const d = distFromEdgeMm + 100; // the camera stands a little inside the edge
  const fog = 1 - Math.exp(-((day.fogDensity * d * BOUNDARY_FOG_SCALE) ** 2));
  const edge = 1 - Math.exp(-distFromEdgeMm / Math.max(EDGE_HAZE_K_L * mapSideMm, EDGE_HAZE_MIN_MM));
  return (1 - fog) * (1 - edge);
}

describe('backdrop silhouettes by day', () => {
  it('the nearest fence panel keeps at least a third of its own colour', () => {
    expect(visible(BACKDROP_BAND_MM.fence[1], 16000)).toBeGreaterThan(0.35);
  });
  it('trees fade with distance: faint at their nearest, fainter at the middle of their band', () => {
    const near = visible(BACKDROP_BAND_MM.trees[0], 16000), mid = visible((BACKDROP_BAND_MM.trees[0] + BACKDROP_BAND_MM.trees[1]) / 2, 16000);
    expect(near).toBeGreaterThan(0.1);
    expect(mid).toBeLessThan(near);
  });
  it('the farthest trees have dissolved into the haze', () => {
    expect(visible(BACKDROP_BAND_MM.trees[1], 16000)).toBeLessThan(0.1);
  });
});
