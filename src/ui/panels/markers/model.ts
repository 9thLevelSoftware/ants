// The marker palette, pure part (GDD 08 4.3): tools in palette order with their words and icons, the count text against the
// cap, and the options each tool offers. The tool state itself lives in the views layer; the palette drives it through
// the panels bridge and never places anything itself.
import type { UiMarkerCount } from '../../api';
import { COLONY_TOOLS, type ColonyToolId, type UiToolState } from '../wiring/bridgeTypes';

export interface ToolInfo {
  id: ColonyToolId;
  word: string;
  icon: string;
  /** One line under the options: what a click does with this tool. */
  hint: string;
}

export const TOOL_INFO: Readonly<Record<ColonyToolId, ToolInfo>> = {
  dig: { id: 'dig', word: 'Dig', icon: 'marker-dig', hint: 'Point at a nest wall to place a chamber, tunnel or shaft; click to confirm.' },
  forage: { id: 'forage', word: 'Forage', icon: 'marker-forage', hint: 'Click the ground: foragers favour this area. Drag to set the radius.' },
  avoid: { id: 'avoid', word: 'Avoid', icon: 'marker-avoid', hint: 'Click the ground: workers keep out of this area.' },
  rally: { id: 'rally', word: 'Rally', icon: 'marker-rally', hint: 'Click the ground or a chamber: workers gather here.' },
  entrance: { id: 'entrance', word: 'Entrance', icon: 'marker-entrance', hint: 'Click the surface above a tunnel or chamber to plan a new way out.' },
  'move-brood': { id: 'move-brood', word: 'Move brood', icon: 'marker-move-brood', hint: 'Click a chamber of the nest: the brood is carried there.' },
  'move-queen': { id: 'move-queen', word: 'Move queen', icon: 'marker-move-queen', hint: 'Click a chamber of the nest: the queen is escorted there.' },
};

/** Tools in palette order (GDD 08 4.3), with the Shift+digit that selects each. */
export function paletteTools(): { info: ToolInfo; key: number }[] {
  return COLONY_TOOLS.map((id, i) => ({ info: TOOL_INFO[id], key: i + 1 }));
}

export const POINTER_HINT = 'Select: click a marker or a dig plan; Delete removes it, Ctrl+Z undoes the last placement.';

/** "3/8" for a count against its cap. */
export function countText(c: UiMarkerCount | undefined): string {
  return c ? `${c.n}/${c.cap}` : '';
}

export function atCap(c: UiMarkerCount | undefined): boolean {
  return !!c && c.cap > 0 && c.n >= c.cap;
}

export type ToolOption =
  | { kind: 'radius'; marker: 'forage' | 'avoid' | 'rally'; min: number; max: number; value: number }
  | { kind: 'priority-marker'; value: 'normal' | 'high' }
  | { kind: 'rally-mode'; value: 'defend' | 'attack' }
  | { kind: 'template'; value: 'chamber' | 'tunnel' | 'shaft' }
  | { kind: 'chamber-type'; value: string; types: string[] }
  | { kind: 'size'; value: 's' | 'm' | 'l' }
  | { kind: 'priority-plan'; value: 'normal' | 'high' };

/** The options row of the active tool. */
export function optionsFor(tool: ColonyToolId | null, s: UiToolState): ToolOption[] {
  const out: ToolOption[] = [];
  const radius = (k: 'forage' | 'avoid' | 'rally'): void => {
    const r = s.radiusRange[k] ?? [8, 80];
    out.push({ kind: 'radius', marker: k, min: r[0], max: r[1], value: s.radiusBu[k] ?? r[0] });
  };
  switch (tool) {
    case 'forage': radius('forage'); out.push({ kind: 'priority-marker', value: s.markerPriority }); break;
    case 'avoid': radius('avoid'); break;
    case 'rally': radius('rally'); out.push({ kind: 'rally-mode', value: s.rallyMode }); break;
    case 'dig':
      out.push({ kind: 'template', value: s.planner.template === 'entrance' ? 'chamber' : s.planner.template });
      if (s.planner.template === 'chamber' || s.planner.template === 'entrance') {
        out.push({ kind: 'chamber-type', value: s.planner.chamberType, types: s.planner.chamberTypes });
        out.push({ kind: 'size', value: s.planner.size });
      }
      out.push({ kind: 'priority-plan', value: s.planner.priority });
      break;
    case 'entrance': out.push({ kind: 'priority-plan', value: s.planner.priority }); break;
    default: break;
  }
  return out;
}
