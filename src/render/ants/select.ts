/**
 * LOD selection and the hard cap policy (pure, allocation-free with caller scratch):
 *  - LOD by projected body length (px): >= nearPx LOD0, >= midPx LOD1, >= farPx LOD2, else LOD3;
 *  - at most maxNear ants at LOD0 (nearest first), the rest of them drop to LOD1;
 *  - at most maxDrawn ants drawn (farthest dropped first);
 *  - forced ants (the possessed one) are always drawn, always at LOD0, and never count as dropped.
 * Sorting happens only when a cap is actually exceeded.
 */
import type { AntLodSettings } from './tuning';

export interface SelectResult { counts: [number, number, number, number]; dropped: number; sorted: boolean }

export function selectLods(
  n: number, dist: Float32Array, px: Float32Array, forced: Uint8Array, s: Pick<AntLodSettings, 'nearPx' | 'midPx' | 'farPx' | 'maxNear' | 'maxDrawn'>,
  outLod: Int8Array, order: Int32Array, out: SelectResult,
): SelectResult {
  let near = 0;
  for (let i = 0; i < n; i++) if (px[i]! >= s.nearPx || forced[i]) near++;
  const sorted = n > s.maxDrawn || near > s.maxNear;
  for (let i = 0; i < n; i++) order[i] = i;
  if (sorted) {
    const o = order.subarray(0, n);
    o.sort((a, b) => (forced[a] ? -1 : dist[a]!) - (forced[b] ? -1 : dist[b]!));
  }
  out.counts[0] = out.counts[1] = out.counts[2] = out.counts[3] = 0;
  out.dropped = 0; out.sorted = sorted;
  let drawn = 0, usedNear = 0;
  for (let k = 0; k < n; k++) {
    const i = order[k]!;
    const f = forced[i] === 1;
    if (!f && drawn >= s.maxDrawn) { outLod[i] = -1; out.dropped++; continue; }
    const p = px[i]!;
    let lod = f ? 0 : p >= s.nearPx ? (usedNear < s.maxNear ? 0 : 1) : p >= s.midPx ? 1 : p >= s.farPx ? 2 : 3;
    if (lod === 0) usedNear++;
    outLod[i] = lod; out.counts[lod as 0 | 1 | 2 | 3]++; drawn++;
  }
  return out;
}
