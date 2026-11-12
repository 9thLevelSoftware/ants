// The shell's stylesheet and the document-level settings that go with it: tokens, bundled fonts, base, components
// and screens CSS as one injected <style>, plus UI scale, layout mode, contrast, font and motion applied to <html>.
import { effect } from '@preact/signals';
import baseCss from './base.css?inline';
import componentsCss from './components.css?inline';
import screensCss from './screens.css?inline';
import { fontFaceCss } from './fonts';
import { applyScale, computeScale, type ScaleResult } from './scale';
import type { MotionChoice, UiPrefs } from './prefs';
import { uiPrefs } from './prefs';
import { tokensCss } from './tokens';

export { uiPrefs, defaultPrefs, createPrefsStore, type UiPrefs } from './prefs';
export { computeScale, type ScaleResult, type LayoutMode } from './scale';
export { contrastReport } from './contrast';

export const STYLE_ELEMENT_ID = 'foundress-ui-styles';

/** All CSS of the shell, in cascade order. */
export function uiCss(): string {
  return [tokensCss(), fontFaceCss(), baseCss, componentsCss, screensCss].join('\n');
}

/** Injects the stylesheet once (idempotent). Returns the element. */
export function installStyles(doc: Document = document): HTMLStyleElement {
  const existing = doc.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (existing) return existing;
  const el = doc.createElement('style');
  el.id = STYLE_ELEMENT_ID;
  el.textContent = uiCss();
  doc.head.appendChild(el);
  return el;
}

/** Reduced motion in effect: the player's choice, or the device's `prefers-reduced-motion` for System. */
export function effectiveReducedMotion(choice: MotionChoice): boolean {
  if (choice === 'on') return true;
  if (choice === 'off') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Writes scale, layout mode, contrast, font and motion onto <html>. Returns the computed scale. */
export function applyPrefsToDocument(doc: Document, prefs: UiPrefs, viewport: { w: number; h: number }): ScaleResult {
  const a = prefs.accessibility;
  const scale = computeScale({ viewportW: viewport.w, viewportH: viewport.h, uiScale: a.uiScale, textScale: a.textScale });
  const root = doc.documentElement;
  applyScale(root, scale);
  root.dataset.contrast = a.highContrast ? 'high' : 'normal';
  root.dataset.font = a.font;
  root.dataset.motion = effectiveReducedMotion(a.reducedMotion) ? 'reduced' : 'normal';
  return scale;
}

/**
 * Keeps <html> in step with the preferences and the window size. `blur` says whether backdrop blur is on (High and
 * Ultra only, GDD 08 2.3). Returns the uninstaller.
 */
export function installEnvironment(win: Window = window, blur: () => boolean = () => false): () => void {
  const doc = win.document;
  installStyles(doc);
  const apply = () => {
    applyPrefsToDocument(doc, uiPrefs.prefs.value, { w: win.innerWidth, h: win.innerHeight });
    doc.documentElement.dataset.blur = blur() ? 'on' : 'off';
  };
  apply();
  const stop = effect(apply);
  win.addEventListener('resize', apply);
  const mq = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  mq?.addEventListener?.('change', apply);
  return () => {
    stop();
    win.removeEventListener('resize', apply);
    mq?.removeEventListener?.('change', apply);
  };
}
