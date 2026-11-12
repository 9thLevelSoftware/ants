// Placeholder HUD: one line with date, speed and population, the current prompt, and toasts (ui-hud replaces it).
import type { UiSnapshot } from '../api';
import { facade } from '../store';

function speedLabel(s: UiSnapshot['speed']): string {
  if (!s) return '';
  if (s.manualClock) return 'stepped';
  if (s.paused) return 'paused';
  const lag = s.lagging ? ` (running at ${s.effective.toFixed(1)}×)` : '';
  return `${s.level}×${lag}`;
}

export function Hud({ snap }: { snap: UiSnapshot }) {
  const c = snap.colony;
  const pop = c ? `${c.workers} workers${c.queenAlive ? ' · queen' : ''} · brood ${c.brood.egg + c.brood.larva + c.brood.pupa}` : '';
  return (
    <>
      {!snap.hudHidden && (
        <div class="fd-hud" data-testid="hud-line">
          {snap.time?.label ?? ''} · {speedLabel(snap.speed)} · {pop}
        </div>
      )}
      {!snap.hudHidden && snap.prompt?.primary && <div class="fd-prompt">E {snap.prompt.primary}</div>}
      <div class="fd-toasts" aria-live="polite">
        {snap.toasts.map((t) => (
          <div key={t.id} class="fd-toast" role="status" onClick={() => facade.value?.dismissToast(t.id)}>{t.text}</div>
        ))}
      </div>
    </>
  );
}
