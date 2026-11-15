// The panels' part of the HUD layer: the marker palette (colony view), the overlay controls and legends, and the Journal and
// Codex book screens. The Colony health and Nest overview drawers are drawn by HudRoot beside Directives and Roster (one
// drawer at a time). Mounted inside the HUD root, so it only exists while a game is playing.
import { CodexBook } from '../codex/CodexBook';
import { JournalBook } from '../journal/JournalBook';
import { MarkerPalette } from '../markers/MarkerPalette';
import { OverlayControls } from '../../overlays/OverlayControls';
import { hudHiddenSlice, viewSlice } from '../../hud/slices';
import { openBook } from './state';

export function PanelsLayer() {
  const view = viewSlice.value;
  const hidden = hudHiddenSlice.value;
  const book = openBook.value;
  const colony = view === 'colony';
  return (
    <>
      {colony && !hidden && <MarkerPalette />}
      {!hidden && (colony || view === 'observer') && <OverlayControls panel={colony} />}
      {/* legends of overlays that were switched on by key stay visible in the possession view */}
      {!hidden && !(colony || view === 'observer') && <OverlayControls showButtons={false} />}
      {book === 'journal' && <JournalBook />}
      {book === 'codex' && <CodexBook onClose={() => { openBook.value = null; }} />}
    </>
  );
}
