// Health verdict of a colony-life run (int-1B-sim task, work item 4). Each check names the rule and its numbers.
//
// The definitions, from the task spec and the GDD:
// - founding: the opening reaches the hand-over and the first workers lie in the species' expectedFirstWorkers range
//   (GDD 06 §5.15);
// - foraging: workers leave and come back with food: deliveries on at least half of the days after day 1;
// - stores: the colony is never in starvation stage S3 (brood-sacrifice) or worse at a day boundary for two days
//   in a row (GDD 02 §5.7: S1/S2 are the tolerated warning stages);
// - larvae fed: at day ends with larvae, mean larval hunger stays below 0.8, and no larva starves to death in
//   more than one day;
// - growth: GDD 07 §1 growth targets for the founding year (Lasius y1: 12-25 workers at the end of colony year 1,
//   i.e. an incipient colony holds its first workers and grows slowly; GDD 02 §15 +11 %/gd is the 60-worker summer
//   case): workers at the end within [0.75 x first workers, y1 max x 1.5], the daily growth below +30 %/gd, and the
//   queen lays at least once (laying is protein-limited at T1, C13);
// - architect / spoil: no soil pellet is left lying in the nest for good (pellets in the nest at the last day end
//   <= 10 + 10 % of the pellets made), and the chamber count does not fall;
// - stuck: no ant stuck (moving with no progress for 3 game minutes) on two consecutive days, and none past
//   1.5 x its in-nest state timeout on two consecutive days;
// - invariants: zero violations.

import type { LifeReport } from './life';

/** GDD 07 growth targets, workers at the end of colony year 1 (Lasius §1 table; T3 species their own rows). */
const Y1_WORKERS: Record<string, { min: number; max: number }> = {
  'lasius-niger': { min: 12, max: 25 }, 'camponotus-pennsylvanicus': { min: 6, max: 12 },
  'messor-barbarus': { min: 15, max: 40 }, 'atta-texana': { min: 100, max: 300 },
};

export interface Verdict {
  healthy: boolean;
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

  const hungry = live.filter((d) => d.state.larvae > 0 && d.state.meanLarvalHunger >= 0.8).length;
  const starvedDays = live.filter((d) => Object.entries(d.events.broodDeathsByCause).some(([k, v]) => k.startsWith('larva:starv') && v > 0)).length;
  add('larvae fed', hungry === 0 && starvedDays <= 1, `day ends with mean hunger >= 0.8: ${hungry}; days with larval starvation deaths: ${starvedDays}`);

  const w0 = f.workers, wEnd = days[days.length - 1].state.workers;
  let maxRate = 0;
  for (let i = 1; i < days.length; i++) {
    const a = days[i - 1].state.workers, b = days[i].state.workers;
    if (a >= 5) maxRate = Math.max(maxRate, (b - a) / a);
  }
  const eggs = live.reduce((a, d) => a + d.events.eggsLaid, 0);
  const y1 = Y1_WORKERS[r.options.species] ?? { min: 0, max: Infinity };
  // laying needs a season and a royal-chamber temperature that allow it (GDD 02 §3.1 fSeason x fTempQ): after a
  // late-summer hand-over the queen of an incipient Lasius colony rightly lays nothing until spring
  // and the workers to permit laying protein (GDD 02 §3.3: withheld unless the colony is `fed` with protein in
  // stock): a queen of a lean colony that does not lay is the design's response, not a fault. Counted in samples
  // (stuck.layOpenGd, game days with potential > 0.5 and permission); reports without it fall back to the potential.
  const couldLay = live.some((d) => (d.stuck.layOpenGd ?? ((d.state.layPotential ?? 1) > 0.5 ? 1 : 0)) >= 0.05);
  add('growth', wEnd >= 0.75 * w0 && wEnd <= 1.5 * y1.max && maxRate <= 0.3 && (eggs > 0 || !couldLay),
    `workers ${w0} -> ${wEnd} (y1 target ${y1.min}-${y1.max}); max daily growth ${(maxRate * 100).toFixed(0)} %; eggs laid ${eggs}; laying potential per day ${live.map((d) => d.state.layPotential ?? '?').join(',')}; laying permitted gd per day ${live.map((d) => d.stuck.layOpenGd ?? '?').join(',')}`);

  const made = live.reduce((a, d) => a + d.events.pelletsMade, 0);
  const last = days[days.length - 1].state;
  const ch0 = Object.values(days[0].state.chambers).reduce((a, b) => a + b, 0);
  const chEnd = Object.values(last.chambers).reduce((a, b) => a + b, 0);
  add('architect / spoil', last.pelletsInNest <= 10 + 0.1 * made && chEnd >= ch0,
    `pellets made ${made}, lying in the nest at the end ${last.pelletsInNest}; chambers ${ch0} -> ${chEnd} ${JSON.stringify(last.chambers)}`);

  let stuckRun = 0, toRun = 0, stuckWorst = 0, toWorst = 0;
  for (const d of live) {
    stuckRun = d.stuck.stuckAnts > 0 ? stuckRun + 1 : 0; stuckWorst = Math.max(stuckWorst, stuckRun);
    toRun = d.stuck.overTimeout > 0 ? toRun + 1 : 0; toWorst = Math.max(toWorst, toRun);
  }
  add('stuck', stuckWorst < 2 && toWorst < 2, `stuck ants per day ${live.map((d) => d.stuck.stuckAnts).join(',')}; over timeout ${live.map((d) => d.stuck.overTimeout).join(',')}`);

  add('invariants', r.violationCount === 0, `${r.violationCount} violations${r.violations[0] ? `, first: ${JSON.stringify(r.violations[0]).slice(0, 160)}` : ''}`);
  return { healthy: checks.every((c) => c.ok), checks };
}
