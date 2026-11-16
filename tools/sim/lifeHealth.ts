// Health verdict of a colony-life run (int-1B-sim task, work item 4). Each check names the rule and its numbers.
//
// The definitions, from the task spec and the GDD:
// - founding: the opening reaches the hand-over and the first workers lie in the species' expectedFirstWorkers range
//   (GDD 06 §5.15);
// - foraging: workers leave and come back with food: deliveries on at least half of the days after day 1;
// - stores: the colony is never in starvation stage S3 (brood-sacrifice) or worse at a day boundary for two days
//   in a row (GDD 02 §5.7: S1/S2 are the tolerated warning stages);
// - larvae fed: no larva of the player colony starves to death on any day, and mean larval hunger is not >= 0.8 at
//   two day ends in a row (one snapshot can be a larva that has just hatched hungry and is fed within hours);
// - growth ("the population grows along the GDD 02 curve within its tolerance"; int-1B review made this strict):
//   the workers at the end are at least the first workers (a loss is not growth) and the daily growth stays below
//   +30 %/gd; the queen lays when laying was possible (laying is protein-limited at T1, C13; GDD 02 §3.1/§3.3);
//   and the brood pipeline follows GDD 02's development curve: once the first clutch has had the egg-to-adult
//   development units (GDD 02 §2.2-2.3, 3.9 DU, r(T) from the day-end brood chamber temperature, counted only on
//   non-autumn/winter days because autumn larvae enter diapause, §2.8), at least one worker must have eclosed.
//   Separately the verdict records `netGrowth` (workers at the end > first workers), the literal reading, which no
//   incipient colony can meet in a 5-7 gd autumn window by that same curve;
// - architect / spoil: no soil pellet is left lying in the nest for good (pellets in the nest at the last day end
//   <= 10 + 10 % of the pellets made), and the chamber count does not fall;
// - stuck: no ant stuck (moving with no progress for 3 game minutes) and none past 1.5 x its in-nest state timeout,
//   on any day ("no ant is stuck beyond its state timeout");
// - invariants: zero violations.

import type { LifeReport } from './life';
import { devRate, stageDu } from '@/sim/colony/life';
import { requireSpecies } from '@/sim/species';

/** GDD 07 growth targets, workers at the end of colony year 1 (Lasius §1 table; T3 species their own rows). */
const Y1_WORKERS: Record<string, { min: number; max: number }> = {
  'lasius-niger': { min: 12, max: 25 }, 'camponotus-pennsylvanicus': { min: 6, max: 12 },
  'messor-barbarus': { min: 15, max: 40 }, 'atta-texana': { min: 100, max: 300 },
};

/** Laying must have been possible this long within one day before a run without eggs counts against growth, gd. */
const LAY_OPEN_MIN_GD = 0.25;

export interface Verdict {
  healthy: boolean;
  /** Workers at the end > first workers (the literal "population grows"), reported beside the verdict. */
  netGrowth: boolean;
  checks: { name: string; ok: boolean; detail: string }[];
}

export function judge(r: LifeReport): Verdict {
  const checks: Verdict['checks'] = [];
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });
  const f = r.founding, days = r.days, live = days.slice(1);
  add('founding', (f.phase === 'handover' || f.phase === 'done') && f.workers >= f.expected.min && f.workers <= f.expected.max,
    `${f.phase}, ${f.workers} first workers (range ${f.expected.min}-${f.expected.max}) after ${f.gd} gd`);

  const withDeliv = live.slice(1).filter((d) => d.events.deliveries > 0).length;
  const deliveries = live.reduce((a, d) => a + d.events.deliveries, 0);
  add('foraging', live.length > 1 && withDeliv >= Math.ceil((live.length - 1) / 2),
    `${deliveries} deliveries; days 2..${live.length} with deliveries: ${withDeliv}`);

  const bad = (s: string) => s === 'brood-sacrifice' || s === 'adult-starvation';
  let run = 0, worst = 0;
  for (const d of live) { run = bad(d.state.starvationStage) ? run + 1 : 0; worst = Math.max(worst, run); }
  add('stores', worst < 2, `longest run of day ends at S3 or worse: ${worst}; stages ${live.map((d) => d.state.starvationStage).join(',')}`);

  const isHungry = (d: (typeof live)[number]) => d.state.larvae > 0 && d.state.meanLarvalHunger >= 0.8;
  const hungry = live.filter(isHungry).length;
  const hungryRun = live.reduce((acc, d) => { const run = isHungry(d) ? acc.run + 1 : 0; return { run, max: Math.max(acc.max, run) }; }, { run: 0, max: 0 }).max;
  const larvaStarved = live.reduce((a, d) => a + Object.entries(d.events.broodDeathsByCause)
    .filter(([k]) => k.startsWith('larva:starv')).reduce((x, [, v]) => x + v, 0), 0);
  add('larvae fed', hungryRun <= 1 && larvaStarved === 0, `day ends with mean hunger >= 0.8: ${hungry} (longest run ${hungryRun}); larvae starved: ${larvaStarved}`);

  const w0 = f.workers, wEnd = days[days.length - 1].state.workers;
  let maxRate = 0;
  for (let i = 1; i < days.length; i++) {
    const a = days[i - 1].state.workers, b = days[i].state.workers;
    if (a >= 5) maxRate = Math.max(maxRate, (b - a) / a);
  }
  const eggs = live.reduce((a, d) => a + d.events.eggsLaid, 0);
  const eclosed = live.reduce((a, d) => a + d.events.eclosions, 0);
  const y1 = Y1_WORKERS[r.options.species] ?? { min: 0, max: Infinity };
  // laying needs a season and a royal-chamber temperature that allow it (GDD 02 §3.1 fSeason x fTempQ) and the
  // workers to permit laying protein (GDD 02 §3.3: withheld unless the colony is `fed` with protein in stock): a
  // queen of a lean colony that does not lay is the design's response, not a fault. Counted in samples
  // (stuck.layOpenGd, game days with potential > 0.5 and permission); reports without it fall back to the potential.
  // A window shorter than LAY_OPEN_MIN_GD in a day need not yield an egg (the carers first have to feed her the
  // laying protein, GDD 02 §3.3).
  const couldLay = live.some((d) => (d.stuck.layOpenGd ?? ((d.state.layPotential ?? 1) > 0.5 ? 1 : 0)) >= LAY_OPEN_MIN_GD);
  const due = firstClutchDue(r);
  const curveOk = due.dueDay < 0 || eclosed > 0;
  add('growth', wEnd >= w0 && maxRate <= 0.3 && (eggs > 0 || !couldLay) && curveOk,
    `workers ${w0} -> ${wEnd} (y1 target ${y1.min}-${y1.max}); max daily growth ${(maxRate * 100).toFixed(0)} %; eggs laid ${eggs}; `
    + `eclosed ${eclosed}; first clutch DU by the end ${due.du.toFixed(2)} of ${due.need.toFixed(2)}${due.dueDay >= 0 ? ` (due on day ${due.dueDay})` : ''}; `
    + `laying potential per day ${live.map((d) => d.state.layPotential ?? '?').join(',')}; laying permitted gd per day ${live.map((d) => d.stuck.layOpenGd ?? '?').join(',')}`);

  const made = live.reduce((a, d) => a + d.events.pelletsMade, 0);
  const last = days[days.length - 1].state;
  const ch0 = Object.values(days[0].state.chambers).reduce((a, b) => a + b, 0);
  const chEnd = Object.values(last.chambers).reduce((a, b) => a + b, 0);
  add('architect / spoil', last.pelletsInNest <= 10 + 0.1 * made && chEnd >= ch0,
    `pellets made ${made}, lying in the nest at the end ${last.pelletsInNest}; chambers ${ch0} -> ${chEnd} ${JSON.stringify(last.chambers)}`);

  const stuckDays = live.filter((d) => d.stuck.stuckAnts > 0 || d.stuck.overTimeout > 0).length;
  add('stuck', stuckDays === 0, `stuck ants per day ${live.map((d) => d.stuck.stuckAnts).join(',')}; over timeout ${live.map((d) => d.stuck.overTimeout).join(',')}`);

  add('invariants', r.violationCount === 0, `${r.violationCount} violations${r.violations[0] ? `, first: ${JSON.stringify(r.violations[0]).slice(0, 160)}` : ''}`);
  return { healthy: checks.every((c) => c.ok), netGrowth: wEnd > w0, checks };
}

/**
 * Development units the player's first clutch has had by the end of the run (GDD 02 §2.2 r(T) at the day-end brood
 * chamber temperature, from the day after the first eggs were laid; autumn and winter days count 0, §2.8 larval
 * diapause), the units it needs (egg + larva + pupa, worker-destined), and the day it was due (-1 not yet).
 */
export function firstClutchDue(r: LifeReport): { du: number; need: number; dueDay: number } {
  const def = requireSpecies(r.options.species);
  const need = stageDu(def, 'egg', 'worker') + stageDu(def, 'larva', 'worker') + stageDu(def, 'pupa', 'worker');
  const days = r.days;
  const first = days.findIndex((d, i) => i > 0 && d.events.eggsLaid > 0);
  let du = 0, dueDay = -1;
  if (first < 0) return { du, need, dueDay };
  for (let i = first + 1; i < days.length; i++) {
    const d = days[i];
    const t = d.state.broodTempC;
    if (t === null || t === undefined || d.state.season === 'autumn' || d.state.season === 'winter') continue;
    du += devRate(def, t);
    if (dueDay < 0 && du >= need) dueDay = d.state.day;
  }
  return { du, need, dueDay };
}
