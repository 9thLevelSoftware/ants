// Getting a captured image to the player on hosts that may refuse every route (GDD 08 7.9, architecture §8): the page
// can sit in a sandboxed iframe without `allow-downloads`, `allow-popups` or clipboard permission. Every route is guarded
// and reports an outcome instead of throwing; the preview panel (always shown) is the route that cannot fail, because an
// <img> with the PNG can always be right-clicked. The environment is injected so the routes are tested in Node.
import { maybeFramed } from '../../save/download';

export type DownloadOutcome =
  /** The file download was triggered (the browser may still refuse it silently inside a sandboxed frame). */
  | 'started'
  /** Not tried: the page is known to block downloads (`?nodownload=1`) or there is no DOM. */
  | 'skipped'
  /** Tried and the browser threw. */
  | 'failed';

export interface AnchorLike {
  href: string;
  download: string;
  rel: string;
  style: { display: string };
  click(): void;
  remove(): void;
}

/** What the routes need from the page. */
export interface PhotoEnv {
  /** `?nodownload=1`: never try a file download. */
  noDownload: boolean;
  /** The page is inside a frame (downloads may be blocked there). */
  framed: boolean;
  createObjectURL?(b: Blob): string;
  revokeObjectURL?(u: string): void;
  /** A hidden <a> already appended to the document, or null without a DOM. */
  createAnchor?(): AnchorLike | null;
  open?(url: string): unknown;
  /**
   * False when new tabs cannot work here and trying would only make the browser log an error: a sandboxed frame without
   * `allow-same-origin` has an opaque origin and (in every shipping case) no `allow-popups`. Missing = unknown, try.
   */
  canOpenTab?: boolean;
  writeClipboardImage?(b: Blob): Promise<void>;
  setTimeout?(f: () => void, ms: number): unknown;
}

/** The page's real environment. */
export function browserEnv(): PhotoEnv {
  const w = typeof window !== 'undefined' ? window : null;
  return {
    noDownload: !!w && /[?&]nodownload=1\b/.test(w.location?.search ?? ''),
    framed: maybeFramed(),
    createObjectURL: (b) => URL.createObjectURL(b),
    revokeObjectURL: (u) => URL.revokeObjectURL(u),
    createAnchor: () => {
      if (typeof document === 'undefined') return null;
      const a = document.createElement('a');
      a.style.display = 'none';
      document.body.appendChild(a);
      return a;
    },
    canOpenTab: !opaqueOrigin(),
    open: (url) => {
      // No 'noopener' feature: with it window.open returns null even when the tab opened, which would read as a refusal.
      const w = window.open(url, '_blank');
      if (w) { try { w.opener = null; } catch { /* cross-origin handle: nothing to cut */ } }
      return w;
    },
    writeClipboardImage: async (b) => {
      const C = (globalThis as { ClipboardItem?: new (items: Record<string, Blob>) => unknown }).ClipboardItem;
      const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
      if (!C || !clip?.write) throw new Error('clipboard images are not supported');
      await clip.write([new C({ [b.type || 'image/png']: b }) as ClipboardItem]);
    },
    setTimeout: (f, ms) => setTimeout(f, ms),
  };
}

/** The page has an opaque origin (a sandboxed frame without `allow-same-origin`): its blob URLs read `blob:null/...`. */
export function opaqueOrigin(): boolean {
  if (typeof window === 'undefined') return false;
  try { return window.origin === 'null'; } catch { return false; }
}

/** A URL for the blob (object URL), or null when the page refuses. */
export function makeUrl(blob: Blob, env: PhotoEnv): string | null {
  try {
    return env.createObjectURL ? env.createObjectURL(blob) : null;
  } catch {
    return null;
  }
}

export function revokeUrl(url: string | null, env: PhotoEnv): void {
  if (!url) return;
  try { env.revokeObjectURL?.(url); } catch { /* nothing to free */ }
}

/** `<a download>` click. Never throws. */
export function tryDownload(blob: Blob, filename: string, env: PhotoEnv): DownloadOutcome {
  if (env.noDownload) return 'skipped';
  let url: string | null = null;
  try {
    const a = env.createAnchor?.() ?? null;
    url = makeUrl(blob, env);
    if (!a || !url) { revokeUrl(url, env); return 'skipped'; }
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    try { a.click(); } finally { try { a.remove(); } catch { /* already gone */ } }
    const u = url;
    env.setTimeout?.(() => revokeUrl(u, env), 30000);
    return 'started';
  } catch {
    revokeUrl(url, env);
    return 'failed';
  }
}

/** New tabs are known not to work here (see `PhotoEnv.canOpenTab`). */
export function tabsBlocked(env: PhotoEnv): boolean {
  return env.canOpenTab === false;
}

/** Opens the image in a new tab; false when the browser refuses (a popup blocker) or throws. Never tries where tabs are known blocked. */
export function openInNewTab(url: string | null, env: PhotoEnv): boolean {
  if (!url || !env.open || tabsBlocked(env)) return false;
  try {
    return !!env.open(url);
  } catch {
    return false;
  }
}

/** Copies the PNG to the clipboard; false when the browser refuses. */
export async function copyImage(blob: Blob, env: PhotoEnv): Promise<boolean> {
  try {
    if (!env.writeClipboardImage) return false;
    await env.writeClipboardImage(blob);
    return true;
  } catch {
    return false;
  }
}

/** The words the preview shows about the automatic download. */
export function downloadNote(o: DownloadOutcome, framed: boolean, filename: string): string {
  if (o === 'started' && !framed) return `Saved as ${filename}.`;
  if (o === 'started') return `Sent to your browser as ${filename}. If no file appeared, this page is inside a frame that blocks downloads: use Open in new tab, Copy, or right-click the image.`;
  return 'Your browser did not save a file here. Right-click the image to save it, or use Open in new tab or Copy.';
}
