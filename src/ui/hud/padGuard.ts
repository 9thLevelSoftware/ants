// The shell's gamepad navigation (screens/gamepadNav.ts) sends a synthetic arrow key to the focused control first. A
// slider answers ArrowUp / ArrowDown by changing its value, so a pad moving down through a drawer would nudge every
// slider it passes. Wrap sliders in this guard: synthetic (untrusted) vertical arrows are marked handled and dropped
// before they reach the slider, while a real keyboard still adjusts it with all four arrows.
export function blockSyntheticVertical(e: KeyboardEvent): void {
  if (e.isTrusted || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
  e.stopPropagation();
  e.preventDefault();
}
