// The small full-screen states: boot gate, unsupported browser, error overlay, minimal epitaph card, and the book
// placeholders for screens other tasks own (Codex, Lineage).
import { useRef } from 'preact/hooks';
import { FOUNDRESS_VERSION } from '@/core/version';
import { BookPage, Button, EmptyState, ProgressBar, useFocusScope } from '../components';
import { facade, snapshot } from '../store';
import type { UiSnapshot } from '../api';

export function BootGate() {
  return (
    <div class="ui-screen ui-boot" data-screen="boot">
      <h1 class="ui-wordmark">FOUNDRESS</h1>
      <p class="ui-subtitle">A naturalistic ant colony sandbox</p>
      <div class="ui-boot-line"><ProgressBar value={0.5} thin aria-label="Starting" valueText="Starting" class="is-indeterminate" /></div>
      <p class="ui-title-foot ui-chip-scrim">v{FOUNDRESS_VERSION}</p>
    </div>
  );
}

/** No WebGL 2 (GDD 01 1.1 `unsupported`): what is needed, and no retry loop. */
export function Unsupported() {
  return (
    <div class="ui-screen ui-unsupported" role="alert" data-screen="unsupported">
      <div class="ui-statecard ui-surface is-elevated">
        <h1 class="ui-wordmark is-small">FOUNDRESS</h1>
        <h2 class="ui-h2">This browser cannot run the game</h2>
        <p>FOUNDRESS draws its world with WebGL 2, and this browser or page does not provide it.</p>
        <ul class="ui-bullets">
          <li>Use a current version of Chrome, Edge, Firefox or Safari.</li>
          <li>Turn on hardware acceleration in the browser settings.</li>
          <li>If the game is embedded in another page, open it in its own tab.</li>
        </ul>
      </div>
    </div>
  );
}

/** Uncaught errors and unhandled rejections: the message instead of a blank page. */
export function ErrorOverlay({ text }: { text: string }) {
  const root = useRef<HTMLDivElement>(null);
  useFocusScope(root, { trap: true, initial: '[data-testid=error-reload]', restore: false });
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); } catch { /* the text stays selectable on screen */ }
  };
  return (
    <div ref={root} class="ui-screen ui-error" role="alertdialog" aria-modal="true" aria-label="Something went wrong" data-testid="error-overlay">
      <div class="ui-statecard ui-surface is-elevated">
        <h2 class="ui-h2">Something went wrong</h2>
        <p>The game hit an error it could not recover from. Reloading starts it again; your last save is not affected.</p>
        <pre class="ui-errortext" tabIndex={0}>{text}</pre>
        <div class="ui-inline">
          <Button variant="primary" onClick={() => location.reload()} data-testid="error-reload">Reload</Button>
          <Button variant="ghost" icon="copy" onClick={() => void copy()}>Copy details</Button>
        </div>
      </div>
    </div>
  );
}

/** Epitaph, T1 minimal (GDD 01 1.1): the colony has died, its age, peak population and cause; New colony / Title. */
export function EpitaphCard({ e, inert }: { e: UiSnapshot['epitaph']; inert?: boolean }) {
  const f = facade.value;
  const root = useRef<HTMLDivElement>(null);
  useFocusScope(root, { trap: true, initial: '[data-testid=epitaph-new]', restore: false });
  return (
    <div ref={root} class="ui-screen ui-epitaph" inert={inert} data-screen="epitaph">
      <div class="ui-statecard ui-surface is-elevated" role="dialog" aria-label="The colony has died">
        <h1 class="ui-h1">The colony has died</h1>
        {e && <p>{e.ageDays} days old · peak {e.peakWorkers} workers · {e.cause}</p>}
        <div class="ui-inline">
          <Button variant="primary" onClick={() => { void f?.newGame({}); }} data-testid="epitaph-new">New colony</Button>
          <Button onClick={() => f?.quitToTitle()} data-testid="epitaph-title">Title</Button>
        </div>
      </div>
    </div>
  );
}

/** Codex and Lineage are later tasks; their entry points open this empty page so every route is complete. */
export function BookPlaceholder({ kind, onClose }: { kind: 'codex' | 'lineage'; onClose: () => void }) {
  const codex = kind === 'codex';
  return (
    <BookPage title={codex ? 'Codex' : 'Lineage'} onClose={onClose}>
      <EmptyState icon={codex ? 'codex' : 'lineage'} title={codex ? 'No field notes yet' : 'No colonies recorded yet'}>
        {codex ? 'Entries unlock as you observe your colony.' : 'Colonies you found, and their daughters, are recorded here.'}
      </EmptyState>
    </BookPage>
  );
}

/** Exposed so callers outside the router (tests, the demo) can read the current screen id. */
export function currentScreenId(): string {
  return snapshot.value.screen;
}
