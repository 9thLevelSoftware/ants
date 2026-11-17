// The nuptial flight (GDD 06 §11.5-§11.6, §12): the daily launch roll at the launch hour, the launch (alates
// assemble for FLIGHT_ASSEMBLY_GD), take-off with the aggregate resolution of every gyne the player does not fly,
// and the flight record and its daughters (copied into the device Lineage by the game layer).

import { hash3u } from '@/core/math/noise';
import { hashString, rngFloat, type RngState } from '@/core/rng';
import type { Colony, DaughterRecord, FlightRecord, Sim, SpeciesDef, ZoneType } from '@/sim/types';
import { killAnt } from '@/sim/entities';
import { difficultyValue } from '@/sim/balance/difficulty';
import { airTemp } from '@/sim/environment';
import { calendarTick, currentHour, dayOf, daysToTicks, TICKS_PER_DAY, TICKS_PER_HOUR } from '@/sim/time';
import {
  FLIGHT_ASSEMBLY_GD, FLIGHT_BIRD_DENSITY, FLIGHT_BIRD_LOSS, FLIGHT_MALE_RATIO_MIN, FLIGHT_ROLL_LEAD_H,
  FLIGHT_WIND_AIR_MS, FLIGHT_WIND_AIR_MULT, LIN_MAX_DAUGHTERS_PER_FLIGHT,
} from '@/sim/balance/lifecycle';
import { inDefaultYearWindow } from '@/sim/time';
import { bookFlown, lifecycleOf, stampNow } from '../succession/lifecycleState';
import { clearLifecycleAlert, raiseLifecycleAlert } from '../succession/alerts';
import { launchChance, type FlightWeather, type LaunchChance } from './flightDay';
import { waitingAlates } from './rearing';

/** The weather facts of the flight roll now. */
export function flightWeather(sim: Sim): FlightWeather {
  const w = sim.state.env.weather;
  const last = w.history.lastRainEndTick;
  return {
    tAir: airTemp(sim), wind2m: w.wind2m, state: w.state,
    rainEndedAgoGd: last < 0 ? Infinity : (sim.state.tick - last) / TICKS_PER_DAY,
    tmaxToday: w.history.tmaxToday, tmaxYesterday: w.history.tmaxYesterday,
  };
}

/** True inside the species' flight window and at or after the roll hour (launch hour start - 0.5 h). */
export function rollDue(sim: Sim, def: SpeciesDef): boolean {
  const s = sim.state;
  const win = def.reproduction.alateFlightWindow;
  if (!inDefaultYearWindow(calendarTick(s), s.config, win[0], win[1])) return false;
  const h = currentHour(s);
  return h >= def.reproduction.launchHours[0] - FLIGHT_ROLL_LEAD_H && h < def.reproduction.launchHours[1];
}

/**
 * The day is a valid flight day right now (GDD 06 §11.5): inside the flight window and the roll / launch hours, and
 * the hard weather gates hold. Every launch except the debug cheat goes through this.
 */
export function flightDayValid(sim: Sim, def: SpeciesDef): boolean {
  return rollDue(sim, def) && launchChance(def, flightWeather(sim)).p > 0;
}

/** Ticks from now to today's launch hour start (0 when it has begun). */
function ticksToLaunchHour(sim: Sim, def: SpeciesDef): number {
  return Math.max(0, Math.ceil((def.reproduction.launchHours[0] - currentHour(sim.state)) * TICKS_PER_HOUR));
}

/** The `ask` offer is open: offered today and the day is still valid (it lapses with the hours, rain or wind). */
export function askOpen(sim: Sim, col: Colony, def: SpeciesDef): boolean {
  const book = lifecycleOf(col).repro;
  if (book.askTick < 0 || book.openFlightId !== '') return false;
  return book.rollDay === dayOf(calendarTick(sim.state)) && flightDayValid(sim, def);
}

/** The day's roll (once per day while alates wait); returns the chance, or null when no roll happened. */
export function rollFlightDay(sim: Sim, col: Colony, def: SpeciesDef): LaunchChance | null {
  const book = lifecycleOf(col).repro;
  const day = dayOf(calendarTick(sim.state));
  if (book.rollDay === day || book.openFlightId !== '' || !rollDue(sim, def)) return null;
  if (waitingAlates(sim, col).length === 0) return null;
  book.rollDay = day;
  const ch = launchChance(def, flightWeather(sim));
  book.lastP = ch.p;
  if (ch.p > 0) {
    sim.emit({ type: 'flight.eligible', p: ch.p, factors: ch.factors });
    raiseLifecycleAlert(sim, col, 'flight-weather', {});
  }
  const policy = col.directives.alatePolicy;
  if (ch.p <= 0 || policy === 'hold') return ch;
  if (policy === 'ask') { book.askTick = sim.state.tick; return ch; }
  if (rngFloat(sim.stream('rng.repro')) < ch.p) book.launchAtTick = sim.state.tick + ticksToLaunchHour(sim, def);
  return ch;
}

/**
 * Per slow tick: an open `ask` offer lapses when the day stops being valid; a rolled auto-release launches at the
 * launch hour start if the day is still valid then, and is dropped otherwise.
 */
export function updateFlightOffers(sim: Sim, col: Colony, def: SpeciesDef): void {
  const book = lifecycleOf(col).repro;
  if (book.rollDay >= 0 && !flightDayValid(sim, def)) clearLifecycleAlert(sim, col, 'flight-weather');
  if (book.askTick >= 0 && !askOpen(sim, col, def)) book.askTick = -1;
  const at = book.launchAtTick ?? -1;
  if (at < 0 || sim.state.tick < at) return;
  book.launchAtTick = -1;
  if (book.rollDay === dayOf(calendarTick(sim.state)) && flightDayValid(sim, def)) launchFlight(sim, col);
}

/**
 * Flight id, unique in the device Lineage: the colony's Lineage record id (unique per game, set by the game layer when
 * the game starts) and the flight's number. A replay of the same locality is a new colony record, so its flights get
 * new ids. Without a record id (headless runs) the world seed and calendar anchor stand in.
 */
export function flightIdOf(sim: Sim, seq: number): string {
  const rec = sim.state.progression.lineage.colonyRecordId;
  if (rec) return `${rec}-f${seq}`;
  return `f${(sim.state.config.world.seed >>> 0).toString(36)}-${sim.state.env.calendar.startTick.toString(36)}-${seq}`;
}

/** Launch: the waiting alates assemble; take-off after FLIGHT_ASSEMBLY_GD. */
export function launchFlight(sim: Sim, col: Colony): boolean {
  const book = lifecycleOf(col).repro;
  if (book.openFlightId !== '') return false;
  const alates = waitingAlates(sim, col);
  if (alates.length === 0) return false;
  for (const a of alates) a.alate!.state = 'assembling';
  clearLifecycleAlert(sim, col, 'flight-weather');
  clearLifecycleAlert(sim, col, 'alates-ready');
  const nGynes = alates.filter((a) => a.caste === 'gyne').length;
  const nMales = alates.length - nGynes;
  book.flightSeq++;
  book.askTick = -1;
  book.launchAtTick = -1;
  book.assemblyUntil = sim.state.tick + daysToTicks(FLIGHT_ASSEMBLY_GD);
  const id = flightIdOf(sim, book.flightSeq);
  book.openFlightId = id;
  book.openFounded = 0;
  const w = sim.state.env.weather;
  const rec: FlightRecord = {
    id, tick: sim.state.tick, date: stampNow(sim), weather: `${w.state} ${Math.round(airTemp(sim))}C ${w.wind2m.toFixed(1)}m/s`,
    nGynes, nMales, nLaunched: 0, nMated: 0, flightDeaths: 0, flightDeathsByCause: {}, nLanded: 0, nFounded: 0, landingZones: [], possessed: false,
    daughterIds: [],
  };
  lifecycleOf(col).flights.push(rec);
  col.repro.lastLaunchTick = sim.state.tick;
  col.repro.flights.push(id);
  sim.emit({ type: 'flight.launched', id: book.flightSeq, nGynes, nMales, weather: w.state });
  return true;
}

/** The open flight's record. */
export function openRecord(col: Colony): FlightRecord | undefined {
  const life = lifecycleOf(col);
  return life.repro.openFlightId ? life.flights.find((f) => f.id === life.repro.openFlightId) : undefined;
}

function binomial(rng: RngState, n: number, p: number): number {
  let k = 0;
  for (let i = 0; i < n; i++) if (rngFloat(rng) < p) k++;
  return k;
}

/** Aggregate probabilities of the flight (GDD 06 §11.6). */
export function flightOdds(sim: Sim, def: SpeciesDef, nGynes: number, nMales: number): { pAir: number; pMate: number; pFound: number } {
  const wind = sim.state.env.weather.wind2m;
  const lossMult = difficultyValue(sim, 'flightLossMult');
  const pAir = (def.reproduction.pAir * (wind > FLIGHT_WIND_AIR_MS ? FLIGHT_WIND_AIR_MULT : 1) * (1 - FLIGHT_BIRD_LOSS * FLIGHT_BIRD_DENSITY)) / lossMult;
  const ratio = nGynes > 0 ? Math.min(1, Math.max(FLIGHT_MALE_RATIO_MIN, nMales / nGynes)) : 1;
  return { pAir: Math.min(1, pAir), pMate: def.reproduction.pMate * ratio, pFound: def.reproduction.pFound };
}

/**
 * Take-off: every assembling alate leaves; the gynes the player does not fly are resolved by the aggregate model.
 * `keepGyneId` (the possessed gyne) stays for her own flight.
 */
export function takeOff(sim: Sim, col: Colony, def: SpeciesDef, keepGyneId: number): void {
  const rec = openRecord(col);
  const book = lifecycleOf(col).repro;
  book.assemblyUntil = -1;
  if (!rec) return;
  const leaving = sim.state.ants.filter((a) => a.alive && a.colony === col.id && a.alate?.state === 'assembling' && a.id !== keepGyneId);
  const gynes = leaving.filter((a) => a.caste === 'gyne');
  const males = leaving.length - gynes.length;
  const nAll = gynes.length + (keepGyneId >= 0 ? 1 : 0);
  const odds = flightOdds(sim, def, nAll, males);
  const rng = sim.stream('rng.repro');
  const survived = binomial(rng, gynes.length, odds.pAir);
  const mated = binomial(rng, survived, odds.pMate);
  const founded = binomial(rng, mated, odds.pFound);
  rec.nLaunched += leaving.length;
  rec.nMated += mated;
  rec.flightDeaths += gynes.length - survived;
  addCause(rec, 'predation', gynes.length - survived); // birds and other aerial losses of the aggregate model
  addCause(rec, 'old-age', males); // males die soon after the flight (booked under role male, not as workers)
  rec.nLanded += survived;
  book.openFounded += founded;
  book.alatesFlown += leaving.length;
  for (const a of leaving) {
    // the alates leave the colony: removed from the sim, kept apart from the colony's causes of death
    const cause = a.caste === 'gyne' ? 'dispersed' : 'old-age';
    bookFlown(sim, col, cause);
    killAnt(sim, a.id, cause);
  }
}

/** Adds `n` losses of `cause` to a flight record. */
export function addCause(rec: FlightRecord, cause: string, n: number): void {
  if (n <= 0) return;
  const by = (rec.flightDeathsByCause ??= {});
  by[cause] = (by[cause] ?? 0) + n;
}

/** Ends the open flight: daughters recorded, `flight.ended` and `lineage.daughter-added` events. */
export function endFlight(sim: Sim, col: Colony, def: SpeciesDef, witnessed: { founded: boolean; zone: ZoneType | null } | null): void {
  const life = lifecycleOf(col);
  const rec = openRecord(col);
  if (!rec) return;
  const book = life.repro;
  const total = book.openFounded + (witnessed?.founded ? 1 : 0);
  rec.nFounded = total;
  const link = sim.state.progression.lineage;
  const stored = Math.min(total, LIN_MAX_DAUGHTERS_PER_FLIGHT);
  const zone = witnessed?.zone ?? null;
  for (let i = 0; i < stored; i++) {
    const own = witnessed?.founded === true && i === 0;
    const d: DaughterRecord = {
      id: `${rec.id}-d${i}`, motherColonyId: link.colonyRecordId, flightId: rec.id, species: def.id,
      generation: link.generation + 1, seed: daughterSeed(sim.state.config.world.seed, rec.id, i),
      archetypeHint: sim.state.config.world.archetype, witnessed: own, landingZone: own ? zone : null,
      doy: rec.date.doy, state: 'available',
    };
    life.daughters.push(d);
    rec.daughterIds.push(d.id);
  }
  if (zone) rec.landingZones.push(zone);
  book.flights++;
  book.daughtersFounded += total;
  book.openFlightId = '';
  book.openFounded = 0;
  sim.emit({ type: 'flight.ended', id: book.flightSeq, nFounded: total });
  for (const id of rec.daughterIds) sim.emit({ type: 'lineage.daughter-added', daughterId: id });
}

/** World seed of a daughter's locality: `hash32(motherWorldSeed, flightId, daughterIndex)` (GDD 06 §12.3). */
export function daughterSeed(motherSeed: number, flightId: string, index: number): number {
  return hash3u(motherSeed >>> 0, hashString(flightId), index) >>> 0;
}
