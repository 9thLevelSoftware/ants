// Rearing alates (GDD 06 §11.1-§11.4): at each local midnight inside the lay window the gate is evaluated and the
// window's quota `A*` is set; the queen's next eggs become sexual-destined until the quota is used (sex by the gyne
// share); while stores fall below half of the gate's covers no new sexual eggs are designated. A sexual larva that
// reaches the pupal checkpoint with less than REPRO_DEMOTE_RATIO of its nutrition becomes a worker (the cost is
// booked as shortfall). Eclosed alates are callow for ALATE_CALLOW_GD, then wait for a flight day; leftovers are
// evicted ALATE_EXPIRE_GD after the flight window closes (workers recover part of their protein).
//
// The colony's laying is not touched: designation re-destines eggs the queen laid (the brood module's own egg
// record), which is the hook GDD 02's queen leaves for the reproduction module.

import type { Ant, Brood, Colony, Sim, SpeciesDef } from '@/sim/types';
import { BroodFlag } from '@/sim/types';
import { killAnt } from '@/sim/entities';
import {
  ALATE_CALLOW_GD, ALATE_EXPIRE_GD, ALATE_EXPIRE_P_RECOVERY, ALATE_P_SHARE, REPRO_DEMOTE_RATIO, REPRO_STOP_FRAC,
} from '@/sim/balance/lifecycle';
import { calendarTick, currentYear, dayOf, daysToTicks, defaultYearDay } from '@/sim/time';
import { deposit } from '../stores';
import { larvaFood } from '../life';
import { raiseLifecycleAlert } from '../succession/alerts';
import { lifecycleOf } from '../succession/lifecycleState';
import { alateCost, alateTarget, failingGates, gateFacts } from './gate';

/** Evaluates the gate once per day (local midnight) and opens the window's quota. */
export function evaluateRearing(sim: Sim, col: Colony, def: SpeciesDef): void {
  const s = sim.state;
  const book = lifecycleOf(col).repro;
  const day = dayOf(calendarTick(s));
  if (book.gateDay === day) return;
  book.gateDay = day;
  const facts = gateFacts(sim, col, def);
  const fails = failingGates(def, facts, s.config.difficulty.params.matureGateMult);
  book.gateFails = fails;
  const year = currentYear(s);
  if (fails.length === 0 && book.windowYear !== year) {
    const t = alateTarget(def, facts.workers, facts.investment, s.config.difficulty.params.alateCapMult, col.directives.gyneShare);
    book.windowYear = year;
    book.quotaGynes = t.gynes;
    book.quotaMales = t.males;
    book.designatedGynes = 0;
    book.designatedMales = 0;
    book.scanTick = s.tick;
    col.repro.targetAlates = t.total;
    col.repro.alateRearing = t.total;
  }
  if (!facts.inLayWindow || !facts.queenAlive) col.repro.alateRearing = 0;
}

/** Re-destines new eggs of the queen to the window's sexual quota (while stores hold above half the covers). */
export function designateEggs(sim: Sim, col: Colony, def: SpeciesDef): void {
  const s = sim.state;
  const book = lifecycleOf(col).repro;
  if (col.repro.alateRearing <= 0 || book.quotaGynes + book.quotaMales <= 0) return;
  const facts = gateFacts(sim, col, def);
  if (failingGates(def, facts, s.config.difficulty.params.matureGateMult, REPRO_STOP_FRAC).includes('gate-stores')) return;
  const share = col.directives.gyneShare > 0 ? col.directives.gyneShare : def.reproduction.reproGyneShare;
  for (const b of s.brood) {
    if (!b.alive || b.colony !== col.id || b.stage !== 'egg' || b.destined !== 'worker' || b.laidTick < book.scanTick) continue;
    if (b.flags & (BroodFlag.FIRST_BROOD | BroodFlag.WORKER_LAID)) continue;
    const done = book.designatedGynes + book.designatedMales;
    const wantGyne = book.quotaGynes > 0 && (book.quotaMales <= 0 || book.designatedGynes < share * (done + 1));
    if (wantGyne) { b.destined = 'gyne'; book.quotaGynes--; book.designatedGynes++; }
    else if (book.quotaMales > 0) { b.destined = 'male'; book.quotaMales--; book.designatedMales++; }
    if (book.quotaGynes + book.quotaMales <= 0) break;
  }
  book.scanTick = s.tick;
}

/** Pupal checkpoint of a sexual larva (from the `brood-stage` larva -> pupa event). */
export function checkDemotion(sim: Sim, b: Brood): void {
  if (b.destined !== 'gyne' && b.destined !== 'male') return;
  const col = sim.stores.colonies.get(b.colony);
  const def = col ? sim.getSpecies(col.species) : undefined;
  if (!col || !def) return;
  const need = larvaFood(def, b.destined, b.destinedLengthBu);
  const ratio = (b.fedC + b.fedP) / Math.max(1e-9, need.c + need.p);
  if (ratio >= REPRO_DEMOTE_RATIO) return;
  const book = lifecycleOf(col).repro;
  book.demoted++;
  book.shortfallLoads += b.fedC + b.fedP;
  col.repro.shortfall += b.fedC + b.fedP;
  b.destined = 'worker';
}

/** An alate eclosed: counted, callow until it matures. */
export function onAlateEclosed(sim: Sim, a: Ant): void {
  const col = sim.stores.colonies.get(a.colony);
  if (!col || !a.alate) return;
  lifecycleOf(col).repro.alatesReared++;
  a.alate.state = 'callow-alate';
}

/** Callow alates mature into `waiting`. */
export function matureAlates(sim: Sim, col: Colony): void {
  const t = sim.state.tick, callow = daysToTicks(ALATE_CALLOW_GD);
  let matured = 0;
  for (const a of sim.state.ants) {
    if (a.alive && a.colony === col.id && a.alate?.state === 'callow-alate' && t - a.bornTick >= callow) { a.alate.state = 'waiting'; matured++; }
  }
  if (matured > 0) raiseLifecycleAlert(sim, col, 'alates-ready', { n: waitingAlates(sim, col).length });
}

/** Waiting alates of a colony. */
export function waitingAlates(sim: Sim, col: Colony): Ant[] {
  return sim.state.ants.filter((a) => a.alive && a.colony === col.id && a.alate !== null && a.alate.state === 'waiting');
}

/** Leftover alates are evicted ALATE_EXPIRE_GD after the flight window (species that do not overwinter them). */
export function expireAlates(sim: Sim, col: Colony, def: SpeciesDef): void {
  if (def.reproduction.alatesOverwinter) return;
  const s = sim.state;
  const book = lifecycleOf(col).repro;
  const year = currentYear(s);
  if (book.expiredYear >= year) return;
  const d28 = defaultYearDay(calendarTick(s), s.config);
  if (d28 < def.reproduction.alateFlightWindow[1] + ALATE_EXPIRE_GD) return;
  book.expiredYear = year;
  let p = 0;
  for (const a of s.ants) {
    if (!a.alive || a.colony !== col.id || !a.alate || a.alate.state === 'flying') continue;
    const caste = a.caste === 'gyne' ? 'gyne' : 'male';
    p += ALATE_EXPIRE_P_RECOVERY * ALATE_P_SHARE * alateCost(def, caste);
    killAnt(sim, a.id, 'old-age');
  }
  if (p > 0) deposit(col, 0, p, 0, 'recycled');
}
