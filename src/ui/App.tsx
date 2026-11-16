// UI root (composition root of src/ui): the shell's screen router (title, new colony, loading, pause, settings,
// save/load, codex, credits, epitaph, errors), the HUD while playing and the opening sequence's overlay. Keep this
// file to composition; each part decides for itself when it shows.
import { render } from 'preact';
import { HudRoot } from './hud';
import { OnboardingPrompts } from './hud/prompts';
import { FoundingOverlay } from './screens/founding';
import { PhotoScreen } from './screens/photo';
import { ScreenRouter } from './screens';
import { WinterOverlay } from './screens/overwinter';
import { FlightOverlay } from './screens/flight';
import { EpitaphScreen } from './screens/epitaph';
import { LineageScreen } from './screens/lineage';

export function App() {
  return (
    <>
      <HudRoot />
      <FoundingOverlay />
      <OnboardingPrompts />
      <PhotoScreen />
      <ScreenRouter />
      <WinterOverlay />
      <FlightOverlay />
      <EpitaphScreen />
      <LineageScreen />
    </>
  );
}

/** Mounts the UI on #ui (the router installs the design system's stylesheet, UI scale and key handling itself). */
export function mountUi(root: HTMLElement): void {
  render(<App />, root);
}
