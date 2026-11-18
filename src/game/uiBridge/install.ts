// The HUD's seam to the running Game, built only from what Game already exposes (command, refreshUi, hover / inspect
// highlights, camera, session). The UI root calls installHudBridge once when the game exists; with anything that is
// not a Game (the demo page's mock facade) every part degrades to "nothing", never to an error.
import type { PerspectiveCamera } from 'three';
import type { Command, Sim } from '@/sim/types';
import { hudRequests, type InspectRequest } from './requests';
import { projectToScreen, type ScreenPoint } from './projector';
import { buildMinimapFrame, minimapPlate, newMinimapFrame, type MinimapFrame, type MinimapPlate } from './minimap';

/** The members of Game this file reads. Everything is optional so any facade can be passed. */
interface GameLike {
  hover?: InspectRequest | null;
  inspect?: InspectRequest | null;
  camera?: PerspectiveCamera;
  session?: {
    possessedId: number;
    followId: number;
    sim: Sim;
    views: { freeFlyAt(pos: { x: number; y: number; z: number }, look: { x: number; y: number; z: number }): void; colony: { target: { x: number; y: number; z: number } } };
    view: string;
    focus(out?: { x: number; y: number; z: number }): { x: number; y: number; z: number };
    driver: { clock: { alpha: number } };
    setView(view: 'observer'): void;
  } | null;
  setView?(view: 'possess' | 'observer' | 'colony' | 'photo'): void;
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
  /**
   * The minimap's data for the current frame (null outside a game). `trails`: the scent view is on. The object and its
   * arrays are reused by the next call: paint from it at once.
   */
  minimap(trails: boolean): MinimapFrame | null;
  /** The static zone plate of the minimap (null outside a game); the same object for the whole game. */
  minimapPlate(): MinimapPlate | null;
  /** Click on the minimap: the observer camera pans to this point (the colony view moves its target there). */
  panTo(x: number, z: number): void;
  /** Completes a follow that had to wait for the release to take effect; call on every snapshot. */
  settle(): void;
}

/** Camera distance behind and above the point a minimap click pans to, BU (the same framing as the alerts' "Show"). */
const PAN_BACK_BU = 22;
const PAN_UP_BU = 14;

/** Wires the request channel and returns the actions the HUD needs beyond the GameFacade. */
export function installHudBridge(game: unknown): HudBridge {
  const g = (game ?? {}) as GameLike;
  hudRequests.hooks = {
    gameInspect: () => (g.inspect ? { kind: g.inspect.kind, id: g.inspect.id } : null),
    gameHover: () => (g.hover ? { kind: g.hover.kind, id: g.hover.id } : null),
  };
  let pending = -1;
  const frame = newMinimapFrame(), focusBuf = { x: 0, y: 0, z: 0 };
  let plate: MinimapPlate | null = null, plateOf: unknown = null;
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
    minimap(trails) {
      const s = g.session;
      if (!s) return null;
      const f = s.focus(focusBuf);
      return buildMinimapFrame(s.sim, f, s.possessedId, trails, frame);
    },
    minimapPlate() {
      const s = g.session;
      if (!s) { plate = null; plateOf = null; return null; }
      if (plateOf !== s.sim.world) { plateOf = s.sim.world; plate = minimapPlate(s.sim); }
      return plate;
    },
    panTo(x, z) {
      const s = g.session;
      if (!s) return;
      const bu = s.sim.world.bu, y = s.sim.field.height(x, z);
      if (s.view === 'colony') { const t = s.views.colony.target; t.x = x; t.y = y; t.z = z; }
      else {
        g.setView?.('observer');
        s.views.freeFlyAt({ x: x + PAN_BACK_BU * bu, y: y + PAN_UP_BU * bu, z: z + PAN_BACK_BU * bu }, { x, y, z });
      }
      g.viewChanged?.();
      g.requestRender?.();
      g.refreshUi?.();
    },
    refresh() { g.refreshUi?.(); },
    suspendGameKeys(on) { g.input?.setSuspended(on); },
  };
}
