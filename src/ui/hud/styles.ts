// The HUD's stylesheet, injected once next to the shell's (src/ui/styles). Kept separate so the HUD can be loaded
// without the screens, and so the classic single-file build inlines it like the rest.
import css from './hud.css?inline';

export const HUD_STYLE_ID = 'foundress-hud-styles';

export function installHudStyles(doc: Document = document): HTMLStyleElement {
  const existing = doc.getElementById(HUD_STYLE_ID) as HTMLStyleElement | null;
  if (existing) return existing;
  const el = doc.createElement('style');
  el.id = HUD_STYLE_ID;
  el.textContent = css;
  doc.head.appendChild(el);
  return el;
}
