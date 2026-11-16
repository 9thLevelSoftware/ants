// A bridge until the opening overlay asks the hint engine itself. GDD 06 §5.16 / GDD 08 §9.1: a glyph prompt of the opening
// is "not yet learned" or it does not show; the overlay (src/ui/screens/founding, not this task's file) draws its prompt
// chip from the phase alone. This hides the items of that chip whose hint is learned, dismissed or switched off, and the
// chip when nothing is left: styles only, nothing removed, undone as soon as the hint is allowed again. The "Tend the
// brood" button is an action, not a lesson, and always stays. The proper fix is one call in PlayPanels.tsx
// (`onboarding.value?.engine.allows(promptHintId(phase, action))`); then this file can go.
import type { HintId } from '@/sim/types';
import type { FoundingUi } from '../../screens/founding/store';
import { promptHintId } from './foundingShown';

const CHIP = '[data-testid="founding-prompts"]';

/** What to show for each prompt of the chip, in order: false hides the item. Pure, so it is tested without a DOM. */
export function promptVisibility(ui: FoundingUi | null, allows: (id: HintId) => boolean): boolean[] {
  if (!ui) return [];
  return ui.prompts.map((p) => {
    if (p.action === 'tend') return true;
    const id = promptHintId(ui.phase, p.action);
    return id ? allows(id) : true;
  });
}

/** Applies the visibility to the live DOM (the chip's children are the prompts in order). Returns the number hidden. */
export function gateFoundingPrompts(root: ParentNode, ui: FoundingUi | null, allows: (id: HintId) => boolean): number {
  const chip = root.querySelector<HTMLElement>(CHIP);
  if (!chip) return 0;
  const vis = promptVisibility(ui, allows);
  const items = Array.from(chip.children) as HTMLElement[];
  let hidden = 0;
  items.forEach((el, i) => {
    const show = vis[i] ?? true;
    const want = show ? '' : 'none';
    if (el.style.display !== want) el.style.display = want;
    if (!show) hidden++;
  });
  const all = items.length > 0 && hidden === items.length;
  const wantChip = all ? 'none' : '';
  if (chip.style.display !== wantChip) chip.style.display = wantChip;
  return hidden;
}
