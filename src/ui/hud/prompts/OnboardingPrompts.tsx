// Mounts the onboarding hints (GDD 08 §9): creates the controller when the game exists, feeds it the UI snapshot,
// the UI state it cannot see (open drawer, overlays, what the opening overlay draws), pointer drags and Shift+H, and
// draws the hint card. Registered once in src/ui/App.tsx.
import { useEffect } from 'preact/hooks';
import { effect, untracked } from '@preact/signals';
import { HINT_DRAG_MIN_PX, HINT_LOCKED_LOOK_PX, HINT_PALETTE_PULSE_MS, OnboardingController, type OnboardingGame, type UiFacts } from '@/game/onboarding';
import { facade, snapshot } from '../../store';
import { foundingUi } from '../../screens/founding/store';
import { overlays } from '../../overlays/state';
import { screenSlice } from '../slices';
import { matchesAction } from '../hotkeys';
import { openDrawer } from '../state';
import { blockingCardUp } from '../blockingCard';
import { installOnboardingDebug } from './debug';
import { foundingPromptHints, foundingShownHints } from './foundingShown';
import { HintCard } from './HintCard';
import { hintView, onboarding } from './state';
import css from './hint.css?inline';

const STYLE_ID = 'foundress-hint-styles';

function installStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = css;
  document.head.appendChild(el);
}

/** The UI state the engine's facts need. */
function uiFacts(): UiFacts {
  const o = overlays.peek();
  return { drawer: openDrawer.peek(), overlayScent: o.scent, overlayOther: o.other !== null, foundingShown: foundingShownHints(foundingUi.peek()) };
}

/** Camera drags on the canvas (press, move at least HINT_DRAG_MIN_PX, release) and mouse look under pointer lock. */
function watchDrags(onDrag: () => void): () => void {
  let down: { x: number; y: number; far: boolean } | null = null;
  let locked = 0;
  const onDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement | null)?.id === 'view') down = { x: e.clientX, y: e.clientY, far: false };
  };
  const onMove = (e: PointerEvent) => {
    if (down && !down.far && Math.hypot(e.clientX - down.x, e.clientY - down.y) >= HINT_DRAG_MIN_PX) down.far = true;
    if (document.pointerLockElement) {
      locked += Math.hypot(e.movementX, e.movementY);
      if (locked >= HINT_LOCKED_LOOK_PX) { locked = 0; onDrag(); }
    }
  };
  const onUp = () => {
    if (down?.far) onDrag();
    down = null;
  };
  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('pointercancel', onUp, true);
  return () => {
    window.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', onUp, true);
    window.removeEventListener('pointercancel', onUp, true);
  };
}

const isEditable = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
};

/**
 * Dismisses the teaching hint on screen: the card, or when there is none the opening overlay's prompts. Runs for the
 * `dismiss-hint` action (Shift+H on the keyboard, RB + View on the pad: the nav layer calls it for the pad). True when
 * a game is running (the action is then always taken, so it never falls through to another one).
 */
export function dismissHintNow(): boolean {
  const c = onboarding.peek();
  if (!c) return false;
  if (!c.dismiss()) c.dismissExternal(foundingPromptHints(foundingUi.peek()));
  return true;
}

/**
 * The keyboard half of `dismiss-hint` (rebindable, Shift+H by default). The key is always taken while a game runs, so a
 * Shift+H with nothing to dismiss never toggles the HUD (H). Captured before the game's input.
 */
function watchDismissKey(ctl: () => OnboardingController | null): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.altKey || e.metaKey || isEditable(e.target) || !matchesAction(e, 'dismiss-hint')) return;
    if (!ctl()) return;
    dismissHintNow();
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  window.addEventListener('keydown', onKey, true);
  return () => window.removeEventListener('keydown', onKey, true);
}

const reducedMotion = (): boolean => document.documentElement.dataset.motion === 'reduced' || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** The colony view's marker palette pulses once when hint-marker shows (a static outline in reduced motion, see hint.css). */
function watchPalettePulse(): () => void {
  let timer = 0;
  const clear = () => {
    window.clearTimeout(timer);
    document.querySelectorAll('.hn-palette-pulse').forEach((el) => el.classList.remove('hn-palette-pulse'));
  };
  const stop = effect(() => {
    const v = hintView.value;
    if (v?.id !== 'hint-marker') { clear(); return; }
    const el = document.querySelector<HTMLElement>('[data-testid="marker-palette"]');
    if (!el || el.classList.contains('hn-palette-pulse')) return;
    el.classList.add('hn-palette-pulse');
    window.clearTimeout(timer);
    if (!reducedMotion()) timer = window.setTimeout(() => el.classList.remove('hn-palette-pulse'), HINT_PALETTE_PULSE_MS);
  });
  return () => { stop(); clear(); };
}

function useOnboarding(): void {
  useEffect(() => {
    installStyles();
    const test = new URLSearchParams(location.search).get('test') === '1';
    let ctl: OnboardingController | null = null;
    let unsub: (() => void) | null = null;
    const stops: (() => void)[] = [];
    const bind = (game: OnboardingGame | null) => {
      unsub?.(); unsub = null;
      ctl?.dispose(); ctl = null;
      onboarding.value = null;
      hintView.value = null;
      if (!game) return;
      ctl = new OnboardingController({ game, snapshot: () => snapshot.peek(), ui: uiFacts, manual: test }); // ?test=1 is the manual clock
      unsub = ctl.subscribe((v) => { hintView.value = v; });
      onboarding.value = ctl;
    };
    stops.push(effect(() => { const f = facade.value; untracked(() => bind(f as unknown as OnboardingGame | null)); }));
    stops.push(effect(() => { void snapshot.value; untracked(() => ctl?.tick()); }));
    stops.push(effect(() => { void openDrawer.value; void overlays.value; void foundingUi.value; untracked(() => ctl?.tick()); }));
    stops.push(watchDrags(() => ctl?.noteDrag()));
    stops.push(watchDismissKey(() => ctl));
    stops.push(watchPalettePulse());
    if (test) stops.push(installOnboardingDebug(() => ctl));
    return () => { stops.forEach((s) => s()); unsub?.(); ctl?.dispose(); onboarding.value = null; hintView.value = null; };
  }, []);
}

export function OnboardingPrompts() {
  useOnboarding();
  const view = hintView.value;
  const screen = screenSlice.value;
  if (!view || screen !== 'playing') return null;
  if (blockingCardUp()) return null; // the hint waits for the card that holds the top centre (intro, hand-over, winter, flight)
  return <HintCard view={view} onDismiss={() => onboarding.peek()?.dismiss()} />;
}
