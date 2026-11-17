// Diagnostics of the fungus module, published to the Why view (GDD 07 §5.4.10, §6.4.11, App. D):
//   diag-garden        per colony total: the worst garden's status and its factors (substrate short, too hot / cold,
//                      too dry, too few gardeners, waste not removed, Escovopsis once visible, toxic or protein-rich
//                      leaves); bad while collapsing, i >= 0.4, a garden died in the last 2 GD, or the colony is
//                      garden-less (then the brood starves whatever leaves lie in the nest).
//   diag-at-chain      the narrowest stage of the processing chain over the last 0.5 GD.
//   diag-at-substrate  a plant was rejected in the last 3 GD.
//   diag-at-phorid     phorid losses above 2 % of the laden foragers per game day.

import type { Colony, Diagnostic, GardenRecord, Sim, System } from '@/sim/types';
import { GARDEN_DIAG_DIED_GD, GARDEN_DIAG_BAD_INFECTION } from '@/sim/balance/species-leafcutter';
import { publishWithHysteresis, weighFactors, type FactorIn } from '@/sim/colony/diagFactors';
import { FUNGUS_DIAG_TICKS, GARDEN_DIAG_FSUB_WARN } from '@/sim/balance/species-leafcutter';
import { TICKS_PER_DAY } from '@/sim/time';
import type { FungusParams } from './params';
import { atColonies } from './economy';
import { totalGarden } from './state';
import { rollChain } from './chain';

const SYSTEM = 'species';
type Rec = Omit<Diagnostic, 'sinceTick'>;

function rec(id: string, label: string, status: Diagnostic['status'], value: number, factors: FactorIn[], remedies: string[]): Rec {
  return { id, system: SYSTEM, status, label, value, factors: weighFactors(factors), remedies, focus: null };
}

const clampF = (x: number) => Math.max(0.02, Math.min(1, x));

/** Status of one garden (GDD 07 §6.4.11). */
export function gardenStatus(P: FungusParams, g: GardenRecord, tick: number): Diagnostic['status'] {
  if (g.state === 'dead') return (g.diedTick ?? -1) >= 0 && tick - (g.diedTick ?? 0) < GARDEN_DIAG_DIED_GD * TICKS_PER_DAY ? 'bad' : 'ok';
  if (g.state === 'collapsing' || g.infection >= GARDEN_DIAG_BAD_INFECTION) return 'bad';
  // a young garden (seeded or establishing) short of substrate is shrinking towards death: warn (GDD 07 §6.4.11 names
  // establishing; a seeded garden is the same garden earlier, and after the hand-over the colony's only one)
  const young = g.state === 'seeded' || g.state === 'establishing';
  if (g.state === 'stressed' || g.state === 'infected' || (young && (g.fsub ?? 1) < GARDEN_DIAG_FSUB_WARN)) return 'warn';
  return 'ok';
}

/** The factors of one garden (weights from how far each is below 1). */
export function gardenFactors(P: FungusParams, g: GardenRecord): FactorIn[] {
  const f: FactorIn[] = [
    { cause: 'garden-substrate', f: clampF(g.fsub ?? 1), detail: `${(g.substrate ?? 0).toFixed(1)} LU a day for ${g.biomass.toFixed(1)} GU` },
    { cause: 'garden-temperature', f: clampF(g.fT ?? 1), detail: '' },
    { cause: 'garden-dry', f: clampF(g.fRH ?? 1), detail: '' },
    { cause: 'garden-gardeners', f: clampF(g.ftend ?? 1), detail: '' },
    { cause: 'garden-waste', f: clampF(1 - (g.contamination ?? 0)), detail: `${g.waste.toFixed(1)} loads waiting` },
    { cause: 'garden-substrate-quality', f: clampF(1 - (P.subProteinRate * Math.max(0, (g.subP ?? 0) - P.subProteinMax) + P.subToxinRate * (g.subT ?? 0)) * 4), detail: '' },
  ];
  if (g.infection >= P.escVisibleI) f.push({ cause: 'garden-escovopsis', f: clampF(1 - g.infection), detail: `${Math.round(g.infection * 100)} %` });
  return f;
}

const RANK: Record<Diagnostic['status'], number> = { ok: 0, info: 0, warn: 1, bad: 2 };

export function gardenDiag(sim: Sim, col: Colony, P: FungusParams): Rec {
  const mod = col.fungus!;
  const tick = sim.state.tick;
  let worst: GardenRecord | null = null, status: Diagnostic['status'] = 'ok';
  for (const g of mod.gardens) {
    const s = gardenStatus(P, g, tick);
    if (!worst || RANK[s] > RANK[status]) { worst = g; status = s; }
  }
  const G = totalGarden(mod);
  if (mod.gardenLess) {
    return rec('diag-garden', 'The garden is lost', 'bad', 0,
      [{ cause: 'garden-lost', f: 0.02, detail: mod.lostCause ?? '' }], ['remedy.garden.piece']);
  }
  const f = worst && worst.state !== 'dead' ? gardenFactors(P, worst) : [];
  return rec('diag-garden', `Fungus garden (${G.toFixed(1)} GU)`, status, Math.round(G * 10) / 10, f,
    ['remedy.slider.cut', 'remedy.slider.garden', 'remedy.slider.haul', 'remedy.dig.fungus', 'remedy.marker.avoid', 'remedy.leaf-selectivity']);
}

const STAGE_CAUSE: Record<string, string> = {
  cut: 'chain-cut', carried: 'chain-carry', processed: 'chain-process', planted: 'chain-plant',
};

export function chainDiag(sim: Sim, col: Colony, P: FungusParams): Rec {
  const c = col.fungus!.chain;
  const w = c?.last;
  if (!c || !w) return rec('diag-at-chain', 'Leaf chain', 'ok', 0, [], []);
  const narrow = c.narrow;
  const f: FactorIn[] = [];
  const stages = ['cut', 'carried', 'processed', 'planted'] as const;
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i];
    const up = i === 0 ? w.demand : w[stages[i - 1]];
    if (up > 1e-6) f.push({ cause: STAGE_CAUSE[s], f: clampF(w[s] / up), detail: `${w[s].toFixed(1)} of ${up.toFixed(1)} LU` });
  }
  const status: Diagnostic['status'] = narrow ? 'warn' : 'ok';
  const label = narrow ? `Leaf chain: ${narrow} is the narrowest stage` : 'Leaf chain';
  void P;
  return rec('diag-at-chain', label, status, w.planted, f, ['remedy.slider.cut', 'remedy.slider.garden', 'remedy.marker.forage', 'remedy.slider.haul']);
}

export function substrateDiag(sim: Sim, col: Colony): Rec {
  const tick = sim.state.tick;
  const recent = (col.fungus!.rejectLog ?? []).filter((r) => tick - r.tick < 3 * TICKS_PER_DAY);
  const f: FactorIn[] = recent.map((r) => ({ cause: r.reason === 'toxin' ? 'leaf-toxic' : 'leaf-protein', f: 0.3, detail: `plant ${r.plantId}` }));
  return rec('diag-at-substrate', 'Leaf choice', recent.length > 0 ? 'warn' : 'ok', recent.length, f, ['remedy.leaf-selectivity', 'remedy.marker.avoid']);
}

export function phoridDiag(sim: Sim, col: Colony): Rec {
  const mod = col.fungus!;
  const rate = Math.max(mod.phoridLastDayRate ?? 0, (mod.phoridForagersToday ?? 0) >= 10 ? (mod.phoridToday ?? 0) / (mod.phoridForagersToday ?? 1) : 0);
  const f: FactorIn[] = [{ cause: 'phorid-flies', f: clampF(1 - rate * 10), detail: `${Math.round(rate * 1000) / 10} % of carriers` }];
  return rec('diag-at-phorid', 'Phorid flies', rate > 0.02 ? 'warn' : 'ok', rate, f, ['remedy.hitchhiker-escort', 'remedy.forage-night']);
}

/** Publishes every fungus diagnostic of a colony; returns them (tests). */
export function publishFungusDiagnostics(sim: Sim, col: Colony, P: FungusParams): Diagnostic[] {
  rollChain(sim, col, totalGarden(col.fungus!), P.subNeedPerGu);
  return [gardenDiag(sim, col, P), chainDiag(sim, col, P), substrateDiag(sim, col), phoridDiag(sim, col)]
    .map((r) => publishWithHysteresis(sim, col, r));
}

export const fungusDiagnosticsSystem: System = {
  name: 'fungus-diagnostics', phase: 'progression', every: FUNGUS_DIAG_TICKS,
  run(sim) {
    for (const { col, P } of atColonies(sim)) {
      if (col.isPlayer) publishFungusDiagnostics(sim, col, P);
      else rollChain(sim, col, totalGarden(col.fungus!), P.subNeedPerGu);
    }
  },
};
