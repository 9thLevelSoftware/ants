// The seam between the panels and the running Game (task ui-panels): what the panels read of the views layer's tool
// state and the actions they ask of it. The Game side (src/game/uiBridge/panels/bridge.ts) implements it structurally
// from what Game already exposes; the demo page implements it on a mock. Plain data only.
import type { UiFocus } from '../../api';

/** The tools of the marker palette, in palette order (GDD 08 4.3; Shift+1..7). */
export const COLONY_TOOLS = ['dig', 'forage', 'avoid', 'rally', 'entrance', 'move-brood', 'move-queen'] as const;
export type ColonyToolId = (typeof COLONY_TOOLS)[number];

export type PlanTemplateId = 'chamber' | 'tunnel' | 'shaft' | 'entrance';

export interface UiToolState {
  /** The active tool, null = the pointer (select). */
  tool: ColonyToolId | null;
  /** Current radius in BU per kind that has one (forage, avoid, rally) and its range. */
  radiusBu: Record<string, number>;
  radiusRange: Record<string, [number, number]>;
  rallyMode: 'defend' | 'attack';
  /** Priority of forage markers. */
  markerPriority: 'normal' | 'high';
  planner: {
    template: PlanTemplateId;
    chamberType: string;
    /** Chamber types the species may plan. */
    chamberTypes: string[];
    size: 's' | 'm' | 'l';
    priority: 'normal' | 'high';
  };
  /** Last refusal or hint of a tool (the toast shows it too). */
  message: string | null;
}

export interface PanelsBridge {
  /** The tool state, null when no game runs. */
  tool(): UiToolState | null;
  /** Selects a tool (switches to the colony view first when needed); null = the pointer. */
  selectTool(tool: ColonyToolId | null): void;
  setRadius(kind: string, bu: number): void;
  setRallyMode(mode: 'defend' | 'attack'): void;
  setMarkerPriority(p: 'normal' | 'high'): void;
  setPlanner(o: Partial<{ template: PlanTemplateId; chamberType: string; size: 's' | 'm' | 'l'; priority: 'normal' | 'high' }>): void;
  /** Camera to a chamber of the player's nest: colony view, cutaway at its depth, focused. */
  jumpToChamber(chamberId: number): void;
  /** Camera to a target (observer view, or the colony view for something underground); the target is outlined for 4 s. */
  jumpTo(focus: UiFocus): void;
  /** `designateChamber` for the player's nest; false when refused. */
  designateChamber(chamberId: number, type: string): boolean;
  /** Seals an open entrance or reopens a sealed one. */
  toggleEntrance(entranceId: number): 'seal' | 'reopen' | null;
  /** Device-wide codex unlocks of the profile, when the game has one. */
  codexDevice?(): Record<string, { label: string }>;
}
