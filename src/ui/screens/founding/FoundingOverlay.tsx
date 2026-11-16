// Root of the opening's screens (GDD 06 §5, GDD 08 §7.10, §9.2): picks what to show for the phase from the flow's
// read-out (store.ts), wires the keys of the script (any key skips the intro card; holding the tl-skip key 1 s skips
// the time-lapse) and injects the stylesheet once. Mounted by src/ui/App.tsx over the HUD.
import { useEffect } from 'preact/hooks';
import { currentBindings } from '../../components';
import { facade, snapshot } from '../../store';
import css from './founding.css?inline';
import { FailureCard, HandoverBanner, OutcomeCard } from './Cards';
import { IntroCard } from './IntroCard';
import { ClutchPanel, Prompts, QueenMeters, Readiness, SiteReadout } from './PlayPanels';
import { foundingActions, foundingUi } from './store';
import { TimelapseOverlay } from './TimelapseOverlay';

const STYLE_ID = 'foundress-founding-styles';
/** Holding the skip key this long skips the time-lapse (GDD 01 `tl-skip`), ms, at the default hold duration. */
const SKIP_HOLD_MS = 1000;

/** The skip hold at the player's hold duration (Settings > Controls); 0 when `tl-skip` is set to toggle: one press skips. */
function skipHoldMs(): number {
  if (currentBindings.value.holdToggle['tl-skip'] === 'toggle') return 0;
  const ms = facade.peek()?.getSettings?.().controls?.holdMs ?? 600;
  return SKIP_HOLD_MS * Math.min(2.5, Math.max(0.5, ms / 600));
}

function installStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = css;
  document.head.appendChild(el);
}

function skipCode(): string {
  const b = (currentBindings.value.kbm['tl-skip'] ?? []).find((x) => !!x && x.kind === 'key');
  return b && b.kind === 'key' ? b.code : 'Space';
}

function useScriptKeys(): void {
  useEffect(() => {
    let held: number | null = null;
    const down = (e: KeyboardEvent) => {
      const ui = foundingUi.peek(), a = foundingActions.peek();
      if (!ui || !a) return;
      if (ui.phase === 'intro-card') { a.skipIntro(); return; }
      if (ui.phase === 'timelapse' && e.code === skipCode() && held === null && !e.repeat) {
        held = window.setTimeout(() => { held = null; foundingActions.peek()?.skipLapse(); }, skipHoldMs());
      }
    };
    const up = (e: KeyboardEvent) => {
      if (held !== null && e.code === skipCode()) { window.clearTimeout(held); held = null; }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); if (held !== null) window.clearTimeout(held); };
  }, []);
}

/** Where the opening's overlay is drawn: in play, paused and on the failure epitaph, never in photo view (GDD 08 §7.9). */
export function foundingShown(screen: string, view: string): boolean {
  if (view === 'photo') return false;
  return screen === 'playing' || screen === 'paused' || screen === 'epitaph';
}

export function FoundingOverlay() {
  useEffect(installStyles, []);
  useScriptKeys();
  const ui = foundingUi.value;
  const a = foundingActions.value;
  const screen = snapshot.value.screen;
  // photo mode shows the world alone: the opening's panels are not rendered at all (no CSS hiding)
  if (!ui || !a || !foundingShown(screen, snapshot.value.view)) return null;
  if (screen === 'epitaph' && !ui.failure) return null;
  const reduced = ui.lapse?.reducedMotion ?? false;
  const p = ui.phase;
  const claustral = p === 'dealation' || p === 'search' || p === 'dig' || p === 'seal' || p === 'lay';
  return (
    <div class="fo-root" data-testid="founding-root" data-phase={p}>
      {p === 'intro-card' && <IntroCard ui={ui} reducedMotion={reduced} onSkip={() => a.skipIntro()} />}
      {claustral && ui.queen && <QueenMeters q={ui.queen} />}
      {(p === 'search' || p === 'dig') && ui.site && ui.site.active && <SiteReadout site={ui.site} />}
      {(p === 'dig' || p === 'seal') && ui.readiness && <Readiness r={ui.readiness} />}
      {p === 'lay' && ui.clutch && <ClutchPanel c={ui.clutch} />}
      {claustral && p !== 'dealation' && <Prompts ui={ui} onTend={() => a.beginLapse()} />}
      {p === 'timelapse' && ui.lapse && <TimelapseOverlay lapse={ui.lapse} onSkip={() => a.skipLapse()} />}
      {ui.outcome && <OutcomeCard o={ui.outcome} a={a} />}
      {!ui.outcome && ui.handover && <HandoverBanner h={ui.handover} a={a} />}
      {ui.failure && <FailureCard f={ui.failure} a={a} />}
    </div>
  );
}
