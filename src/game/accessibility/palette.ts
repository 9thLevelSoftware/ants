// Colour-blind-safe status colours (GDD 08 2.1, 2.6, 10.1). The overlay palette itself is applied by the fx renderer
// (stage2Wiring.installOverlayHost); this is its counterpart for the UI's status tokens. The default tokens stay as the
// GDD gives them in the default `okabe-ito` palette (status is never colour alone: shape and word, GDD 2.6). The other
// two palettes are for players who need more than that: `high-contrast` uses white and the accent yellow only,
// `pattern-only` one ink, so shape and word carry the meaning completely.
export type OverlayPalette = 'okabe-ito' | 'high-contrast' | 'pattern-only';

export const STYLE_ID = 'foundress-a11y-styles';

/** The stylesheet: token overrides per palette, keyed by the `data-palette` attribute on <html>. */
export function paletteCss(): string {
  return `
:root[data-palette="high-contrast"] {
  --c-status-ok: #FFFFFF; --c-status-watch: #FFD400; --c-status-warn: #FFD400; --c-status-bad: #FFFFFF;
  --c-info: #FFFFFF; --c-nutrient-c: #FFD400; --c-nutrient-p: #FFFFFF;
}
:root[data-palette="pattern-only"] {
  --c-status-ok: var(--c-text); --c-status-watch: var(--c-text); --c-status-warn: var(--c-text); --c-status-bad: var(--c-text);
  --c-info: var(--c-text); --c-nutrient-c: var(--c-text); --c-nutrient-p: var(--c-text);
}
`;
}

export function installPaletteStyles(doc: Document): HTMLStyleElement {
  const existing = doc.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (existing) return existing;
  const el = doc.createElement('style');
  el.id = STYLE_ID;
  el.textContent = paletteCss();
  doc.head.appendChild(el);
  return el;
}

export function applyPalette(doc: Document, palette: OverlayPalette): void {
  installPaletteStyles(doc);
  doc.documentElement.dataset.palette = palette;
}
