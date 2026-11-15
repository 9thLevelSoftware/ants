// The panels' stylesheet, injected once next to the shell's and the HUD's (same pattern as src/ui/hud/styles.ts), so the
// classic single-file build inlines it like the rest.
import css from './panels.css?inline';

export const PANELS_STYLE_ID = 'foundress-panels-styles';

export function installPanelsStyles(doc: Document = document): HTMLStyleElement {
  const existing = doc.getElementById(PANELS_STYLE_ID) as HTMLStyleElement | null;
  if (existing) return existing;
  const el = doc.createElement('style');
  el.id = PANELS_STYLE_ID;
  el.textContent = css;
  doc.head.appendChild(el);
  return el;
}
