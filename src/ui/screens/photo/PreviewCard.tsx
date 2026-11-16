// The captured image and what can be done with it (GDD 08 7.9 download fallback, architecture §8). The page may sit in a
// sandboxed frame where downloads, new tabs and the clipboard are refused; the image shown here can always be
// right-clicked, so nothing depends on the guarded routes. Each button reports what happened in words.
import { Button } from '../../components';
import type { PhotoActions, PhotoPreviewUi } from './store';

function kb(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function PreviewCard({ p, a }: { p: PhotoPreviewUi; a: PhotoActions }) {
  const blocked = p.download !== 'started';
  return (
    <section class="ph-preview ui-surface" aria-label="Captured photo" data-testid="photo-preview" data-download={p.download}>
      <header class="ph-preview-head">
        <h2 class="ph-title">Photo taken</h2>
        <span class="ph-dim">{p.width} × {p.height} · {kb(p.bytes)}{p.scale > 1 ? ' · 2x' : ''}</span>
      </header>
      {p.url
        ? <img class="ph-preview-img" src={p.url} alt="The captured photo. Right-click to save it." width={p.width} height={p.height} data-testid="photo-preview-img" />
        : <p class="ph-note is-warn">The image could not be shown here.</p>}
      <p class={`ph-note${blocked ? ' is-warn' : ''}`} data-testid="photo-preview-note">{p.note}</p>
      {p.reduced && <p class="ph-note">This GPU cannot render the 2x size; the photo is at the screen size.</p>}
      {p.message && <p class="ph-note" role="status" data-testid="photo-preview-message">{p.message}</p>}
      <div class="ph-row">
        <Button variant="secondary" icon="save" onClick={() => a.saveAgain()} data-testid="photo-save">Save PNG</Button>
        <Button variant="secondary" icon="jump-to" onClick={() => a.openInTab()} disabled={!p.canOpenTab}
          disabledReason={p.url ? 'This page sits in a frame that does not allow new tabs. Right-click the image to save it.' : undefined} data-testid="photo-open">Open in new tab</Button>
        <Button variant="secondary" icon="copy" onClick={() => void a.copyImage()} data-testid="photo-copy">Copy</Button>
        <Button variant="ghost" icon="close" onClick={() => a.closePreview()} data-testid="photo-preview-close">Close</Button>
      </div>
    </section>
  );
}
