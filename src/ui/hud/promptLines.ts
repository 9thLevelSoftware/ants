// Which prompt lines the HUD draws (GDD 01 9.2, GDD 08 5.3): up to three, the "Colony orders" line is never dropped.
import type { UiPromptLine } from '../api';

/** Input id of a prompt line (PromptInput) -> the rebindable action whose CURRENT binding the key cap shows. */
export const ACTION_OF: Record<string, string> = {
  interact: 'interact', 'interact-hold': 'interact', dig: 'dig', 'share-food': 'share-food', foot: 'foot', inspect: 'inspect', directives: 'directives',
};

/** The lines to draw: primary, secondary, then the key lines; at most `max`, the Colony orders line always kept (last). */
export function visibleLines(lines: readonly UiPromptLine[], max = 3): UiPromptLine[] {
  const orders = lines.find((l) => l.input === 'directives');
  const rest = lines.filter((l) => l.input !== 'directives').slice(0, orders ? max - 1 : max);
  return orders ? [...rest, orders] : rest;
}
