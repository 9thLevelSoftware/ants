// Short game notices (a refusal, "paused: window lost focus", "speed stepped down"): the snapshot's toasts, top centre,
// clear of the middle of the screen. Click dismisses. Polite live region. Not the alert feed: these are not alerts.
import { facade } from '../store';
import { toastsSlice } from './slices';

export function Toasts() {
  const list = toastsSlice.value;
  return (
    <div class="fd-notices" aria-live="polite" data-testid="toasts">
      {list.map((t) => (
        <button key={t.id} type="button" class="fd-notice" onClick={() => facade.value?.dismissToast(t.id)} data-testid="toast">{t.text}</button>
      ))}
    </div>
  );
}
