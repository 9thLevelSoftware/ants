// Shared picking / tool state of the views layer (what is hovered, selected, which colony tool is active).
import type { MarkerToolKind } from './colony/markerTool';
import { PickCycler, type PickTarget } from './picking/entityPick';

/** Colony-view tools: the dig planner (`dig`, and `entrance` with the entrance template) or a marker kind. */
export type ColonyTool = 'dig' | 'entrance' | MarkerToolKind;

/** Palette order (GDD 08 §4.3; Shift+1..7). */
export const TOOL_ORDER: readonly ColonyTool[] = ['dig', 'forage', 'avoid', 'rally', 'entrance', 'move-brood', 'move-queen'];

export class ViewsState {
  hover: PickTarget | null = null;
  /** The selection (inspect card target). */
  selected: PickTarget | null = null;
  readonly cycler = new PickCycler();
  tool: ColonyTool | null = null;
  selectedPlanId = -1;
  /** Last colony click (double-click on an ant possesses it). */
  lastClick = { t: -Infinity, kind: '', id: -1 };
  /** Last refusal / hint shown by a tool (debug read-out; the toast shows it to the player). */
  message: string | null = null;
}
