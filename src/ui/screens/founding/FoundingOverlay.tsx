// Root of the opening's screens (GDD 06 §5, GDD 08 §7.10, §9.2): picks what to show for the phase from the flow's
// read-out (store.ts), wires the keys of the script (any key skips the intro card; holding the tl-skip key 1 s skips
// the time-lapse) and injects the stylesheet once. Mounted by src/ui/App.tsx over the HUD.
import { useEffect } from 'preact/hooks';
import { currentBindings } from '../../components';
import { snapshot } from '../../store';
import css from './founding.css?inline';
import { FailureCard, HandoverBanner, OutcomeCard } from './Cards';
import { IntroCard } from './IntroCard';
import { ClutchPanel, Prompts, QueenMeters, Readiness, SiteReadout } from './PlayPanels';
import { foundingActions, foundingUi } from './store';
import { TimelapseOverlay } from './TimelapseOverlay';

const STYLE_ID = 'foundress-founding-styles';
/** Holding the skip key this long skips the time-lapse (GDD 01 `tl-skip`), ms. */
const SKIP_HOLD_MS = 1000;

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
        held = window.setTimeout(() => { held = null; foundingActions.peek()?.skipLapse(); }, SKIP_HOLD_MS);
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

export function FoundingOverlay() {
  useEffect(installStyles, []);
  useScriptKeys();
  const ui = foundingUi.value;
  const a = foundingActions.value;
  const screen = snapshot.value.screen;
  if (!ui || !a || (screen !== 'playing' && screen !== 'paused' && screen !== 'epitaph')) return null;
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
