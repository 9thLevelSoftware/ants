// `diag-nest-flood:<nestId>` (GDD 03 App. D with GDD 06's forecast factor folded in) and the founding-chamber alert.
// Status (ruling, task weather-fix2 item 7: GDD 03 §11.3 wants the critical `nest-flooding` alert only while a brood or
// royal chamber is >= 25 % flooded, and the diagnostics registry raises that alert on `warn` as well as on `bad`, so
// this diagnostic never publishes `warn`):
//   bad   a brood, royal or founding chamber is >= 25 % flooded (GDD 03 §11.3 alert rule)
//   info  some water stands in a chamber (any share, any type), or the reference storm would flood a brood / royal /
//         founding chamber >= 25 % (a predicted flood: a note with its remedies)
//   ok    otherwise
// A founding nest (sealed cell, no workers) also raises `founding-flooding` while its cell takes water, and the player's
// queen raises `queen-in-danger` ("rising water") from the first second she is under water (50 s before her health
// starts to fall, GDD 03 §11.3) for as long as she is under water (the card is shared with combat's queen alert: it is
// raised again if combat clears it, and left to combat when she dries while combat still holds it), so a queen is
// never drowned silently, also in a sump below the 25 % chamber share. Combat's side of the shared card is asked through
// combatHoldsQueenAlert (combat keeps the card while she is under water, task nest-fix3 item 5).
// The possessed ant (never moved by the flee-water rule) raises `possessed-danger` ("Under water") while submerged.

import type { Chamber, Diagnostic, DiagnosticFactor, Nest, Sim } from '@/sim/types';
import {
  FLOOD_ALERT_FRACTION, FLOOD_ANT_SUB_KEY, FLOOD_RIM_MIN, FLOOD_WORD_CATCHMENT_BANDS, FLOOD_WORD_RIM_BANDS,
} from '@/sim/balance/weather';
import { clearAlert, raiseAlert } from '@/sim/progression/alerts';
import { combatHoldsQueenAlert } from '@/sim/combat/alerts';
import { publishDiagnostic } from '@/sim/progression/diagnostics';
import { moistureAt } from '../substrate';
import { entranceInflow } from './inflow';
import type { FloodPrediction } from './predict';

const BROOD_TYPES = new Set(['nursery', 'royal', 'founding']);
const CHAMBER_WORD: Record<string, string> = { nursery: 'Nursery', royal: 'Royal chamber', founding: "Queen's chamber" };

function rainSoon(sim: Sim): boolean {
  const w = sim.state.env.weather;
  if (w.state === 'rain' || w.state === 'storm') return true;
  const f = w.forecast?.state;
  return f === 'rain' || f === 'storm';
}

/** The entrance's rim, in plain words (rim factor 1 = no rim, FLOOD_RIM_MIN = a full one). */
export function rimWords(rim: number): string {
  if (rim >= FLOOD_WORD_RIM_BANDS[0]) return 'no crater rim around the entrance';
  if (rim >= FLOOD_WORD_RIM_BANDS[1]) return 'a low crater rim around the entrance';
  return 'a crater rim keeps most rain out';
}

/** Where rain runs off to, in plain words (catchment 1 = flat ground, more = run-off from higher ground). */
export function catchmentWords(catchment: number, covered: boolean): string {
  const [hollow, slope, above] = FLOOD_WORD_CATCHMENT_BANDS;
  const w = catchment >= hollow ? 'the entrance lies in a hollow that rain runs into'
    : catchment >= slope ? 'the ground slopes down to the entrance'
      : catchment < above ? 'the entrance sits above the ground around it' : 'flat ground around the entrance';
  return covered ? `${w}, under cover` : w;
}

function factor(cause: string, weight: number, detail: string): DiagnosticFactor {
  return { cause, weight: Math.max(0, weight), detail, diagId: null };
}

/** The diagnostic record of one nest's flood state and risk. */
export function floodDiagnostic(sim: Sim, nest: Nest, pred: FloodPrediction | null): Diagnostic {
  let worstNow = 0, worstPred = 0, worstAny = 0, lowName = '', nowName = '';
  for (const c of nest.chambers) {
    if (c.flooded > worstAny) worstAny = c.flooded;
    if (!BROOD_TYPES.has(c.type)) continue;
    if (c.flooded > worstNow) { worstNow = c.flooded; nowName = c.type; }
    const p = pred?.chambers.get(c.id) ?? c.floodRisk;
    if (p > worstPred) { worstPred = p; lowName = c.type; }
  }
  const status: Diagnostic['status'] = worstNow >= FLOOD_ALERT_FRACTION ? 'bad'
    : worstAny > 0 || worstPred >= FLOOD_ALERT_FRACTION ? 'info' : 'ok';
  // limiting factors from the entrance with the largest reference-storm inflow
  let best = null as ReturnType<typeof entranceInflow> | null;
  for (const e of nest.entrances) {
    const f = entranceInflow(sim, e, 1, nest);
    if (!best || f.q > best.q) best = f;
  }
  const m = moistureAt(sim, nest.origin);
  const factors: DiagnosticFactor[] = [];
  if (best) {
    // plain words: a factor's detail becomes the alert's cause line (gate S17)
    factors.push(factor('exposed-entrance', (best.catchment / 4) * best.cover, catchmentWords(best.catchment, best.cover < 1)));
    factors.push(factor('low-rim', (best.rim - FLOOD_RIM_MIN) / (1 - FLOOD_RIM_MIN), rimWords(best.rim)));
  }
  const lowWord = (CHAMBER_WORD[lowName] ?? lowName).toLowerCase();
  factors.push(factor('low-brood-chamber', worstPred,
    lowName ? `the ${lowWord} would be ${Math.round(worstPred * 100)} % under water in a heavy storm` : 'no brood chamber at risk'));
  factors.push(factor('soil-saturation', m, `soil moisture ${Math.round(m * 100)} %`));
  factors.push(factor('rain-forecast', rainSoon(sim) ? 0.5 : 0, rainSoon(sim) ? 'rain now or next' : 'no rain forecast'));
  // the card names the chamber it is about (gate-close-app: a generic name read as the founding card after the opening)
  const label = status === 'bad' ? `${CHAMBER_WORD[nowName] ?? 'Nest'} flooding`
    : status === 'info' ? (worstAny >= FLOOD_ALERT_FRACTION ? 'Water in the nest' : worstAny > 0 ? 'A little water in the nest' : 'Nest at risk of flooding')
      : 'Nest drains well';
  return {
    id: `diag-nest-flood:${nest.id}`, system: 'nest', status, label, value: Math.max(worstNow, worstPred), factors,
    remedies: status === 'ok' ? [] : ['remedy.marker.entrance', 'remedy.marker.move-brood', 'remedy.dig.drain-chamber'],
    sinceTick: -1, focus: { kind: 'nest', id: nest.id, pos: { ...nest.origin } },
  };
}

/** Publishes the flood diagnostic of a player-colony nest. */
export function publishFloodDiagnostic(sim: Sim, nest: Nest, pred: FloodPrediction | null): Diagnostic {
  const d = floodDiagnostic(sim, nest, pred);
  publishDiagnostic(sim, d);
  return d;
}

/**
 * Raises or clears `founding-flooding` for a founding nest whose cell takes water. Only during the opening: once the
 * nest is reopening (hand-over) the card goes and `diag-nest-flood` names the chamber. A periodic re-raise of a card
 * that is up is the same condition, not a repeat: it updates the share in place without counting up.
 */
export function foundingFloodAlert(sim: Sim, nest: Nest): void {
  if (!nest.founding) return;
  let share = 0;
  for (const c of nest.chambers) share = Math.max(share, c.flooded);
  const opening = nest.founding.state !== 'reopening' && nest.founding.state !== 'established';
  if (share <= 0 || !opening) {
    clearAlert(sim, 'founding-flooding', nest.id);
    return;
  }
  const colony = sim.stores.colonies.get(nest.colony);
  const queen = colony ? sim.stores.ants.get(colony.queenId) : undefined;
  const pct = Math.round(share * 100);
  const card = sim.state.progression.alerts.find((a) => a.kind === 'founding-flooding' && a.subjectId === nest.id);
  if (card) {
    if (card.tokens?.pct === pct) return;
    card.tokens = { pct };
    card.updatedTick = sim.state.tick;
    sim.emit({ type: 'alert', op: 'update', alert: { ...card, tokens: { pct }, focus: card.focus ? { ...card.focus, pos: { ...card.focus.pos } } : null } });
    return;
  }
  raiseAlert(sim, {
    kind: 'founding-flooding', level: 'critical', subjectId: nest.id, title: '', cause: '',
    focus: queen ? { kind: 'ant', id: queen.id, pos: { ...queen.pos } } : { kind: 'nest', id: nest.id, pos: { ...nest.origin } },
    diagnosticId: `diag-nest-flood:${nest.id}`, tokens: { pct },
  });
}

/** The ant's chamber record, or (no chamber id yet) the chamber whose ellipsoid holds the point. */
function chamberAround(sim: Sim, nestId: number, chamberId: number, p: { x: number; y: number; z: number }): Chamber | undefined {
  const nest = sim.stores.nests.get(nestId);
  if (!nest) return undefined;
  if (chamberId >= 0) return nest.chambers.find((c) => c.id === chamberId);
  return nest.chambers.find((c) => ((p.x - c.center.x) / c.radii.x) ** 2 + ((p.y - c.center.y) / c.radii.y) ** 2 + ((p.z - c.center.z) / c.radii.z) ** 2 <= 1);
}

/** ant.bb flag: the queen's submersion wants `queen-in-danger` up (persisted, so a load sees it too). */
const QUEEN_ALERT_KEY = 'wx.qAlert';

const WATER_ATTACKER = 'rising water';

function queenAlert(sim: Sim, queenId: number) {
  return sim.state.progression.alerts.find((a) => a.kind === 'queen-in-danger' && a.subjectId === queenId);
}

/**
 * Keeps `queen-in-danger` up while the player's queen is under water, decided on the alert list itself: raised
 * whenever she is submerged and the card is not active (her first second under water, or combat cleared the shared
 * card meanwhile), never overwriting combat's card; cleared once she is dry (or dead) unless combat still holds it.
 */
export function queenFloodAlert(sim: Sim): void {
  const col = sim.state.colonies[0];
  const q = col ? sim.stores.ants.get(col.queenId) : undefined;
  if (!q) return;
  const under = q.alive && (q.bb[FLOOD_ANT_SUB_KEY] ?? 0) > 0;
  if (under) {
    q.bb[QUEEN_ALERT_KEY] = 1;
    const card = queenAlert(sim, q.id);
    // the shared card is up: combat's while combat holds it, else it must say why (the water) -> updated below
    if (card && (combatHoldsQueenAlert(q) || card.tokens?.attacker === WATER_ATTACKER)) return;
    const ch = chamberAround(sim, q.nestId, q.chamberId, q.pos);
    raiseAlert(sim, {
      kind: 'queen-in-danger', level: 'critical', subjectId: q.id, title: '', cause: '',
      focus: { kind: 'ant', id: q.id, pos: { ...q.pos } }, diagnosticId: q.nestId >= 0 ? `diag-nest-flood:${q.nestId}` : null,
      tokens: { attacker: WATER_ATTACKER, where: ch ? `${ch.type} chamber` : 'the nest' },
    });
  } else if (q.bb[QUEEN_ALERT_KEY] === 1) {
    delete q.bb[QUEEN_ALERT_KEY];
    if (!combatHoldsQueenAlert(q)) clearAlert(sim, 'queen-in-danger', q.id);
  }
}

/** ant.bb flag: the flood's `possessed-danger` card was raised for this ant and not yet cleared (persisted). */
const POSSESSED_ALERT_KEY = 'wx.pAlert';
const WATER_CAUSE = 'under-water';

/**
 * The possessed ant is never moved out of the water by the flee rule (task nest-fix3): while she is submerged the
 * player gets `possessed-danger` ("Under water", find dry ground) from her first second under water, 50 s before her
 * health starts to fall; cleared once she is dry, released or dead. The queen has her own card (queenFloodAlert).
 * The card is shared (kind + subject) with combat's "Pinned": decided on the alert list itself, as for the queen, so
 * a card combat raised is never overwritten and a card combat cleared is raised again while she is still under water.
 * Level critical (GDD 08 §6.5 `possessed-danger`, "drowning"): no re-raise cooldown after combat's clear.
 */
export function possessedFloodAlert(sim: Sim): void {
  const id = sim.state.player.possessedAntId;
  const p = id >= 0 ? sim.stores.ants.get(id) : undefined;
  if (p && p.alive && p.caste !== 'queen' && (p.bb[FLOOD_ANT_SUB_KEY] ?? 0) > 0) {
    p.bb[POSSESSED_ALERT_KEY] = 1;
    if (possessedAlert(sim, p.id)) return; // ours, or combat's (pinned): left as it is
    raiseAlert(sim, {
      kind: 'possessed-danger', level: 'critical', subjectId: p.id, title: 'Under water', cause: WATER_CAUSE,
      focus: { kind: 'ant', id: p.id, pos: { ...p.pos } }, diagnosticId: p.nestId >= 0 ? `diag-nest-flood:${p.nestId}` : null,
      tokens: { cause: 'climb to dry ground' },
    });
    return;
  }
  if (p && p.bb[POSSESSED_ALERT_KEY] === 1) delete p.bb[POSSESSED_ALERT_KEY];
  // clear any water card whose ant is dry, released or dead
  const alerts = sim.state.progression.alerts;
  for (let i = alerts.length - 1; i >= 0; i--) {
    const al = alerts[i];
    if (al.kind !== 'possessed-danger' || al.cause !== WATER_CAUSE) continue;
    const a = sim.stores.ants.get(al.subjectId);
    if (a && a.alive && a.id === id && (a.bb[FLOOD_ANT_SUB_KEY] ?? 0) > 0) continue;
    if (a) delete a.bb[POSSESSED_ALERT_KEY];
    clearAlert(sim, 'possessed-danger', al.subjectId);
  }
}

function possessedAlert(sim: Sim, antId: number) {
  return sim.state.progression.alerts.find((a) => a.kind === 'possessed-danger' && a.subjectId === antId);
}
