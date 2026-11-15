// UI root (composition root of src/ui): the shell's screen router (title, new colony, loading, pause, settings,
// save/load, codex, credits, epitaph, errors), the HUD while playing and the opening sequence's overlay. Keep this
// file to composition; each part decides for itself when it shows.
import { render } from 'preact';
import { HudRoot } from './hud';
import { FoundingOverlay } from './screens/founding';
import { ScreenRouter } from './screens';

export function App() {
  return (
    <>
      <HudRoot />
      <FoundingOverlay />
      <ScreenRouter />
    </>
  );
}

/** Mounts the UI on #ui (the router installs the design system's stylesheet, UI scale and key handling itself). */
export function mountUi(root: HTMLElement): void {
  render(<App />, root);
}
