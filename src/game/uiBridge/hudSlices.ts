// The HUD's slices of the snapshot: date and weather, colony pulse, the possessed ant, the context prompt and the
// alerts. Pure reads of the simulation; every function returns fresh plain data (sharing with the previous snapshot
// is done by the builder). Allocation-light: one pass over the ants for the colony pulse.
import { tsAt, tsToArray } from '@/core/timeSeries';
import type { Ant, Colony, Sim, Task } from '@/sim/types';
import { AntFlag, REASON_CODES } from '@/sim/types';
import { promptView } from '@/sim/ants/player';
import { daysOfStock } from '@/sim/colony';
import { activeAlerts, queenHandedOver } from '@/sim/progression';
import { alertText } from '@/content/text';
import { GROUP_TASKS } from '@/sim/colony/allocation';
import { airTemp, calendarNow } from '@/sim/environment';
import { currentDayOfSeason, currentHour, currentSeason, currentYear, seasonLength } from '@/sim/time';
import type { UiAlert, UiColony, UiPossessed, UiPrompt, UiPromptLine, UiTime } from '@/ui/api';
import { HEAT_STRESS_LOAD, SPARK_SAMPLES, TREND_WINDOW_GAME_H } from './balance';
import { antName, stateWord, WEATHER_WORDS } from './words';

const cap = (s: string): string => (s.length ? s[0].toUpperCase() + s.slice(1) : s);

export function timeOf(sim: Sim): UiTime {
  const s = sim.state;
  const hourF = currentHour(s);
  const hour = Math.floor(hourF);
  const minute = Math.floor((hourF - hour) * 60);
  const season = currentSeason(s);
  const day = currentDayOfSeason(s);
  const hh = String(hour).padStart(2, '0'), mm = String(minute).padStart(2, '0');
  const cal = calendarNow(sim);
  const w = s.env.weather;
  return {
    tick: s.tick, year: currentYear(s), season, dayOfSeason: day, hour, minute, label: `${cap(season)} · Day ${day} · ${hh}:${mm}`,
    weather: { state: w.state, word: WEATHER_WORDS[w.state] ?? cap(w.state), tempC: Math.round(airTemp(sim)), isDay: cal.hour >= cal.sunrise && cal.hour < cal.sunset },
    seasonLength: seasonLength(s),
  };
}

const WORKER_CASTES = new Set(['worker', 'minor', 'media', 'major']);
const TASK_GROUP = new Map<Task, 'forage' | 'nurse' | 'dig' | 'defend'>();
for (const g of ['forage', 'nurse', 'dig', 'defend'] as const) for (const t of GROUP_TASKS[g]) TASK_GROUP.set(t, g);

/** Group of a task for the roster and the pulse ('idle' for unassigned, reactive and rest). */
export function groupOfTask(task: Task): 'forage' | 'nurse' | 'dig' | 'defend' | 'idle' {
  return TASK_GROUP.get(task) ?? 'idle';
}

function pastOf(sim: Sim, id: string, nowValue: number): number | null {
  const ts = sim.state.progression.history.hourly[id];
  if (!ts || ts.len <= TREND_WINDOW_GAME_H) return null;
  const v = tsAt(ts, -1 - TREND_WINDOW_GAME_H);
  return v === undefined ? null : (Number.isFinite(v) ? v : nowValue);
}

function sparkOf(sim: Sim, id: string, now: number): number[] {
  const ts = sim.state.progression.history.hourly[id];
  const out = ts ? tsToArray(ts) : [];
  const tail = out.length > SPARK_SAMPLES ? out.slice(out.length - SPARK_SAMPLES) : out;
  tail.push(now);
  return tail;
}

function overallStatus(sim: Sim, col: Colony): { status: 'ok' | 'warn' | 'bad'; worst: UiColony['worst'] } {
  let rank = col.starvationStage === 'fed' ? 0 : col.starvationStage === 'lean' ? 1 : 2;
  let worst: UiColony['worst'] = null;
  for (const d of sim.state.progression.diagnostics) {
    const r = d.status === 'bad' ? 2 : d.status === 'warn' ? 1 : 0;
    if (r > 0 && (worst === null || r > (worst.status === 'bad' ? 2 : 1))) worst = { id: d.id, label: d.label, status: r === 2 ? 'bad' : 'warn' };
    if (r > rank) rank = r;
  }
  return { status: rank >= 2 ? 'bad' : rank === 1 ? 'warn' : 'ok', worst };
}

export function colonyOf(sim: Sim): UiColony | null {
  const col = sim.state.colonies[0];
  if (!col) return null;
  let workers = 0, adults = 0;
  const g = { forage: 0, nurse: 0, dig: 0, defend: 0, idle: 0 };
  for (const a of sim.state.ants) {
    if (!a.alive || a.colony !== col.id) continue;
    adults++;
    if (!WORKER_CASTES.has(a.caste)) continue;
    workers++;
    g[groupOfTask(a.task)]++;
  }
  const brood = { egg: 0, larva: 0, pupa: 0 };
  for (const b of sim.state.brood) {
    if (!b.alive || b.colony !== col.id) continue;
    if (b.stage === 'egg') brood.egg++; else if (b.stage === 'larva') brood.larva++; else if (b.stage === 'pupa') brood.pupa++;
  }
  const queen = sim.stores.ants.get(col.queenId);
  const days = daysOfStock(col);
  const st = overallStatus(sim, col);
  const c = col.stores.c, p = col.stores.p;
  return {
    workers, adults, queenAlive: !!queen, brood, stores: { c, p },
    queenMode: queen?.queen ? queen.queen.mode : 'absent', groups: g,
    queenReserves: queen?.queen?.founding && queen.queen.founding.R0 > 0 ? Math.max(0, Math.min(1, queen.queen.founding.reserveLoads / queen.queen.founding.R0)) : null,
    past: { c: pastOf(sim, 'stores-c', c), p: pastOf(sim, 'stores-p', p) },
    spark: { c: sparkOf(sim, 'stores-c', c), p: sparkOf(sim, 'stores-p', p) },
    intake: { c: col.counters.intakeTodayC, p: col.counters.intakeTodayP },
    stockDays: { c: days.c, p: days.p },
    status: st.status, worst: st.worst,
  };
}

function carryLabel(sim: Sim, a: Ant): string {
  if (a.carry.kind === 'none') return 'nothing';
  if (a.carry.kind === 'brood') return sim.stores.brood.get(a.carry.id)?.stage ?? 'brood';
  const k = sim.stores.items.get(a.carry.id)?.kind ?? 'item';
  return k === 'soil-pellet' ? 'soil pellet' : k.replace(/-/g, ' ');
}

/** Direction to the nearest open own entrance relative to where the ant faces, and its distance in BU. */
function homeOf(sim: Sim, a: Ant): { angleDeg: number; distBu: number } | null {
  let best: { x: number; y: number; z: number } | null = null;
  let bestD = Infinity;
  for (const nid of sim.state.colonies[0]?.nestIds ?? []) {
    const nest = sim.stores.nests.get(nid);
    if (!nest) continue;
    for (const e of nest.entrances) {
      if (e.status === 'sealed' || e.status === 'sealing') continue;
      const d = (e.pos.x - a.pos.x) ** 2 + (e.pos.y - a.pos.y) ** 2 + (e.pos.z - a.pos.z) ** 2;
      if (d < bestD) { bestD = d; best = e.pos; }
    }
  }
  if (!best) return null;
  let vx = best.x - a.pos.x, vy = best.y - a.pos.y, vz = best.z - a.pos.z;
  const upDot = vx * a.up.x + vy * a.up.y + vz * a.up.z;
  vx -= a.up.x * upDot; vy -= a.up.y * upDot; vz -= a.up.z * upDot;
  const rx = a.fwd.y * a.up.z - a.fwd.z * a.up.y, ry = a.fwd.z * a.up.x - a.fwd.x * a.up.z, rz = a.fwd.x * a.up.y - a.fwd.y * a.up.x;
  const ahead = vx * a.fwd.x + vy * a.fwd.y + vz * a.fwd.z, right = vx * rx + vy * ry + vz * rz;
  let deg = (Math.atan2(right, ahead) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return { angleDeg: Math.round(deg), distBu: Math.round(Math.sqrt(bestD) / sim.world.bu) };
}

export function possessedOf(sim: Sim, underground: boolean): UiPossessed | null {
  const a = sim.stores.ants.get(sim.state.player.possessedAntId);
  if (!a) return null;
  const isQueen = a.caste === 'queen';
  const fr = a.queen?.founding;
  const acidMax = sim.getSpecies(sim.stores.colonies.get(a.colony)?.species ?? sim.species.id)?.combat.acid?.max ?? 0;
  const last = a.mem.decisions.reduce<{ tick: number; code: number } | null>((m, d) => (d.tick >= 0 && (!m || d.tick > m.tick) ? d : m), null);
  return {
    id: a.id, caste: a.caste, task: a.task, health: a.maxHp > 0 ? a.hp / a.maxHp : 0, cropC: a.cropC, cropP: a.cropP,
    cropCap: a.cropCap, carrying: carryLabel(sim, a), trailOn: (a.flags & AntFlag.TRAIL_ON) !== 0,
    action: a.action ? a.action.id : null, underground,
    isQueen, name: antName(a.caste, a.id), ageDays: Math.round(a.physioAgeGd * 10) / 10, stateWord: stateWord(a.state, a.task),
    reason: last ? (REASON_CODES[last.code]?.replace(/-/g, ' ') ?? null) : null,
    reserves: fr ? Math.max(0, Math.min(1, fr.R0 > 0 ? fr.reserveLoads / fr.R0 : 0)) : null,
    acid: acidMax > 0 ? { charges: Math.floor(a.acid), max: acidMax } : null,
    heatStress: a.heatLoad >= HEAT_STRESS_LOAD || a.thermalState === 'heat-stupor',
    home: underground ? null : homeOf(sim, a),
    colonyOrders: isQueen && queenHandedOver(sim),
  };
}

export function promptOf(sim: Sim): UiPrompt | null {
  const a = sim.stores.ants.get(sim.state.player.possessedAntId);
  if (!a) return null;
  try {
    const v = promptView(sim, a);
    const lines: UiPromptLine[] = [];
    if (v.primary) lines.push({ slot: 'primary', input: v.primary.input, text: v.primary.text, ok: v.primary.ok });
    if (v.secondary) lines.push({ slot: 'secondary', input: v.secondary.input, text: v.secondary.text, ok: v.secondary.ok });
    for (const l of v.extras) lines.push({ slot: 'extra', input: l.input, text: l.text, ok: l.ok });
    return { primary: v.primary?.text ?? null, secondary: v.secondary?.text ?? null, extras: v.extras.map((l) => l.text), lines };
  } catch {
    return null; // a module in progress must not take the HUD down
  }
}

/**
 * The alert feed from progression's active alerts (critical first, newest first). An alert the sim raised without
 * wording (title '' and `tokens`) is worded here from the content tables, so no card is ever empty.
 */
export function alertsOf(sim: Sim): UiAlert[] {
  const opening = !queenHandedOver(sim);
  // Adapter (reported to the simulation half): progression raises the critical `last-ants` for the lone founding
  // queen of a claustral founding, which is the expected state, not news. Not shown until the hand-over.
  return activeAlerts(sim).filter((a) => !(opening && a.kind === 'last-ants')).map((a) => {
    const words = a.title ? null : alertText(a.kind, a.tokens ?? {});
    return { ...alertCard(a), title: words ? words.title : a.title, cause: words && !a.cause ? words.cause : a.cause };
  });
}

function alertCard(a: ReturnType<typeof activeAlerts>[number]): UiAlert {
  return {
    id: a.id, kind: a.kind, level: a.level, title: a.title, cause: a.cause, count: a.count, subjectId: a.subjectId,
    diagnosticId: a.diagnosticId, focus: a.focus ? { kind: a.focus.kind, id: a.focus.id, pos: { x: a.focus.pos.x, y: a.focus.pos.y, z: a.focus.pos.z } } : null,
    acknowledged: a.acknowledged, raisedTick: a.raisedTick,
  };
}
