// Builds the UiSnapshot from the sim and the game's own state (contracts guidance §8). Called a few times per
// second by Game (UI_REFRESH_HZ) and after every debug step / render. Pure: reads, never writes, sim state.
import type { Ant, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { currentDayOfSeason, currentHour, currentSeason, currentYear } from '@/sim/time';
import { promptView } from '@/sim/ants/player';
import type { UiAlert, UiColony, UiLoading, UiPossessed, UiPrompt, UiSnapshot, UiSpeed, UiTime, UiToast } from '@/ui/api';
import type { SpeedReport } from './loop/speedMeter';
import { allowedSpeeds, type GameMode, type ViewId } from './time/speedRules';

export interface SnapshotSource {
  sim: Sim | null;
  mode: GameMode;
  view: ViewId;
  loading: UiLoading | null;
  speed: SpeedReport | null;
  manualClock: boolean;
  toasts: readonly UiToast[];
  hudHidden: boolean;
  error: string | null;
  /** The possessed ant is below the original ground. */
  underground: boolean;
  epitaph: UiSnapshot['epitaph'];
  /** Game-level prompt shown when no ant is possessed (optional: null / absent = none). */
  observerPrompt?: string | null;
}

function cap(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

export function timeOf(sim: Sim): UiTime {
  const s = sim.state;
  const hourF = currentHour(s);
  const hour = Math.floor(hourF);
  const minute = Math.floor((hourF - hour) * 60);
  const season = currentSeason(s);
  const day = currentDayOfSeason(s);
  const hh = String(hour).padStart(2, '0'), mm = String(minute).padStart(2, '0');
  return { tick: s.tick, year: currentYear(s), season, dayOfSeason: day, hour, minute, label: `${cap(season)} · Day ${day} · ${hh}:${mm}` };
}

export function colonyOf(sim: Sim): UiColony | null {
  const col = sim.state.colonies[0];
  if (!col) return null;
  let workers = 0, adults = 0;
  for (const a of sim.state.ants) {
    if (!a.alive || a.colony !== col.id) continue;
    adults++;
    if (a.caste !== 'queen' && a.caste !== 'gyne' && a.caste !== 'male') workers++;
  }
  const brood = { egg: 0, larva: 0, pupa: 0 };
  for (const b of sim.state.brood) {
    if (!b.alive || b.colony !== col.id) continue;
    if (b.stage === 'egg') brood.egg++; else if (b.stage === 'larva') brood.larva++; else if (b.stage === 'pupa') brood.pupa++;
  }
  const queen = sim.stores.ants.get(col.queenId);
  return { workers, adults, queenAlive: !!queen, brood, stores: { c: col.stores.c, p: col.stores.p } };
}

function carryLabel(sim: Sim, a: Ant): string {
  if (a.carry.kind === 'none') return 'nothing';
  if (a.carry.kind === 'brood') return sim.stores.brood.get(a.carry.id)?.stage ?? 'brood';
  return sim.stores.items.get(a.carry.id)?.kind ?? 'item';
}

export function possessedOf(sim: Sim, underground: boolean): UiPossessed | null {
  const a = sim.stores.ants.get(sim.state.player.possessedAntId);
  if (!a) return null;
  return {
    id: a.id, caste: a.caste, task: a.task, health: a.maxHp > 0 ? a.hp / a.maxHp : 0, cropC: a.cropC, cropP: a.cropP,
    cropCap: a.cropCap, carrying: carryLabel(sim, a), trailOn: (a.flags & AntFlag.TRAIL_ON) !== 0,
    action: a.action ? a.action.id : null, underground,
  };
}

export function promptOf(sim: Sim): UiPrompt | null {
  const a = sim.stores.ants.get(sim.state.player.possessedAntId);
  if (!a) return null;
  try {
    const v = promptView(sim, a);
    return { primary: v.primary?.text ?? null, secondary: v.secondary?.text ?? null, extras: v.extras.map((l) => l.text) };
  } catch {
    return null; // a module in progress must not take the HUD down
  }
}

/** A game-level prompt while no ant is possessed (after the death hold: "Tab: take another ant"). */
function observerPromptOf(src: SnapshotSource): UiPrompt | null {
  return src.observerPrompt ? { primary: src.observerPrompt, secondary: null, extras: [] } : null;
}

function alertsOf(sim: Sim): UiAlert[] {
  return sim.state.progression.alerts.map((a) => ({ id: a.id, kind: a.kind, level: a.level, title: a.title }));
}

function speedOf(src: SnapshotSource, sim: Sim): UiSpeed {
  const t = sim.state.env.time;
  const r = src.speed;
  const opening = sim.state.player.opening;
  return {
    level: t.paused ? 0 : t.speed, paused: t.paused, requested: t.speed, effective: r ? r.effective : t.speed,
    lagging: r ? r.lagging : false, belowRealTime: r ? r.belowRealTime : false, manualClock: src.manualClock,
    allowed: allowedSpeeds({
      mode: src.mode, view: src.view, possessed: sim.state.player.possessedAntId !== -1,
      openingPhase: opening && !opening.done ? opening.phase : null, timelapse: sim.state.player.timelapse !== null,
    }),
  };
}

/** A fresh snapshot (new object, so signal subscribers see the change). */
export function buildSnapshot(src: SnapshotSource, prevRev: number): UiSnapshot {
  const sim = src.sim;
  const inGame = sim !== null && (src.mode === 'playing' || src.mode === 'paused' || src.mode === 'epitaph');
  return {
    rev: prevRev + 1, screen: src.mode, mode: src.mode, view: src.view, loading: src.loading,
    time: inGame ? timeOf(sim) : null,
    speed: inGame ? speedOf(src, sim) : null,
    colony: inGame ? colonyOf(sim) : null,
    possessed: inGame ? possessedOf(sim, src.underground) : null,
    prompt: inGame ? promptOf(sim) ?? observerPromptOf(src) : null,
    alerts: inGame ? alertsOf(sim) : [],
    toasts: [...src.toasts], hudHidden: src.hudHidden, error: src.error, epitaph: src.epitaph,
  };
}
