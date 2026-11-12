// UI root (composition root of src/ui): routes on the snapshot's screen and draws the HUD while playing. Later
// tasks replace the boot placeholders screen by screen; keep this file to routing.
import { render } from 'preact';
import { BOOT_CSS, Epitaph, ErrorOverlay, Loading, PauseMenu, Title, Unsupported } from './boot';
import { HudRoot } from './hud';
import { snapshot } from './store';

export function App() {
  const s = snapshot.value;
  return (
    <>
      {s.screen === 'unsupported' && <Unsupported />}
      {s.screen === 'title' && <Title />}
      {s.screen === 'loading' && <Loading loading={s.loading} />}
      <HudRoot />
      {s.screen === 'paused' && <PauseMenu />}
      {s.screen === 'epitaph' && <Epitaph e={s.epitaph} />}
      {s.error && <ErrorOverlay text={s.error} />}
    </>
  );
}

/** Mounts the UI on #ui (with the placeholder stylesheet). */
export function mountUi(root: HTMLElement): void {
  const style = document.createElement('style');
  style.textContent = BOOT_CSS;
  document.head.appendChild(style);
  render(<App />, root);
}
