import { it } from 'vitest';
import { heightAt } from '@/sim/world/terrainSample';
import type { WorldData } from '@/sim/types';
import { report, T1_ARCHETYPES } from './testing/fixtures';
const zoneOf = (w: WorldData, i: number, k: number) => { const n = w.maps.zone.nx; return w.zones[w.maps.zone.data[Math.min(n - 1, Math.max(0, k)) * n + Math.min(n - 1, Math.max(0, i))]]; };
function maxStep(w: WorldData, ok: (type: string) => boolean) {
  const t = w.terrain, n = t.nx, cells = w.maps.zone.nx; let best = { dh: 0, at: '' };
  for (let k = 1; k < n - 1; k++) for (let i = 1; i < n - 1; i++) for (const [di, dk] of [[1, 0], [0, 1]] as const) {
    const touch = di ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0]] : [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 0], [0, 1]];
    let all = true;
    for (const [a, b] of touch) { const ci = i + a, ck = k + b; if (ci < 0 || ck < 0 || ci >= cells || ck >= cells) continue; if (!ok(zoneOf(w, ci, ck).type)) { all = false; break; } }
    if (!all) continue;
    const dh = Math.abs(t.data[(k + dk) * n + i + di] - t.data[k * n + i]);
    if (dh > best.dh) best = { dh, at: `x=${i * t.cell} z=${k * t.cell}` };
  }
  return best;
}
function groove(w: WorldData) {
  const t = w.terrain, cells = w.maps.zone.nx, c = t.cell; const interior = (i: number, k: number) => zoneOf(w, i, k).type === 'interior';
  let worst = 0;
  for (let k = 2; k < cells - 2; k++) for (let i = 2; i < cells - 2; i++) { if (interior(i, k)) continue;
    for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) { if (!interior(i + di, k + dk)) continue;
      const fx = (i + 0.5 + 0.5 * di) * c, fz = (k + 0.5 + 0.5 * dk) * c;
      const drop = heightAt(t, fx - di * 1.5 * c, fz - dk * 1.5 * c) - heightAt(t, fx - di * 0.1 * c, fz - dk * 0.1 * c);
      worst = Math.max(worst, drop); } }
  return worst;
}
it('probe', () => {
  for (const a of T1_ARCHETYPES) for (let s = 1; s <= 8; s++) {
    const w = report(a, s).world;
    const nat = maxStep(w, (t) => t === 'forest' || t === 'lawn'), pav = maxStep(w, (t) => t === 'pavement');
    console.log(a, s, 'nat', nat.dh.toFixed(1), nat.at, 'pav', pav.dh.toFixed(1), pav.at, a === 'kitchen-door' ? 'groove ' + groove(w).toFixed(1) : '', 'attempts', w.meta.attempts);
  }
}, 600000);
