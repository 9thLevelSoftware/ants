// The HUD's seam to the running Game, built only from what Game already exposes (command, refreshUi, hover / inspect
// highlights, camera, session). The UI root calls installHudBridge once when the game exists; with anything that is
// not a Game (the demo page's mock facade) every part degrades to "nothing", never to an error.
import type { PerspectiveCamera } from 'three';
import type { Command } from '@/sim/types';
import { hudRequests, type InspectRequest } from './requests';
import { projectToScreen, type ScreenPoint } from './projector';

/** The members of Game this file reads. Everything is optional so any facade can be passed. */
interface GameLike {
  hover?: InspectRequest | null;
  inspect?: InspectRequest | null;
  camera?: PerspectiveCamera;
  session?: {
    possessedId: number;
    followId: number;
    sim: { stores: { ants: { get(id: number): { pos: { x: number; y: number; z: number }; prevPos: { x: number; y: number; z: number }; up: { x: number; y: number; z: number } } | undefined } }; world: { bu: number } };
    driver: { clock: { alpha: number } };
    setView(view: 'observer'): void;
  } | null;
  input?: { setSuspended(on: boolean): void };
  command?(cmd: Command): unknown;
  release?(): void;
  refreshUi?(): void;
  requestRender?(): void;
  viewChanged?(): void;
}

export interface HudBridge {
  /** Observer camera follows this ant (releases the possessed ant first). */
  follow(antId: number): void;
  /**
   * Screen position (CSS px) of the point `heightBu` above the possessed ant, for a viewport of `viewW` x `viewH` CSS px
   * (given by the caller so the animation-frame loop never reads layout); false when behind the camera or off-screen.
   */
  possessedAnchor(heightBu: number, viewW: number, viewH: number, out: ScreenPoint): boolean;
  /** Ask the game to rebuild the snapshot now. */
  refresh(): void;
  /**
   * The game's keys stop (true) or resume (false). While focus sits inside a drawer, Tab, the arrows, E, F and Space belong
   * to the drawer: without this they would also cycle ants, orbit the camera and interact with the world.
   */
  suspendGameKeys(on: boolean): void;
  /** Completes a follow that had to wait for the release to take effect; call on every snapshot. */
  settle(): void;
}

/** Wires the request channel and returns the actions the HUD needs beyond the GameFacade. */
export function installHudBridge(game: unknown): HudBridge {
  const g = (game ?? {}) as GameLike;
  hudRequests.hooks = {
    gameInspect: () => (g.inspect ? { kind: g.inspect.kind, id: g.inspect.id } : null),
    gameHover: () => (g.hover ? { kind: g.hover.kind, id: g.hover.id } : null),
  };
  let pending = -1;
  const apply = (antId: number): void => {
    const s = g.session;
    if (!s) return;
    s.followId = antId;
    s.setView('observer');
    g.viewChanged?.();
    g.requestRender?.();
  };
  return {
    follow(antId) {
      const s = g.session;
      if (!s) return;
      if (s.possessedId === -1) { apply(antId); return; }
      pending = antId; // the release applies at the next tick when time runs; settle() finishes the follow after it
      g.release?.();
      if (s.possessedId === -1) { pending = -1; apply(antId); }
    },
    settle() {
      if (pending >= 0 && g.session && g.session.possessedId === -1) { const id = pending; pending = -1; apply(id); }
    },
    possessedAnchor(heightBu, viewW, viewH, out) {
      const s = g.session, cam = g.camera;
      if (!s || !cam) return false;
      const a = s.sim.stores.ants.get(s.possessedId);
      if (!a) return false;
      const k = s.driver.clock.alpha, j = 1 - k, h = heightBu * s.sim.world.bu;
      return projectToScreen(cam, { clientWidth: viewW, clientHeight: viewH },
        a.prevPos.x * j + a.pos.x * k + a.up.x * h, a.prevPos.y * j + a.pos.y * k + a.up.y * h, a.prevPos.z * j + a.pos.z * k + a.up.z * h, out);
    },
    refresh() { g.refreshUi?.(); },
    suspendGameKeys(on) { g.input?.setSuspended(on); },
  };
}
