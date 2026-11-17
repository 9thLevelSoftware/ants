// Caste destiny of a polymorphic harvester (GDD 07 §2.6, §5.3.1-5.3.2): the colony lays worker eggs; when a worker
// larva starts, it is destined minor, media or major by comparing the colony's current caste mix (adults and
// destined larvae) with casteMixTarget(N), shifted by the casteEmphasis directive (+-50 % of the major share). A
// major needs the caste unlocked (N >= unlock.minWorkers) and protein cover of MAJOR_GATE_GD days of larval demand;
// otherwise the next smaller class. The first brood (NANITIC) are minors. The destined length is a triangular draw
// of the caste's length range. Runs right after the colony's brood step.

import { rngFloat } from '@/core/rng';
import type { Brood, BroodCaste, Caste, CasteDef, Colony, Sim, SpeciesDef, System } from '@/sim/types';
import { BroodFlag } from '@/sim/types';
import { CASTE_STEP_TICKS, MAJOR_GATE_GD } from '@/sim/balance/species-harvester';
import { granaryColonies } from './economy';
import type { GranaryParams } from './params';

const POLY: readonly Caste[] = ['minor', 'media', 'major'];

/** Target shares (minor, media, major) at N workers: piecewise-linear over casteMixTarget rows. */
export function casteMixTarget(def: SpeciesDef, n: number): [number, number, number] {
  const t = def.life.casteMixTarget;
  if (t.length === 0) return [0, 1, 0];
  if (n <= t[0][0]) return [t[0][1], t[0][2], t[0][3]];
  for (let i = 1; i < t.length; i++) {
    if (n <= t[i][0]) {
      const a = t[i - 1], b = t[i], k = (n - a[0]) / (b[0] - a[0]);
      return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
    }
  }
  const z = t[t.length - 1];
  return [z[1], z[2], z[3]];
}

/** Target with the casteEmphasis directive: the major share x (1 + 0.5 e), the difference taken from or given to minors. */
export function emphasised(target: [number, number, number], emphasis: number): [number, number, number] {
  const major = Math.max(0, target[2] * (1 + 0.5 * Math.max(-1, Math.min(1, emphasis))));
  const minor = Math.max(0, target[0] - (major - target[2]));
  const sum = minor + target[1] + major;
  return sum > 0 ? [minor / sum, target[1] / sum, major / sum] : target;
}

/** Days of larval protein demand the colony's protein (pool P plus the P in its paste) covers. */
export function proteinCoverGd(sim: Sim, col: Colony, g: GranaryParams, def: SpeciesDef): number {
  let larvae = 0;
  for (const b of sim.stores.brood.list) if (b.alive && b.colony === col.id && b.stage === 'larva') larvae++;
  const media = def.castes.find((c) => c.caste === 'media');
  const perGd = media ? 1.2 / def.life.stageGd.larva : 0.5; // GDD 07 §2.3: 1.2 P per standard larva over its stage
  const demand = Math.max(1, larvae) * perGd;
  const p = col.stores.p + (col.granary?.pasteLoads ?? 0) * g.pasteP;
  return p / demand;
}

/** Adults and destined larvae of each polymorphic caste. */
function mix(sim: Sim, col: Colony): Record<string, number> {
  const m: Record<string, number> = { minor: 0, media: 0, major: 0 };
  for (const a of sim.stores.ants.list) if (a.alive && a.colony === col.id && m[a.caste] !== undefined) m[a.caste]++;
  for (const b of sim.stores.brood.list) {
    if (b.alive && b.colony === col.id && b.stage !== 'egg' && m[b.destined] !== undefined) m[b.destined]++;
  }
  return m;
}

/** Caste for a new worker larva of the colony. */
export function chooseCaste(sim: Sim, col: Colony, g: GranaryParams, def: SpeciesDef, workers: number, m = mix(sim, col)): BroodCaste {
  const target = emphasised(casteMixTarget(def, workers), col.directives.casteEmphasis ?? 0);
  const total = m.minor + m.media + m.major + 1;
  const majorDef = def.castes.find((c) => c.caste === 'major');
  const majorOk = !!majorDef && workers >= majorDef.unlock.minWorkers && proteinCoverGd(sim, col, g, def) >= MAJOR_GATE_GD;
  let best: BroodCaste = 'minor', bestGap = -Infinity;
  POLY.forEach((c, i) => {
    if (c === 'major' && !majorOk) return;
    if (target[i] <= 0) return;
    const gap = target[i] - m[c] / total;
    if (gap > bestGap) { bestGap = gap; best = c as BroodCaste; }
  });
  return best;
}

/** Triangular draw of a caste's length, BU. */
export function drawLength(def: CasteDef, u: number): number {
  const { min, mean, max } = def.lengthBu;
  if (max <= min) return mean;
  const f = (mean - min) / (max - min);
  return u < f ? min + Math.sqrt(u * (max - min) * (mean - min)) : max - Math.sqrt((1 - u) * (max - min) * (max - mean));
}

/** Destines one worker larva (no-op for brood already destined to a polymorphic or sexual caste). */
export function destine(sim: Sim, col: Colony, g: GranaryParams, def: SpeciesDef, b: Brood, workers: number): void {
  if (b.destined !== 'worker') return;
  const caste: BroodCaste = (b.flags & BroodFlag.NANITIC) !== 0 ? 'minor' : chooseCaste(sim, col, g, def, workers);
  const cd = def.castes.find((c) => c.caste === caste);
  b.destined = caste;
  if (cd && (b.flags & BroodFlag.NANITIC) === 0) b.destinedLengthBu = drawLength(cd, rngFloat(sim.stream('rng.colony')));
  if (caste === 'major' && !col.granary?.majorsUnlocked) {
    col.granary!.majorsUnlocked = true;
    sim.emit({ type: 'caste-unlocked', colonyId: col.id, caste: 'major' });
  }
}

/** Living adult workers of the colony (any worker caste). */
function workerCount(sim: Sim, col: Colony): number {
  let n = 0;
  for (const a of sim.stores.ants.list) if (a.alive && a.colony === col.id && (a.caste === 'minor' || a.caste === 'media' || a.caste === 'major' || a.caste === 'worker')) n++;
  return n;
}

export const casteDestinySystem: System = {
  name: 'granary-caste-destiny', phase: 'brood', every: CASTE_STEP_TICKS,
  run(sim) {
    for (const { col, g } of granaryColonies(sim)) {
      const def = sim.getSpecies(col.species);
      if (!def || !def.castes.some((c) => c.caste === 'major')) continue;
      let n = -1;
      for (const b of sim.stores.brood.list) {
        if (!b.alive || b.colony !== col.id || b.destined !== 'worker') continue;
        if (b.stage === 'egg' && (b.flags & BroodFlag.NANITIC) === 0) continue; // decided at larva start
        if (n < 0) n = workerCount(sim, col);
        destine(sim, col, g, def, b, n);
      }
    }
  },
};
