// Which hints the opening's own overlay (src/ui/screens/founding) is drawing right now, from its read-out. The engine
// tracks these hints (shown, learned) but does not draw a second copy: the overlay owns their presentation.
import type { HintId } from '@/sim/types';
import type { FoundingUi } from '../../screens/founding/store';

const OF_ACTION: Record<string, HintId | undefined> = { inspect: 'hint-antennate', dig: 'hint-dig', tend: 'hint-timelapse', 'possess-next': 'hint-cycle' };

/**
 * The hint a glyph prompt of the opening overlay teaches, by the phase it is drawn in and its input action.
 * "Walk" (search phase) is the walking lesson; the `move` line of the sealing phase ("Move up the shaft, then seal",
 * drawn when the queen is stuck) is an instruction for right now and teaches nothing: it has no hint, so it is never
 * hidden as learned and never logged as a showing of hint-move.
 */
export function promptHintId(phase: string, action: string): HintId | undefined {
  if (action === 'move') return phase === 'search' ? 'hint-move' : undefined;
  return action === 'interact' ? (phase === 'seal' ? 'hint-seal' : phase === 'lay' ? 'hint-lay' : undefined) : OF_ACTION[action];
}

export function foundingShownHints(ui: FoundingUi | null): HintId[] {
  if (!ui) return [];
  const out = new Set<HintId>(foundingPromptHints(ui));
  if (ui.readiness && (ui.phase === 'dig' || ui.phase === 'seal')) out.add('hint-readiness');
  if (ui.queen && (ui.phase === 'search' || ui.phase === 'dig' || ui.phase === 'seal' || ui.phase === 'lay')) out.add('hint-reserves');
  if (ui.lapse) out.add('hint-timelapse');
  if (ui.handover) out.add('hint-cycle');
  return [...out];
}

/** The hints of the opening overlay's glyph PROMPTS (what Shift+H dismisses there); its gauges and banners are not prompts. */
export function foundingPromptHints(ui: FoundingUi | null): HintId[] {
  if (!ui) return [];
  const out = new Set<HintId>();
  for (const p of ui.prompts) {
    const id = promptHintId(ui.phase, p.action);
    if (id) out.add(id);
  }
  return [...out];
}
