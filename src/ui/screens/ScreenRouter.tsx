// Screen routing (GDD 01 1.1, GDD 08 3.1): the game's mode in the snapshot picks the base screen (boot, title,
// loading, pause, epitaph, unsupported); the book screens that open over the title or the pause menu come from the
// small navigation stack in nav.ts. The HUD is not drawn here (a later task): while `playing` this renders only the
// error overlay when there is one. Installing the stylesheet, scale, key handling and gamepad navigation happens once.
import { useEffect, useRef, useState } from 'preact/hooks';
import { facade, snapshot } from '../store';
import { installEnvironment } from '../styles';
import { computeScale } from '../styles/scale';
import { uiPrefs } from '../styles/prefs';
import { Credits } from './credits/Credits';
import { startBindingSync } from './gameSync';
import { startGamepadNav } from './gamepadNav';
import { Loading } from './Loading';
import { installMenuKeys } from './menuKeys';
import { activeOverlay, baseScreen, closeTop, nav, onModeChange, updateNav, type OverlayId } from './nav';
import { NewGame } from './newgame/NewGame';
import { Pause } from './Pause';
import { SaveLoad } from './saves/SaveLoad';
import { Settings } from './settings/Settings';
import { BookPlaceholder, BootGate, EpitaphCard, ErrorOverlay, Unsupported } from './Simple';
import { Title } from './Title';

/** Backdrop blur is a High / Ultra feature (GDD 08 2.3). */
function blurWanted(): boolean {
  const q = facade.value?.getSettings().graphics.quality;
  return q === 'high' || q === 'ultra';
}

function TooSmall() {
  return (
    <div class="ui-toosmall" role="alert" data-testid="too-small">
      <div>
        <h1 class="ui-h1">Window too small</h1>
        <p class="ui-subtitle">Make the window larger to keep playing. The game is paused meanwhile.</p>
      </div>
    </div>
  );
}

function renderOverlay(id: OverlayId) {
  const close = () => updateNav(closeTop);
  const n = nav.value;
  switch (id) {
    case 'new-game': return <NewGame onClose={close} />;
    case 'settings': return <Settings tab={n.settingsTab} onTab={(settingsTab) => updateNav((s) => ({ ...s, settingsTab }))} onClose={close} />;
    case 'save-load': return <SaveLoad tab={n.saveTab} onTab={(saveTab) => updateNav((s) => ({ ...s, saveTab }))} onClose={close} />;
    case 'credits': return <Credits onClose={close} />;
    case 'codex': return <BookPlaceholder kind="codex" onClose={close} />;
    case 'lineage': return <BookPlaceholder kind="lineage" onClose={close} />;
  }
}

/** Props that mark a layer inert while another is open (focus stays on the top layer; Tab cannot reach below). */
const inertIf = (on: boolean): { inert?: boolean } => (on ? { inert: true } : {});

export function ScreenRouter() {
  const snap = snapshot.value;
  const navState = nav.value;
  const overlay = activeOverlay(snap.screen, navState);
  const base = baseScreen(snap.screen);
  const prev = useRef(snap.screen);
  const prefs = uiPrefs.prefs.value;
  // the "Window too small" notice follows the window, so the size is state that the resize handler updates
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onResize = () => setViewport((v) => (v.w === window.innerWidth && v.h === window.innerHeight ? v : { w: window.innerWidth, h: window.innerHeight }));
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const scale = computeScale({ viewportW: viewport.w, viewportH: viewport.h, uiScale: prefs.accessibility.uiScale, textScale: prefs.accessibility.textScale });

  useEffect(() => installEnvironment(window, blurWanted), []);
  useEffect(() => installMenuKeys(window), []);
  useEffect(() => startGamepadNav(), []);
  useEffect(() => startBindingSync(), []);
  useEffect(() => {
    if (prev.current !== snap.screen) {
      updateNav((n) => onModeChange(n, prev.current, snap.screen));
      prev.current = snap.screen;
    }
  }, [snap.screen]);

  return (
    <div class="ui-root" data-testid="ui-root">
      {/* an error overlay makes everything below it inert (focus and Tab stay on the overlay) */}
      <div class="ui-layers" {...inertIf(!!snap.error)}>
        {base === 'boot' && <BootGate />}
        {base === 'unsupported' && <Unsupported />}
        {base === 'title' && <Title {...inertIf(!!overlay)} />}
        {base === 'loading' && <Loading loading={snap.loading} />}
        {base === 'pause' && <Pause {...inertIf(!!overlay)} />}
        {base === 'epitaph' && <EpitaphCard e={snap.epitaph} inert={!!overlay} />}
        {overlay && renderOverlay(overlay)}
        {scale.layout === 'too-small' && <TooSmall />}
      </div>
      {snap.error && <ErrorOverlay text={snap.error} />}
    </div>
  );
}
