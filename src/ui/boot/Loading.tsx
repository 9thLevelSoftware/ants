// Placeholder loading screen: phase name and progress bar; on failure the cause and a Back button.
import type { UiLoading } from '../api';
import { facade } from '../store';

export function Loading({ loading }: { loading: UiLoading | null }) {
  const l = loading ?? { phase: 'Loading', progress: 0, attempt: 1, maxAttempts: 1, error: null };
  return (
    <div class="fd-screen" role="status" aria-live="polite">
      <p>{l.error ? 'This seed would not produce a viable locality' : l.phase}</p>
      {l.error ? <pre>{l.error}</pre> : <div class="fd-bar"><div style={{ width: `${Math.round(l.progress * 100)}%` }} /></div>}
      {l.error && <button class="fd-btn" type="button" onClick={() => facade.value?.quitToTitle()}>Back</button>}
    </div>
  );
}
