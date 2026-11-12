// Verification support for the outdoor content (tests and tools only): which objects are outdoor ones, solid
// interpenetration between objects, resting on the ground, and a generator run that evaluates micro-connection
// usefulness (validation does it only once a placer declares 'micro', which is worldgen-life's guarantee).

import type { ArchetypeId, Primitive, WorldData } from '@/sim/types';
import { PrimFlag } from '@/sim/types';
import { primEval, type PrimEntry } from '@/sim/world/primHash';
import { heightAt } from '@/sim/world/terrainSample';
import { defaultWorldParams } from '../../params';
import { generateWorldReport, type WorldgenReport } from '../../pipeline';
import { discoveredModules, type WorldgenModule } from '../../kit/registry';
import { entryOf } from '../../kit/column';
import { primsOverlap } from './overlap';
import { evaluateMicro } from '../../validate/micro';
import { OUTDOOR_CATALOG } from '../../catalog/outdoor';

/** Template ids the outdoor placers create (the catalogue plus the sized builders). */
export const OUTDOOR_TEMPLATES: ReadonlySet<string> = new Set([
  ...Object.keys(OUTDOOR_CATALOG), 'paving-slab', 'cracked-slab', 'edging-kerb', 'kerb', 'fence', 'garden-wall', 'raised-bed-board',
  'lawn-edge', 'sand-edging',
]);

const evalMicro: WorldgenModule = { placers: [{ id: 'test/outdoor-eval-micro', step: 'start', order: 1000, run: (ctx) => { evaluateMicro(ctx); } }] };

/** Generates a world whose micro-connections carry the validation's usefulness verdict. */
export function generateEvaluated(archetype: ArchetypeId, seed: number): WorldgenReport {
  return generateWorldReport({ ...defaultWorldParams('lasius-niger', seed, 'naturalist', 'standard'), archetype }, { modules: [...discoveredModules(), evalMicro] });
}


/**
 * Pairs of solid primitives of different objects (at least one outdoor) that share a point deeper than `tolMm`
 * inside both (the kit's placement test, applied to the final world). Returns "a/b" template pairs.
 */
export function interpenetrations(w: WorldData, tolMm = 1): string[] {
  const owner = new Map<number, string>();
  for (const o of w.objects) for (let i = o.primStart; i < o.primStart + o.primCount; i++) owner.set(i, o.templateId);
  const cell = 256, n = Math.ceil(w.size / cell);
  const grid: number[][] = Array.from({ length: n * n }, () => []);
  const entries: (PrimEntry | null)[] = w.prims.map((p: Primitive) => ((p.flags & PrimFlag.VISUAL_ONLY) !== 0 ? null : entryOf(p)));
  entries.forEach((e, i) => {
    if (!e) return;
    for (let k = Math.max(0, Math.floor(e.minZ / cell)); k <= Math.min(n - 1, Math.floor(e.maxZ / cell)); k++)
      for (let j = Math.max(0, Math.floor(e.minX / cell)); j <= Math.min(n - 1, Math.floor(e.maxX / cell)); j++) grid[k * n + j].push(i);
  });
  const out: string[] = [];
  const seen = new Set<string>();
  for (const list of grid) {
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      const i = list[a], j = list[b];
      const ea = entries[i]!, eb = entries[j]!;
      if (ea.prim.objectId === eb.prim.objectId) continue;
      const ta = owner.get(i) ?? '?', tb = owner.get(j) ?? '?';
      if (!OUTDOOR_TEMPLATES.has(ta) && !OUTDOOR_TEMPLATES.has(tb)) continue;
      if (ea.maxX < eb.minX || eb.maxX < ea.minX || ea.maxY < eb.minY || eb.maxY < ea.minY || ea.maxZ < eb.minZ || eb.maxZ < ea.minZ) continue;
      const key = `${Math.min(i, j)}:${Math.max(i, j)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // sample the smaller of the two densely (a thin branch through a thin panel slips between coarse lattices)
      const va = (ea.maxX - ea.minX) * (ea.maxY - ea.minY) * (ea.maxZ - ea.minZ), vb = (eb.maxX - eb.minX) * (eb.maxY - eb.minY) * (eb.maxZ - eb.minZ);
      if (primsOverlap(ea, eb, tolMm)) out.push(`${ta}/${tb}`);
    }
  }
  return out;
}

/**
 * Outdoor objects that float: the lowest point of the object is more than `tolMm` above the terrain beneath it and
 * no primitive of another object supports it there.
 */
export function floating(w: WorldData, tolMm = 1): string[] {
  const entries = w.prims.map((p) => entryOf(p));
  const out: string[] = [];
  for (const o of w.objects) {
    if (!OUTDOOR_TEMPLATES.has(o.templateId)) continue;
    let low = Infinity, lx = 0, lz = 0;
    for (let i = o.primStart; i < o.primStart + o.primCount; i++) {
      if ((w.prims[i].flags & PrimFlag.VISUAL_ONLY) !== 0) continue;
      const e = entries[i];
      if (e.minY < low) { low = e.minY; lx = (e.minX + e.maxX) / 2; lz = (e.minZ + e.maxZ) / 2; }
    }
    if (low - heightAt(w.terrain, lx, lz) <= tolMm) continue;
    const supported = entries.some((e) => e.prim.objectId !== o.id && lx >= e.minX && lx <= e.maxX && lz >= e.minZ && lz <= e.maxZ && primEval(e, lx, low - tolMm, lz, null) <= 0);
    if (!supported) out.push(`${o.templateId}#${o.id}`);
  }
  return out;
}
