// The epitaph's record (GDD 06 §13.5): a plain read of the ended (or ending) colony for the Epitaph screen and the
// Lineage colony record. Pure: reads the state, words nothing (the interface words ids and numbers). Falls back to
// the history counters and cause `unknown` when the succession record is missing (§13.6).

import type { DaughterRecord, Sim, SuccessionBook } from '@/sim/types';
import { SEASONS } from '@/sim/types';
import { milestoneList } from '@/sim/progression/queries';
import { calendarTick, currentDayOfYear, currentYear, dayOf, seasonLength, ticksPerYear, TICKS_PER_DAY } from '@/sim/time';
import { EPITAPH_LAST_ENTRIES, EPITAPH_TOP_CAUSES } from '@/sim/balance/lifecycle';
import { lifecycleOf, playerCol } from './lifecycleState';

export interface EpitaphGraph {
  /** Game days covered (index 0 = the first filed day). */
  days: number;
  seasonLength: number;
  /** Calendar day index of sample 0 (season bands are drawn from it when `sampleDays` is missing). */
  startDay: number;
  /** Calendar day index of each sample (the calendar jumps over the winter, so samples are not contiguous days). */
  sampleDays: number[];
  series: { workers: number[]; eggs: number[]; larvae: number[]; pupae: number[]; storesC: number[]; storesP: number[] };
  /** Milestones as marks: sample index and id. */
  milestones: { day: number; id: string }[];
  /** Sample index of the queen's death, null if she did not die. */
  queenDeathDay: number | null;
}

export interface EpitaphData {
  name: string;
  species: string;
  archetype: string;
  seedText: string;
  difficulty: string[];
  founded: { doy: number; year: number };
  ended: { doy: number; year: number };
  spanYears: number;
  generation: number;
  parentColonyId: string;
  /** Primary cause of the end (the last death, or `retired`, `unknown`) and the chain of causes. */
  cause: string;
  chain: string[];
  queenCause: string;
  /** Game days from the queen's death to the end; null if she outlived the colony or nothing is recorded. */
  orphanDays: number | null;
  queenDiedYear: number | null;
  graph: EpitaphGraph;
  causes: { cause: string; n: number }[];
  bySeason: Record<string, number>;
  figures: {
    peakWorkers: number; peakYear: number; born: number; foodC: number; foodP: number; chambers: number; volume: number;
    winters: number; alatesReared: number; alatesFlown: number; flights: number; daughters: number; rivals: number;
  };
  lastEntries: { tick: number; kind: string; key: string; title: string; text: string; tokens: Record<string, string | number> }[];
  daughters: DaughterRecord[];
  flightYears: number[];
}

const series = (sim: Sim, id: string): number[] => [...(sim.state.progression.history.daily[id] ?? [])];

export function buildEpitaph(sim: Sim): EpitaphData {
  const s = sim.state;
  const col = playerCol(sim);
  const life = col ? lifecycleOf(col) : null;
  const sc = life?.succession;
  const yearTicks = ticksPerYear(s.config);
  const startTick = col ? col.foundedTick : 0;
  const workers = series(sim, 'workers');
  const nDays = workers.length;
  const dates = sampleDates(sim, sc, nDays);
  const toSample = (tick: number): number => sampleOfTick(dates.ticks, tick, nDays);
  const queenTick = sc && sc.queenDiedTick >= 0 ? sc.queenDiedTick : -1;
  const endTick = sc && sc.extinctTick >= 0 ? sc.extinctTick : s.tick;
  const link = s.progression.lineage;
  const founded = life?.founded ?? { tick: startTick, doy: 1, year: 1 };
  const winters = (life?.winters ?? []).filter((w) => w.queenAlive || w.workers1 > 0).length;
  const flights = life?.flights ?? [];
  return {
    name: link.name, species: s.config.species, archetype: s.config.world.archetype, seedText: s.config.world.seedText,
    difficulty: [s.config.difficulty.preset, ...s.progression.difficultyHistory.map((d) => d.preset)],
    founded: { doy: founded.doy, year: founded.year }, ended: { doy: currentDayOfYear(s), year: currentYear(s) },
    spanYears: Math.max(0, (endTick - startTick) / yearTicks), generation: link.generation, parentColonyId: link.parentColonyId,
    cause: sc?.extinctCause || s.progression.finalCauses[0] || 'unknown',
    chain: sc && sc.causeChain.length > 0 ? [...sc.causeChain] : [...s.progression.finalCauses],
    queenCause: sc?.queenCause ?? '',
    orphanDays: queenTick >= 0 ? (endTick - queenTick) / TICKS_PER_DAY : null,
    queenDiedYear: queenTick < 0 ? null : sc?.queenDied ? sc.queenDied.year : Math.floor((queenTick + s.env.calendar.startTick) / yearTicks) + 1,
    graph: {
      days: nDays, seasonLength: seasonLength(s), startDay: dates.days[0] ?? 0, sampleDays: dates.days,
      series: {
        workers, eggs: series(sim, 'eggs'), larvae: series(sim, 'larvae'), pupae: series(sim, 'pupae'),
        storesC: series(sim, 'stores-c'), storesP: series(sim, 'stores-p'),
      },
      milestones: milestoneList(sim).map((m) => ({ day: toSample(m.tick), id: m.id })),
      queenDeathDay: queenTick >= 0 ? toSample(queenTick) : null,
    },
    ...colonyDeaths(sim, life?.repro.flownByCause ?? {}, life?.repro.flownBySeason ?? []),
    figures: {
      peakWorkers: Math.max(sc?.peakWorkers ?? 0, s.progression.peakWorkers), peakYear: sc?.peakYear ?? 1, born: sc?.born ?? 0,
      foodC: sc?.foodC ?? 0, foodP: sc?.foodP ?? 0, chambers: sc?.peakChambers ?? 0, volume: sc?.peakVolume ?? 0, winters,
      alatesReared: life?.repro.alatesReared ?? 0, alatesFlown: life?.repro.alatesFlown ?? 0, flights: flights.length,
      daughters: life?.repro.daughtersFounded ?? 0, rivals: s.progression.rivalsDefeated,
    },
    lastEntries: s.progression.journal.entries.slice(-EPITAPH_LAST_ENTRIES).map((e) => ({
      tick: e.tick, kind: e.kind, key: e.key ?? '', title: e.title, text: e.text, tokens: { ...(e.tokens ?? {}) },
    })),
    daughters: (life?.daughters ?? []).map((d) => ({ ...d })),
    flightYears: flights.map((f) => f.date.year),
  };
}

/**
 * Calendar day and filing tick of every daily sample: tracked ones as recorded; untracked ones (filed before the
 * tracking began) counted back one calendar day per sample from the first tracked one, or from today.
 */
function sampleDates(sim: Sim, sc: SuccessionBook | undefined, n: number): { days: number[]; ticks: number[] } {
  const days: number[] = [], ticks: number[] = [];
  const trackedDays = sc?.sampleDays ?? [], trackedTicks = sc?.sampleTicks ?? [];
  for (let i = 0; i < n; i++) { days.push(trackedDays[i] ?? -1); ticks.push(trackedTicks[i] ?? -1); }
  let nextDay = dayOf(calendarTick(sim.state)), nextTick = sim.state.tick;
  for (let i = n - 1; i >= 0; i--) {
    if (days[i] < 0) days[i] = Math.max(0, nextDay - 1);
    if (ticks[i] < 0) ticks[i] = Math.max(0, nextTick - TICKS_PER_DAY);
    nextDay = days[i];
    nextTick = ticks[i];
  }
  return { days, ticks };
}

/** Sample index that covers simulation tick `tick`: the first sample filed after it (the last for later ticks). */
function sampleOfTick(ticks: number[], tick: number, n: number): number {
  for (let i = 0; i < ticks.length; i++) if (ticks[i] > tick) return Math.min(i, n - 1);
  return Math.max(0, n - 1);
}

/**
 * The colony's causes of death (GDD 06 §9.3 summary) without the alates that left on a flight: their removal is
 * booked as `dispersed` (gynes) and `old-age` (males) by the death statistics, which would otherwise show the flight
 * as "leaving the map" and inflate the workers' old age.
 */
function colonyDeaths(sim: Sim, flown: Record<string, number>, flownBySeason: number[]): Pick<EpitaphData, 'causes' | 'bySeason'> {
  const d = sim.state.progression.deaths;
  const causes: { cause: string; n: number }[] = [];
  for (const cause of Object.keys(d.byCause)) {
    const n = d.byCause[cause] - (flown[cause] ?? 0);
    if (n > 0) causes.push({ cause, n });
  }
  causes.sort((a, b) => b.n - a.n || a.cause.localeCompare(b.cause));
  const bySeason: Record<string, number> = {};
  SEASONS.forEach((season, i) => { bySeason[season] = Math.max(0, (d.bySeason[i] ?? 0) - (flownBySeason[i] ?? 0)); });
  return { causes: causes.slice(0, EPITAPH_TOP_CAUSES), bySeason };
}
