// Invariant check of one layer runtime (tests and soak runs; never on the hot path).

import type { LayerRuntime } from './layer';

/** Invariant check (tests, soak runs): returns problems found, empty when consistent. O(chunks x 4096). */
export function validateLayer(l: LayerRuntime): string[] {
  const bad: string[] = [];
  const tag = `${l.colony}/${l.channel}`;
  const { keys, chunks } = l.data;
  const nc = keys.length;
  if (chunks.length !== nc || l.listed.length !== nc) bad.push(`${tag}: parallel arrays differ`);
  if (nc > l.limits.maxChunks) bad.push(`${tag}: ${nc} chunks > cap`);
  if (l.nz > l.limits.maxCells) bad.push(`${tag}: ${l.nz} cells > cap`);
  bad.push(...l.pendingCells.validate(`${tag} cells`), ...l.pendingChunks.validate(`${tag} chunks`));
  let nonzero = 0;
  for (const c of chunks) for (let i = 0; i < c.length; i++) if (c[i] !== 0) nonzero++;
  if (nonzero !== l.nz) bad.push(`${tag}: nz ${l.nz} != ${nonzero}`);
  const seen = new Set<number>();
  const perSlot = new Int32Array(nc);
  for (let i = 0; i < l.count; i++) {
    const e = l.active[i];
    const slot = e >>> l.shift3, loc = e & (l.n3 - 1);
    if (seen.has(e)) bad.push(`${tag}: duplicate entry`);
    seen.add(e);
    if (slot >= nc) { bad.push(`${tag}: entry slot out of range`); continue; }
    if (l.listed[slot][loc] !== 1) bad.push(`${tag}: entry not flagged`);
    perSlot[slot]++;
  }
  for (let s = 0; s < nc; s++) {
    if (perSlot[s] !== l.live[s]) bad.push(`${tag}: live count ${l.live[s]} != ${perSlot[s]}`);
    if (l.index.get(keys[s]) !== s) bad.push(`${tag}: index mismatch`);
    const vals = chunks[s], flags = l.listed[s];
    for (let i = 0; i < l.n3; i++) {
      const v = vals[i];
      if (!(v >= 0) || !Number.isFinite(v) || v > l.limits.maxValue) bad.push(`${tag}: bad value ${v}`);
      if (v !== 0 && flags[i] !== 1) bad.push(`${tag}: nonzero cell not listed`);
      if (bad.length > 20) return bad;
    }
  }
  return bad;
}
