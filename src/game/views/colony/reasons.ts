// Player-facing words for the nest module's plan validation codes (GDD 03 §14.2) and the marker refusals
// (GDD 08 §4.3). Plain text, no markup.
import type { MarkerKind, PlanValidationCode } from '@/sim/types';
import { MARKER_CAP } from '@/sim/balance/colony';

export const PLAN_REASON_TEXT: Record<PlanValidationCode, string> = {
  'anchor-not-in-nest': 'Start from a tunnel or chamber of this nest',
  'non-diggable': 'Concrete or stone cannot be dug',
  unstable: 'Too wide a ceiling for this soil',
  undermines: 'Too close to the surface, another entrance or another room above or below',
  'too-close': 'Leaves too thin a wall',
  'foreign-nest': 'Would break into a neighbouring nest',
  water: 'Under water',
  'out-of-bounds': 'Too deep or too far from the nest',
  'overlaps-plan': 'Overlaps another plan',
  'too-large': 'Larger than this species builds, or the plan limit is reached',
  'type-not-allowed': 'This species does not build that',
  'flood-risk': 'Low point: likely to flood',
};

/** First refusal's words, else the first warning's, else null. */
export function planReason(codes: readonly PlanValidationCode[], warnings: readonly PlanValidationCode[]): string | null {
  const c = codes[0] ?? warnings[0];
  return c ? PLAN_REASON_TEXT[c] ?? c : null;
}

export function markerLimitText(kind: MarkerKind): string {
  return `Limit reached (${MARKER_CAP[kind]}). Remove a marker first.`;
}

/** Marker refusals by the colony module's `command-rejected` reason. */
export function markerRefusalText(kind: MarkerKind, reason: string): string {
  if (reason === 'limit') return markerLimitText(kind);
  if (reason === 'invalid' && (kind === 'move-brood' || kind === 'move-queen')) return 'Choose a chamber of the nest';
  return 'The marker cannot go there';
}
