// Caste destiny of a leafcutter's worker larvae (GDD 07 §2.6, §5.4.1-5.4.2): at larva start each worker larva is
// destined minim (`minor`), small media / media (`media`, split by ATTA_SMALL_MEDIA_SHARE(N) of the species data)
// or major, by the colony's caste mix against casteMixTarget(N) shifted by casteEmphasis (+-50 % of the major
// share). Majors unlock at N >= 400 and need the gardens' yield to cover MAJOR_GATE_GD days of larval demand
// ("Atta: total garden yield"). The first brood (NANITIC) are minims. Runs right after the colony's brood step.

import { rngFloat } from '@/core/rng';
import type { Brood, BroodCaste, CasteDef, Colony, Sim, SpeciesDef, System } from '@/sim/types';
import { MAJOR_GATE_GD, CASTE_EMPHASIS_SPAN, CASTE_STEP_TICKS, UNDECIDED_LARVA_FOOD } from '@/sim/balance/species-leafcutter';
import { BroodFlag } from '@/sim/types';
import { ATTA_SMALL_MEDIA_SHARE } from '@/sim/species/data/atta-texana';
import { curveAt, larvaFood } from '@/sim/colony/life';
import { atColonies } from './economy';
import type { FungusParams } from './params';
import { liveGardens } from './state';

const POLY = ['minor', 'media', 'major'] as const;

/** Target shares (minor, media, major) at N workers: piecewise-linear over casteMixTarget rows. */
export function attaMixTarget(def: SpeciesDef, n: number, emphasis: number): [number, number, number] {
  const t = def.life.casteMixTarget;
  let out: [number, number, number] = [t[0][1], t[0][2], t[0][3]];
  for (let i = 1; i < t.length; i++) {
    if (n <= t[i][0]) {
      const a = t[i - 1], b = t[i], k = (n - a[0]) / Math.max(1e-9, b[0] - a[0]);
      out = [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
      break;
    }
    out = [t[i][1], t[i][2], t[i][3]];
  }
  const major = Math.max(0, out[2] * (1 + CASTE_EMPHASIS_SPAN * Math.max(-1, Math.min(1, emphasis))));
  const minor = Math.max(0, out[0] - (major - out[2]));
  const sum = minor + out[1] + major;
  return sum > 0 ? [minor / sum, out[1] / sum, major / sum] : out;
}

/** The gardens' yield now, FL per game day. */
export function yieldPerGd(P: FungusParams, col: Colony): number {
  let y = 0;
  for (const g of liveGardens(col.fungus!)) y += P.yieldPerGu * g.biomass * g.health * Math.min(1, g.fclim ?? 1);
  return y;
}

/** Days of larval demand the yield (and the harvested stock) covers. */
export function yieldCoverGd(sim: Sim, col: Colony, P: FungusParams, def: SpeciesDef): number {
  let need = 0;
  for (const b of sim.stores.brood.list) {
    if (!b.alive || b.colony !== col.id || b.stage !== 'larva') continue;
    const f = b.destined === 'worker' ? UNDECIDED_LARVA_FOOD : larvaFood(def, b.destined, b.destinedLengthBu);
    need += f.c + f.p;
  }
  const perGd = Math.max(0.2, need) / Math.max(1e-6, def.life.stageGd.larva);
  return ((col.fungus!.staphylae ?? 0) + yieldPerGd(P, col) * MAJOR_GATE_GD) / perGd;
}

function mix(sim: Sim, col: Colony): Record<string, number> {
  const m: Record<string, number> = { minor: 0, media: 0, major: 0 };
  for (const a of sim.stores.ants.list) if (a.alive && a.colony === col.id && m[a.caste] !== undefined) m[a.caste]++;
  for (const b of sim.stores.brood.list) if (b.alive && b.colony === col.id && b.stage !== 'egg' && m[b.destined] !== undefined) m[b.destined]++;
  return m;
}

/** Triangular draw within [min, max] with mode `mode`, u in 0..1. */
function tri(min: number, mode: number, max: number, u: number): number {
  if (max <= min) return mode;
  const f = (mode - min) / (max - min);
  return u < f ? min + Math.sqrt(u * (max - min) * (mode - min)) : max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}

/** Destined length of a larva of this caste (media: small media or media by the share curve), BU. */
export function lengthFor(def: SpeciesDef, cd: CasteDef, workers: number, u1: number, u2: number): number {
  if (cd.caste !== 'media') return tri(cd.lengthBu.min, cd.lengthBu.mean, cd.lengthBu.max, u1);
  const sm = cd.sizeClasses.find((s) => s.id === 'small-media');
  if (!sm) return tri(cd.lengthBu.min, cd.lengthBu.mean, cd.lengthBu.max, u1);
  const small = u2 < curveAt(ATTA_SMALL_MEDIA_SHARE, workers);
  // small media 0.6 / 0.7 / 0.8 BU (GDD 07 §5.4.1 table); media 0.8 / 1.0 / 1.3
  return small ? tri(sm.minBu, (sm.minBu + sm.maxBu) / 2, sm.maxBu - 1e-3, u1) : tri(sm.maxBu, cd.lengthBu.mean, cd.lengthBu.max, u1);
}

export function chooseAttaCaste(sim: Sim, col: Colony, P: FungusParams, def: SpeciesDef, workers: number): BroodCaste {
  const target = attaMixTarget(def, workers, col.directives.casteEmphasis ?? 0);
  const m = mix(sim, col);
  const total = m.minor + m.media + m.major + 1;
  const majorDef = def.castes.find((c) => c.caste === 'major');
  const majorOk = !!majorDef && workers >= majorDef.unlock.minWorkers && yieldCoverGd(sim, col, P, def) >= MAJOR_GATE_GD;
  let best: BroodCaste = 'minor', bestGap = -Infinity;
  POLY.forEach((c, i) => {
    if ((c === 'major' && !majorOk) || target[i] <= 0) return;
    const gap = target[i] - m[c] / total;
    if (gap > bestGap) { bestGap = gap; best = c; }
  });
  return best;
}

export function destineAtta(sim: Sim, col: Colony, P: FungusParams, def: SpeciesDef, b: Brood, workers: number): void {
  if (b.destined !== 'worker') return;
  const first = (b.flags & BroodFlag.NANITIC) !== 0;
  const caste: BroodCaste = first ? 'minor' : chooseAttaCaste(sim, col, P, def, workers);
  const cd = def.castes.find((c) => c.caste === caste);
  b.destined = caste;
  const rng = sim.stream('rng.colony');
  if (cd) b.destinedLengthBu = lengthFor(def, cd, workers, rngFloat(rng), rngFloat(rng));
  if (b.destinedLengthBu === 1) b.destinedLengthBu = 1 - 1e-6; // 1 is the colony's "undecided" marker
  const mod = col.fungus!;
  if (caste === 'major' && !mod.majorsUnlocked) {
    mod.majorsUnlocked = true;
    sim.emit({ type: 'caste-unlocked', colonyId: col.id, caste: 'major' });
  }
}

function workerCount(sim: Sim, col: Colony): number {
  let n = 0;
  for (const a of sim.stores.ants.list) if (a.alive && a.colony === col.id && (a.caste === 'minor' || a.caste === 'media' || a.caste === 'major')) n++;
  return n;
}

export const attaCasteSystem: System = {
  name: 'fungus-caste-destiny', phase: 'brood', every: CASTE_STEP_TICKS,
  run(sim) {
    for (const { col, P } of atColonies(sim)) {
      const def = sim.getSpecies(col.species);
      if (!def) continue;
      let n = -1;
      for (const b of sim.stores.brood.list) {
        if (!b.alive || b.colony !== col.id || b.destined !== 'worker') continue;
        if (b.stage === 'egg' && (b.flags & BroodFlag.NANITIC) === 0) continue; // decided at larva start
        if (n < 0) n = workerCount(sim, col);
        destineAtta(sim, col, P, def, b, n);
      }
    }
  },
};
