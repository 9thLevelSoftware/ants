// The navigation layer's stylesheet, injected once (same pattern as src/ui/hud/styles.ts).
import css from './nav.css?inline';

export const NAV_STYLE_ID = 'foundress-nav-styles';

export function installNavStyles(doc: Document = document): HTMLStyleElement {
  const existing = doc.getElementById(NAV_STYLE_ID) as HTMLStyleElement | null;
  if (existing) return existing;
  const el = doc.createElement('style');
  el.id = NAV_STYLE_ID;
  el.textContent = css;
  doc.head.appendChild(el);
  return el;
}
