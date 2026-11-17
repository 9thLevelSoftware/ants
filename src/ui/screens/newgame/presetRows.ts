// What the New Game screen lists for a difficulty preset and for the rules a custom game could change (GDD 08 3.7).
// Rows and rules the sim does not read yet (src/sim/config/presetDisplay.ts `inEffect` false) are listed but marked
// "Not in this build": the screen never offers a value as working when no system uses it.
import type { DifficultyId } from '@/sim/types';
import { presetCard, RULE_DISPLAY, type PresetRow } from '@/sim/config/presetDisplay';

/** The words that replace the value of a row (or the control of a rule) that nothing reads yet. */
export const NOT_IN_BUILD = 'Not in this build';

export interface ShownRow { label: string; value: string; inEffect: boolean }
export interface ShownGroup { group: PresetRow['group']; rows: ShownRow[] }

/** The rows of a preset's card, grouped as in GDD 06 14; a row not in effect shows NOT_IN_BUILD in place of its value. */
export function presetGroups(id: DifficultyId): ShownGroup[] {
  const groups: ShownGroup[] = [];
  for (const r of presetCard(id).rows) {
    let g = groups.find((x) => x.group === r.group);
    if (!g) { g = { group: r.group, rows: [] }; groups.push(g); }
    g.rows.push({ label: r.label, value: r.inEffect ? r.value : NOT_IN_BUILD, inEffect: r.inEffect });
  }
  return groups;
}

export interface UnwiredRule { label: string; effect: string }

/** Custom rules the design lists that the game does not apply yet: shown disabled, with the design's one-line effect. */
export function unwiredRules(): UnwiredRule[] {
  return RULE_DISPLAY.filter((r) => !r.inEffect).map((r) => ({ label: r.label, effect: r.effect }));
}
