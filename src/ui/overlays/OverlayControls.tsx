// Overlay controls (GDD 08 4.3, 10.1): a column of five toggle buttons (scent, temperature, moisture, threats, dig plans) at
// the left edge, and the legend of what is on. Scent combines with one of the others; the others replace each other. The
// keys are the bound actions (V toggles scent, O cycles the rest), shown from the current bindings.
import { Icon } from '../icons';
import { cx } from '../components/cx';
import { currentBindings, hintLabel } from '../components/KeyHint';
import { markersSlice } from '../panels/wiring/slices';
import { isActive, OVERLAY_ACTION, OVERLAY_IDS, OVERLAY_WORD, type OverlayId } from './catalogue';
import { LegendCard } from './Legend';
import { overlays, toggleOverlay } from './state';

/** `panel`: the buttons are part of the colony view's tool UI and take Tab; elsewhere they are HUD chips (keys V and O). */
export function OverlayControls({ showButtons = true, panel = false }: { showButtons?: boolean; panel?: boolean }) {
  const s = overlays.value;
  const m = markersSlice.value;
  const active = OVERLAY_IDS.filter((id) => isActive(s, id));
  const bindings = currentBindings.value;
  return (
    <>
      {showButtons && (
        <div class={cx('ov-controls', panel && 'pn-panel')} role="toolbar" aria-label="Overlays" data-testid="overlay-controls">
          {OVERLAY_IDS.map((id: OverlayId) => {
            const on = isActive(s, id);
            const key = hintLabel(bindings, OVERLAY_ACTION[id]);
            return (
              <button
                key={id} type="button" class={cx('ov-btn', on && 'is-on')} data-overlay={id} aria-pressed={on ? 'true' : 'false'}
                aria-label={`${OVERLAY_WORD[id]} overlay${key ? `, key ${key}` : ''}`} title={`${OVERLAY_WORD[id]}${key ? ` (${key})` : ''}`} onMouseDown={panel ? (e: MouseEvent) => e.preventDefault() : undefined} onClick={() => toggleOverlay(id)}
              >
                <Icon name={id === 'scent' ? 'overlay-scent' : `overlay-${id}`} size={22} decorative />
              </button>
            );
          })}
        </div>
      )}
      {active.length > 0 && (
        <div class={cx('ov-legends', !showButtons && 'is-alone')} data-testid="overlay-legends">
          {active.map((id) => <LegendCard key={id} id={id} comfort={m?.comfortBand ?? null} plans={m?.plans ?? []} />)}
        </div>
      )}
    </>
  );
}
