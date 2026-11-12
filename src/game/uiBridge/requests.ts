// What the open HUD panels ask of the bridge. The UI writes it, the bridge reads it on the next refresh, so work that
// only matters while a panel is open (the roster page, the inspect card) is skipped otherwise. Plain module state: one
// Game per page. `hooks` are installed by installHudBridge (uiBridge.ts) once the Game exists.
import type { UiRosterQuery } from '@/ui/api';

export interface InspectRequest {
  /** 'ant' | 'brood' | 'item' | 'source' | 'creature' | 'chamber' | 'entrance'. */
  kind: string;
  id: number;
}

export interface BridgeHooks {
  /** The target the game's picking highlights as hovered / selected (Game.hover / Game.inspect), or null. */
  gameInspect(): InspectRequest | null;
  gameHover(): InspectRequest | null;
}

export interface HudRequests {
  roster: UiRosterQuery | null;
  /** The card to show: the UI's pinned or hovered choice (see ui/hud/inspectState.ts). */
  inspect: InspectRequest | null;
  /** The Directives panel is open: the bridge fills `UiSnapshot.directives` (it is cheap, but only then). */
  directivesOpen: boolean;
  hooks: BridgeHooks | null;
}

export const hudRequests: HudRequests = { roster: null, inspect: null, directivesOpen: true, hooks: null };
