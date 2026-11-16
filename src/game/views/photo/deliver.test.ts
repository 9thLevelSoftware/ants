// The delivery routes never throw, whatever the host refuses (task photo acceptance 3).
import { afterEach, describe, expect, it } from 'vitest';
import { browserEnv, copyImage, downloadNote, makeUrl, openInNewTab, tabsBlocked, tryDownload, type AnchorLike, type PhotoEnv } from './deliver';

const blob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });

function anchor(click: () => void): AnchorLike & { removed: boolean } {
  return { href: '', download: '', rel: '', style: { display: '' }, removed: false, click, remove() { this.removed = true; } };
}
function env(over: Partial<PhotoEnv> = {}): PhotoEnv & { revoked: string[]; timers: (() => void)[] } {
  const revoked: string[] = [], timers: (() => void)[] = [];
  return {
    noDownload: false, framed: false, revoked, timers,
    createObjectURL: () => 'blob:mock/1', revokeObjectURL: (u) => { revoked.push(u); }, setTimeout: (f) => { timers.push(f); return 0; },
    ...over,
  };
}

describe('download', () => {
  it('clicks a hidden anchor with the file name and revokes the URL later', () => {
    const a = anchor(() => {});
    const e = env({ createAnchor: () => a });
    expect(tryDownload(blob, 'x.png', e)).toBe('started');
    expect(a.href).toBe('blob:mock/1'); expect(a.download).toBe('x.png'); expect(a.removed).toBe(true);
    e.timers[0]();
    expect(e.revoked).toEqual(['blob:mock/1']);
  });
  it('an anchor click that throws (a host that blocks downloads) is caught', () => {
    const a = anchor(() => { throw new DOMException('Blocked', 'SecurityError'); });
    const e = env({ createAnchor: () => a });
    expect(() => tryDownload(blob, 'x.png', e)).not.toThrow();
    expect(tryDownload(blob, 'x.png', e)).toBe('failed');
    expect(a.removed).toBe(true);
    expect(e.revoked.length).toBeGreaterThan(0);
  });
  it('?nodownload=1 and a page without DOM or object URLs are skipped without trying', () => {
    let clicks = 0;
    expect(tryDownload(blob, 'x.png', env({ noDownload: true, createAnchor: () => anchor(() => { clicks++; }) }))).toBe('skipped');
    expect(clicks).toBe(0);
    expect(tryDownload(blob, 'x.png', env({ createAnchor: () => null }))).toBe('skipped');
    expect(tryDownload(blob, 'x.png', env({ createObjectURL: () => { throw new Error('no'); }, createAnchor: () => anchor(() => {}) }))).toBe('skipped');
  });
});

describe('open in new tab and copy', () => {
  it('a refused popup (null) or a throwing open is a false, not an error', () => {
    expect(openInNewTab('blob:x', env({ open: () => null }))).toBe(false);
    expect(openInNewTab('blob:x', env({ open: () => { throw new Error('sandbox'); } }))).toBe(false);
    expect(openInNewTab('blob:x', env({ open: () => ({}) }))).toBe(true);
    expect(openInNewTab(null, env({ open: () => ({}) }))).toBe(false);
  });
  it('clipboard refusal is a false', async () => {
    expect(await copyImage(blob, env({ writeClipboardImage: () => Promise.reject(new DOMException('NotAllowed')) }))).toBe(false);
    expect(await copyImage(blob, env({ writeClipboardImage: () => { throw new Error('sync'); } }))).toBe(false);
    expect(await copyImage(blob, env())).toBe(false);
    expect(await copyImage(blob, env({ writeClipboardImage: async () => {} }))).toBe(true);
  });
  it('makeUrl gives null when the page refuses object URLs', () => {
    expect(makeUrl(blob, env({ createObjectURL: () => { throw new Error('no'); } }))).toBeNull();
    expect(makeUrl(blob, env())).toBe('blob:mock/1');
  });
});

describe('words', () => {
  it('say what happened, and point at the routes that cannot fail when the file may be missing', () => {
    expect(downloadNote('started', false, 'a.png')).toContain('Saved as a.png');
    expect(downloadNote('started', true, 'a.png')).toContain('right-click');
    expect(downloadNote('failed', false, 'a.png')).toContain('Right-click');
    expect(downloadNote('skipped', false, 'a.png')).toContain('Right-click');
  });
});

describe('new tabs where the page cannot open them', () => {
  const g = globalThis as Record<string, unknown>;
  const saved = g.window;
  afterEach(() => { g.window = saved; });

  /** window.open as the HTML standard has it: null with "noopener" even when the tab opened, a handle otherwise. */
  function stubWindow(origin: string | undefined, log: { url: string; features?: string; handle?: { opener: unknown } }[]) {
    const w: Record<string, unknown> = {
      location: { search: '' }, origin,
      open: (url: string, _target?: string, features?: string) => {
        const handle = /noopener/.test(features ?? '') ? null : { opener: 'parent' };
        log.push({ url, features, handle: handle ?? undefined });
        return handle;
      },
    };
    w.self = w; w.top = w;
    g.window = w;
  }

  it('a page with an opaque origin is never asked to open a tab (the browser would log an error)', () => {
    const log: { url: string }[] = [];
    stubWindow('null', log);
    const env = browserEnv();
    expect(env.canOpenTab).toBe(false);
    expect(tabsBlocked(env)).toBe(true);
    expect(openInNewTab('blob:null/1', env)).toBe(false);
    expect(log).toEqual([]);
  });

  it('on a normal page the tab opens without the noopener feature (which hides the handle) and loses its opener', () => {
    const log: { url: string; features?: string; handle?: { opener: unknown } }[] = [];
    stubWindow('http://127.0.0.1:5173', log);
    const env = browserEnv();
    expect(env.canOpenTab).toBe(true);
    expect(openInNewTab('blob:http://127.0.0.1:5173/1', env)).toBe(true);
    expect(log).toHaveLength(1);
    expect(log[0].features ?? '').not.toMatch(/noopener/);
    expect(log[0].handle?.opener).toBeNull();
  });

  it('a popup blocker (null handle) still reads as refused', () => {
    const w: Record<string, unknown> = { location: { search: '' }, origin: 'http://x', open: () => null };
    w.self = w; w.top = w;
    g.window = w;
    expect(openInNewTab('blob:http://x/1', browserEnv())).toBe(false);
  });
});
