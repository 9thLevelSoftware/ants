// Event watcher: one listener per Sim (runtime only, installed by the progression system on its first run and by
// `attachProgression`). It runs at event flush, deterministically, and updates plain state: the trigger tables,
// death statistics, intake accumulators, winters, journal entries for seasons, weather, winter reports, flights and
// notable events, and the game-over record.

import type { Sim, SimEvent, TargetRef } from '@/sim/types';
import { currentYear, seasonIndexOf, calendarTick } from '@/sim/time';
import { censusOf, engineOf, isPlayerColonyId, memGet, memSet, playerColony } from './engine';
import { addJournal, logEvent } from './journal';
import { triggersOnEvent } from './milestones';
import { countWinter, lastWinterYear, queenAlive } from './milestoneRules';
import { recordDeath } from './deaths';
import { accumulate } from './stats';
import { markStageDirty } from './stage';
import { worstCauseChain } from './diagnostics';
import { journalAimEvent } from './aims';
import { playerNests } from './triggers';

const attached = new WeakSet<Sim>();

/** Installs the progression listener on this Sim once (call before stepping a sim built without the system list). */
export function attachProgression(sim: Sim): void {
  if (attached.has(sim)) return;
  attached.add(sim);
  sim.events.onAny((_type, payload) => onEvent(sim, payload as SimEvent));
}

/** Journal key of the queen's death (kind `loss`). */
export const QUEEN_LOSS_KEY = 'loss.queen';

const WEATHER_FIRSTS = new Set(['rain', 'storm', 'heat', 'frost']);

function onEvent(sim: Sim, ev: SimEvent): void {
  bookkeeping(sim, ev);
  triggersOnEvent(sim, ev);
}

function bookkeeping(sim: Sim, ev: SimEvent): void {
  switch (ev.type) {
    case 'ant-died':
      recordDeath(sim, ev);
      if (ev.caste === 'queen' && isPlayerColonyId(sim, ev.colonyId)) {
        logEvent(sim, 'death', 'critical', 'queen-died', { cause: ev.cause }, { kind: 'ant', id: ev.antId, pos: { ...ev.pos } });
        // GDD 06 §9.1: queen death is a `loss` entry of its own (token {cause} = cause id)
        addJournal(sim, 'loss', QUEEN_LOSS_KEY, { cause: ev.cause }, [String(ev.antId)]);
      }
      markStageDirty(sim);
      break;
    case 'ant-eclosed': case 'colony.orphaned': case 'queen.died': case 'opening.handover': case 'overwinter.end':
      markStageDirty(sim);
      break;
    case 'delivery':
      if (isPlayerColonyId(sim, ev.colonyId)) accumulate(sim, `intake-by-kind:${ev.kind}`, ev.c + ev.p);
      break;
    case 'possession-started':
      logEvent(sim, 'possession', 'info', 'possession', { caste: ev.caste }, antFocus(sim, ev.antId));
      break;
    case 'overwinter.report':
      if (queenAlive(sim)) countWinter(sim, lastWinterYear(sim));
      winterReportEntry(sim, ev.report);
      break;
    case 'time.season':
      if (ev.season === 'spring' && ev.year > 1 && queenAlive(sim)) countWinter(sim, ev.year - 1);
      seasonEntry(sim);
      break;
    case 'weather.changed':
      weatherEntry(sim, ev.to);
      break;
    case 'aim.opened': case 'aim.completed':
      journalAimEvent(sim, ev.id, ev.type === 'aim.opened' ? 'opened' : 'completed');
      break;
    case 'flight.launched':
      memSet(sim, 'flightLaunched', ev.nGynes + ev.nMales);
      break;
    case 'flight.ended':
      // the event carries no mated count yet: `mated` is the number of daughters that began a nest (lower bound)
      addJournal(sim, 'flight', 'flight', { launched: memGet(sim, 'flightLaunched'), mated: ev.nFounded, daughters: ev.nFounded });
      break;
    case 'rival-destroyed':
      if (!isPlayerColonyId(sim, ev.colonyId)) sim.state.progression.rivalsDefeated++;
      break;
    case 'colony.extinct':
      if (isPlayerColonyId(sim, ev.colonyId)) gameOver(sim, ev.causeChain);
      break;
    case 'human.start':
      addJournal(sim, 'event', `event.human.${ev.kind}`, {});
      break;
    case 'flood-started':
      if (playerNests(sim).some((n) => n.id === ev.nestId)) addJournal(sim, 'event', 'event.flood', {});
      break;
    case 'rival-raid-started':
      if (isPlayerColonyId(sim, ev.target)) addJournal(sim, 'event', 'event.raid', { n: ev.partySize });
      break;
    default:
      break;
  }
}

function antFocus(sim: Sim, antId: number): TargetRef | null {
  const a = sim.stores.ants.get(antId);
  return a ? { kind: 'ant', id: a.id, pos: { ...a.pos } } : null;
}

function gameOver(sim: Sim, chain: string[]): void {
  const p = sim.state.progression;
  if (p.gameOver) return;
  p.gameOver = true;
  p.finalCauses = chain.length > 0 ? [...chain] : worstCauseChain(sim);
  logEvent(sim, 'game-over', 'critical', 'colony.extinct', { cause: p.finalCauses[0] ?? 'unknown' });
}

/** Season note (journal kind `season`): tokens {workers} {brood} {c} {p} {weather} (weather = state id). */
function seasonEntry(sim: Sim): void {
  const col = playerColony(sim);
  if (!col) return;
  const eng = engineOf(sim);
  const sw = eng.seasonWeather;
  const weather = Object.keys(sw).sort((a, b) => sw[b] - sw[a] || a.localeCompare(b))[0] ?? sim.state.env.weather.state;
  let brood = 0;
  for (const b of sim.stores.brood.list) if (b.alive && b.colony === col.id) brood++;
  const idx = seasonIndexOf(calendarTick(sim.state), sim.state.config);
  addJournal(sim, 'season', `season.${idx}`, {
    workers: censusOf(sim).workers, brood, c: Math.round(col.stores.c * 10) / 10, p: Math.round(col.stores.p * 10) / 10, weather,
  });
  eng.seasonWeather = {};
}

/** First rain, storm, heat spell and frost of each season (journal kind `weather`). */
function weatherEntry(sim: Sim, to: string): void {
  if (!WEATHER_FIRSTS.has(to)) return;
  const key = `${currentYear(sim.state)}:${seasonIndexOf(calendarTick(sim.state), sim.state.config)}:${to}`;
  const seen = engineOf(sim).weatherSeen;
  if (seen[key] !== undefined) return;
  // keep only this season's marks
  for (const k of Object.keys(seen)) if (!k.startsWith(key.slice(0, key.lastIndexOf(':') + 1))) delete seen[k];
  seen[key] = sim.state.tick;
  addJournal(sim, 'weather', `weather.${to}`, {});
}

/** Winter Report entry: tokens {n} {cold} {starvation} {c} {p} from the report numbers (missing keys are 0). */
function winterReportEntry(sim: Sim, report: Record<string, number>): void {
  const r = (k: string): number => (Number.isFinite(report[k]) ? report[k] : 0);
  addJournal(sim, 'winter-report', 'winter-report', {
    n: r('workersLost'), cold: r('cold'), starvation: r('starvation'), c: r('storesUsedC'), p: r('storesUsedP'),
  });
}
