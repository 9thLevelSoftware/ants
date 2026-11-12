// Builds the UiSnapshot from the sim and the game's own state (contracts guidance §8). Called a few times per
// second by Game (UI_REFRESH_HZ) and after every debug step / render. Pure: reads, never writes, sim state.
//
// Change detection: every slice that equals the previous one in value keeps the previous object (uiBridge/share.ts),
// so the UI's computed slices do not fire and Preact re-renders only what changed. Panel-only work (the roster page,
// the inspect card) runs only while the UI has asked for it (uiBridge/requests.ts).
import type { Sim } from '@/sim/types';
import type { UiLoading, UiSnapshot, UiSpeed, UiToast } from '@/ui/api';
import { RosterBuilder } from './uiBridge/rosterSlice';
import { directivesOf } from './uiBridge/directivesSlice';
import { alertsOf, colonyOf, possessedOf, promptOf, timeOf } from './uiBridge/hudSlices';
import { inspectOf } from './uiBridge/inspectSlice';
import { hudRequests } from './uiBridge/requests';
import { share } from './uiBridge/share';
import type { SpeedReport } from './loop/speedMeter';
import { allowedSpeeds, type GameMode, type ViewId } from './time/speedRules';

export { alertsOf, colonyOf, possessedOf, promptOf, timeOf };
export { installHudBridge, type HudBridge } from './uiBridge/install';
export { hudRequests } from './uiBridge/requests';

export interface SnapshotSource {
  sim: Sim | null;
  mode: GameMode;
  view: ViewId;
  loading: UiLoading | null;
  speed: SpeedReport | null;
  manualClock: boolean;
  toasts: readonly UiToast[];
  hudHidden: boolean;
  /** The possessed ant is below the original ground. */
  underground: boolean;
  error: string | null;
  epitaph: UiSnapshot['epitaph'];
  /** Game-level prompt shown when no ant is possessed (optional: null / absent = none). */
  observerPrompt?: string | null;
}

/** A game-level prompt while no ant is possessed (after the death hold: "Tab: take another ant"). */
function observerPromptOf(src: SnapshotSource): UiSnapshot['prompt'] {
  return src.observerPrompt ? { primary: src.observerPrompt, secondary: null, extras: [] } : null;
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

/** Snapshot builder with the previous snapshot (for sharing) and the roster's frozen order. One per Game. */
export class SnapshotBuilder {
  private prev: UiSnapshot | null = null;
  private readonly roster = new RosterBuilder();

  build(src: SnapshotSource, prevRev: number, nowMs: number): UiSnapshot {
    const sim = src.sim;
    const inGame = sim !== null && (src.mode === 'playing' || src.mode === 'paused' || src.mode === 'epitaph');
    const p = this.prev;
    const req = hudRequests;
    const inspectReq = req.inspect ?? req.hooks?.gameInspect() ?? req.hooks?.gameHover() ?? null;
    const snap: UiSnapshot = {
      rev: prevRev + 1, screen: src.mode, mode: src.mode, view: src.view, loading: share(p?.loading ?? undefined, src.loading) as UiSnapshot['loading'],
      time: inGame ? share(p?.time ?? undefined, timeOf(sim)) : null,
      speed: inGame ? share(p?.speed ?? undefined, speedOf(src, sim)) : null,
      colony: inGame ? share(p?.colony ?? undefined, colonyOf(sim)) : null,
      possessed: inGame ? share(p?.possessed ?? undefined, possessedOf(sim, src.underground)) : null,
      prompt: inGame ? share(p?.prompt ?? undefined, promptOf(sim) ?? observerPromptOf(src)) : null,
      alerts: inGame ? share(p?.alerts, alertsOf(sim)) : [],
      toasts: share(p?.toasts, [...src.toasts]), hudHidden: src.hudHidden, error: src.error, epitaph: share(p?.epitaph ?? undefined, src.epitaph),
      directives: inGame ? share(p?.directives ?? undefined, directivesOf(sim)) : null,
      roster: inGame && req.roster ? share(p?.roster ?? undefined, this.roster.build(sim, req.roster, nowMs)) : null,
      inspect: inGame ? share(p?.inspect ?? undefined, inspectOf(sim, inspectReq)) : null,
    };
    this.prev = snap;
    return snap;
  }
}

const defaultBuilder = new SnapshotBuilder();

/** A fresh snapshot (new object, so signal subscribers see the change; unchanged slices keep their objects). */
export function buildSnapshot(src: SnapshotSource, prevRev: number): UiSnapshot {
  return defaultBuilder.build(src, prevRev, typeof performance !== 'undefined' ? performance.now() : 0);
}
