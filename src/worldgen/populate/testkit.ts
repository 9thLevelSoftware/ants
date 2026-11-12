// Test support for the populate step: a generated world with its final generation context (captured by a spy
// placer that runs last), cached per test file; the long-sweep flag. Not used by the generator.

import type { ArchetypeId, SpeciesId, WorldSizeId } from '@/sim/types';
import type { GenContext } from '../kit/context';
import { discoveredModules, type WorldgenModule } from '../kit/registry';
import { generateWorldReport, type WorldgenReport } from '../pipeline';
import { paramsFor } from '../testing/fixtures';
import { createKernel } from '@/sim/kernel';
import { createWalkerKin, walkerPlace, walkerStep } from '@/sim/locomotion/walker';
import { digFactor } from '@/sim/balance';
import { navDistances, cellAt } from '../validate/graph';
import { digPatchMap } from '../maps/start';
import { VALID } from '../tuning/pipeline';
import { START_RULE } from './tuning';
import { mapState } from '../maps/state';
import { emptyFactors, rivalFactorOf, sampleCell, sampleFactors, siteClass } from '../maps/suitability';
import { SUIT, SUITABILITY } from '../tuning/maps';

declare const process: { env: Record<string, string | undefined> } | undefined;
const env = typeof process !== 'undefined' ? process.env : {};
/** Large sweeps (20 seeds per archetype) only with FOUNDRESS_LONG=1. */
export const LONG = env.FOUNDRESS_LONG === '1';

export interface Generated { report: WorldgenReport; ctx: GenContext; ms: number }

const cache = new Map<string, Generated>();

/**
 * `keep` false: not cached (long sweeps would hold every world in memory). `now`: the test's wall clock for the
 * report's timings (generator code never reads a clock).
 */
export function generated(
  archetype: ArchetypeId, seed = 1, size: WorldSizeId = 'standard', species: SpeciesId = 'lasius-niger', keep = true, now?: () => number,
): Generated {
  const key = `${archetype}|${seed}|${size}|${species}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let ctx: GenContext | null = null;
  const spy: WorldgenModule = { placers: [{ id: 'zz-test/capture', step: 'start', order: 1e9, run: (c) => { ctx = c; } }] };
  const report = generateWorldReport(paramsFor(archetype, seed, size, species), { modules: [...discoveredModules(), spy], now });
  const g: Generated = { report, ctx: ctx!, ms: report.timingsMs.total ?? 0 };
  // a repaired attempt re-runs the start step on the same context: the last capture is the returned world's
  if (g.ctx.world !== report.world) throw new Error('testkit: captured context is not the returned world');
  if (keep) cache.set(key, g);
  return g;
}

// ---- a walker from the start to the nearest founding patch (addendum: start sweep) ----

export interface DigWalk { reached: boolean; pathBu: number; diggable: boolean; detail: string }

/** Patches tried in order of walking distance (a low leaf over one path can lift the walker onto its underside). */
const DIG_WALK_TRIES = 6;

/**
 * Steers a kernel surface walker from the queen start along the nav path (cell centres, queen clearance) to a
 * founding patch, nearest first (side-stepping around clutter like an ant), then checks the ground where it stands
 * inside the patch cell is diggable for the species (kernel canDigAt, dig factor >= 0.8 at 1.5 BU depth).
 */
export function walkToDigSite(ctx: GenContext): DigWalk {
  const w = ctx.world, bu = w.bu, { navN } = ctx.dims;
  const k = createKernel(w, { voxel: bu / 2, keys: [], chunks: [], breaches: [] }, { field: { hashCell: 32 * bu } });
  const start = cellAt(ctx, w.queenStart.pos.x, w.queenStart.pos.z);
  const d = navDistances(ctx, [start], { maxBu: START_RULE.digWalkBu, clearanceBu: VALID.queenClearanceBu });
  const patches = digPatchMap(ctx);
  const targets: number[] = [];
  for (let c = 0; c < d.length; c++) if (patches[c] && d[c] < Infinity) targets.push(c);
  targets.sort((a, b) => d[a] - d[b] || a - b);
  if (targets.length === 0) return { reached: false, pathBu: Infinity, diggable: false, detail: 'no patch within reach' };
  const fails: string[] = [];
  for (const target of targets.slice(0, DIG_WALK_TRIES)) {
    // cell path by descending the distances from the target back to the start
    const path: number[] = [target];
    for (let c = target, guard = 0; c !== start && guard < 64; guard++) {
      let next = c;
      for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
        const x = (c % navN) + di, z = Math.floor(c / navN) + dk;
        if (x < 0 || z < 0 || x >= navN || z >= navN) continue;
        const j = z * navN + x;
        if (d[j] < d[next]) next = j;
      }
      if (next === c) break;
      path.push(next);
      c = next;
    }
    path.reverse();
    const r = walkPath(ctx, k, path);
    if (r === null) {
      fails.push('cannot place at the start');
      continue;
    }
    if (typeof r === 'string') { fails.push(r); continue; }
    const g = k.field.height(r.x, r.z);
    const below = { x: r.x, y: g - START_RULE.digDepthBu * bu, z: r.z };
    const diggable = k.canDigAt(below.x, below.y, below.z) && digFactor(w.params.speciesId, k.field.materialAt(below)) >= START_RULE.digMin;
    if (diggable) return { reached: true, pathBu: d[target], diggable, detail: `${path.length} cells, ${d[target].toFixed(0)} BU${fails.length ? ` (after ${fails.length} blocked)` : ''}` };
    fails.push(`not diggable at (${r.x.toFixed(0)}, ${r.z.toFixed(0)})`);
  }
  return { reached: false, pathBu: d[targets[0]], diggable: false, detail: fails.join('; ') };
}

/** Walks the cell path from the start; the end position, or why it failed (null: no surface at the start). */
function walkPath(ctx: GenContext, k: ReturnType<typeof createKernel>, path: number[]): { x: number; z: number } | string | null {
  const w = ctx.world, bu = w.bu, { navN, navCell } = ctx.dims;
  const centre = (c: number) => ({ x: ((c % navN) + 0.5) * navCell, z: (Math.floor(c / navN) + 0.5) * navCell });
  const kin = createWalkerKin(k.walker.footOffset);
  // placed exactly as createNewGame places the founding queen (onto the level set from the start point)
  if (!walkerPlace(k.field, kin, w.queenStart.pos, { heading: w.queenStart.fwd }, k.walker)) return null;
  // steer at each cell centre; when no progress for a while, side-step around the obstacle (alternating sides)
  const dir = { x: 0, y: 0, z: 0 };
  for (let i = 1; i < path.length; i++) {
    const t = centre(path[i]), tol = (i === path.length - 1 ? 0.25 : 0.5) * navCell;
    let n = 0, best = Infinity, since = 0, side = 1, detour = 0;
    for (; n < 600; n++) {
      const dx = t.x - kin.pos.x, dz = t.z - kin.pos.z, l = Math.sqrt(dx * dx + dz * dz);
      if (l < tol) break;
      if (l < best - 0.1 * bu) { best = l; since = 0; } else if (++since > 30) { since = 0; detour = 15; side = -side; }
      let ux = dx / l, uz = dz / l;
      if (detour > 0) { detour--; const rx = -uz * side, rz = ux * side; ux = 0.5 * ux + 0.866 * rx; uz = 0.5 * uz + 0.866 * rz; }
      dir.x = ux; dir.y = 0; dir.z = uz;
      walkerStep(k.field, kin, dir, 6 * bu, 0.1, k.walker);
    }
    if (n >= 600) return `stuck before cell ${i}/${path.length - 1} at (${kin.pos.x.toFixed(0)}, ${kin.pos.y.toFixed(0)}, ${kin.pos.z.toFixed(0)}) up ${kin.up.y.toFixed(2)}`;
  }
  return { x: kin.pos.x, z: kin.pos.z };
}

// ---- founding-site class shares (directions §K calibration) ----

/** Class shares of the diggable nav cells (Q > 0), and how open sunny lawn and covered sunny ground read. */
export function siteDistribution(ctx: GenContext) {
  const sp = ctx.params.speciesId, q = mapState(ctx).q[sp], st = mapState(ctx);
  const n = { excellent: 0, good: 0, fair: 0, poor: 0 };
  let total = 0, lawn = 0, lawnFair = 0, cov = 0, covGood = 0;
  const rf = rivalFactorOf(ctx), f = emptyFactors(), inp = { digSpecies: sp, profile: SUITABILITY[sp] };
  for (let c = 0; c < q.length; c++) {
    if (q[c] <= 0) continue;
    total++;
    n[siteClass(q[c])]++;
    if (st.shade.mean[c] > 0.1 || st.water.flood[c] > 0.1 || rf(c) < 0.99) continue;
    let allSward = true, roof = false;
    for (let s = 0; s < 4; s++) {
      const [ti, tk] = sampleCell(ctx, c, s);
      sampleFactors(ctx, inp, c, ti, tk, 1, 0, f);
      if (f.veto) continue;
      if (f.fCover !== SUIT.coverSward) allSward = false;
      if (f.fCover === SUIT.coverCeiling) roof = true;
    }
    if (allSward && ctx.layout.zones[ctx.layout.nav[c]].variant === 'mown') { lawn++; if (siteClass(q[c]) === 'fair') lawnFair++; }
    if (roof) { cov++; if (q[c] >= SUIT.good) covGood++; }
  }
  const share = (k: keyof typeof n) => n[k] / Math.max(1, total);
  return { total, excellent: share('excellent'), good: share('good'), fair: share('fair'), poor: share('poor'), lawn, lawnFair, cov, covGood };
}
