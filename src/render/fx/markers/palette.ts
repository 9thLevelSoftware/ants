// Colours and patterns of markers, plan states and ghosts (GDD 08 §4.3; the Okabe-Ito colour-blind-safe set the
// GDD's tokens use). Validity is also carried by line style: valid dashed, refused cross-hatched, warning dashed amber.
import type { MarkerKind, PlanStatus } from '@/sim/types';
import type { LineStyle } from './MarkerRenderer';

export const MARKER_COLOR: Record<MarkerKind, string> = {
  dig: '#F0E442', forage: '#009E73', avoid: '#D55E00', rally: '#CC79A7', entrance: '#56B4E9',
  'move-brood': '#E69F00', 'move-queen': '#0072B2', satellite: '#999999',
};

export const GHOST_STYLE = {
  valid: { color: '#F0E442', style: 'dashed' as LineStyle },
  warning: { color: '#E69F00', style: 'dashed' as LineStyle },
  invalid: { color: '#D55E00', style: 'solid' as LineStyle },
};

/** Plan states shown in the colony view; terminal states are not drawn. */
export const PLAN_STYLE: Partial<Record<PlanStatus, { color: string; style: LineStyle; hatch?: boolean }>> = {
  proposed: { color: '#56B4E9', style: 'dotted' },
  queued: { color: '#F0E442', style: 'dashed' },
  active: { color: '#F0E442', style: 'solid' },
  stalled: { color: '#D55E00', style: 'solid', hatch: true },
  paused: { color: '#9A9A9A', style: 'dashed' },
};

export const SELECT_COLOR = '#FFFFFF';
export const HOVER_COLOR = '#F4EDE2';
/** Translucent fill of the planner's ghost. */
export const GHOST_FILL_OPACITY = 0.22;
