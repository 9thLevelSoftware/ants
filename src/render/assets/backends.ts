// Asset back ends (architecture section 8). Two, chosen at runtime and transparent to callers:
//
// 1. Embedded packs: classic scripts that register base64 payloads in `window.__FOUNDRESS_ASSETS__[path]`.
//    A pack index `window.__FOUNDRESS_ASSET_INDEX__ = { version: 1, packs: [{ src, paths }] }` (inlined in the
//    page or the main bundle) lists which pack script holds which paths; packs are injected lazily with
//    <script src> on first use. A pack script looks like:
//      (window.__FOUNDRESS_ASSETS__ = window.__FOUNDRESS_ASSETS__ || {})["assets/textures/x/albedo.jpg"] = "<base64>";
//    This works inside sandboxed iframes with an opaque origin, where fetch() of our own files fails.
// 2. Relative-URL fetch for dev and normal static hosting.
//
// Only the AssetLoader uses these; no other module may fetch assets.

export interface AssetPackIndex {
  version: 1;
  packs: { src: string; paths: string[] }[];
}

export interface AssetGlobals {
  __FOUNDRESS_ASSETS__?: Record<string, string>;
  __FOUNDRESS_ASSET_INDEX__?: AssetPackIndex;
}

export interface AssetBackend {
  readonly name: 'embedded' | 'fetch';
  /** Can this back end serve the path (without trying)? */
  has(path: string): boolean;
  bytes(path: string): Promise<ArrayBuffer>;
}

/** base64 -> ArrayBuffer (atob exists in browsers and Node >= 16). */
export function decodeBase64(b64: string): ArrayBuffer {
  const comma = b64.startsWith('data:') ? b64.indexOf(',') : -1;
  const bin = atob(comma >= 0 ? b64.slice(comma + 1) : b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export type ScriptInjector = (src: string) => Promise<void>;

/** Default injector: a classic <script src> appended to <head> (allowed in sandboxed iframes with allow-scripts). */
export function domScriptInjector(doc: Document): ScriptInjector {
  return (src) => new Promise<void>((resolve, reject) => {
    const s = doc.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`asset pack failed to load: ${src}`));
    (doc.head ?? doc.documentElement).appendChild(s);
  });
}

export class EmbeddedBackend implements AssetBackend {
  readonly name = 'embedded' as const;
  private packOf = new Map<string, string>();
  private loading = new Map<string, Promise<void>>();

  constructor(private readonly g: AssetGlobals, private readonly inject: ScriptInjector) {
    for (const p of g.__FOUNDRESS_ASSET_INDEX__?.packs ?? []) for (const path of p.paths) this.packOf.set(path, p.src);
  }

  static available(g: AssetGlobals): boolean {
    return !!g.__FOUNDRESS_ASSETS__ || !!g.__FOUNDRESS_ASSET_INDEX__;
  }

  has(path: string): boolean {
    return !!this.g.__FOUNDRESS_ASSETS__?.[path] || this.packOf.has(path);
  }

  async bytes(path: string): Promise<ArrayBuffer> {
    let b64 = this.g.__FOUNDRESS_ASSETS__?.[path];
    if (!b64) {
      const src = this.packOf.get(path);
      if (!src) throw new Error(`embedded: ${path} is in no pack`);
      let p = this.loading.get(src);
      if (!p) {
        p = this.inject(src);
        this.loading.set(src, p);
        p.catch(() => this.loading.delete(src)); // allow a later retry
      }
      await p;
      b64 = this.g.__FOUNDRESS_ASSETS__?.[path];
      if (!b64) throw new Error(`embedded: pack ${src} did not register ${path}`);
    }
    return decodeBase64(b64);
  }
}

export type FetchFn = (url: string) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>;

export class FetchBackend implements AssetBackend {
  readonly name = 'fetch' as const;
  /** `base` is the page URL (or any URL the relative asset paths resolve against). */
  constructor(private readonly base: string, private readonly fetchFn: FetchFn) {}

  has(): boolean {
    return true;
  }

  async bytes(path: string): Promise<ArrayBuffer> {
    const url = new URL(path, this.base).href;
    const r = await this.fetchFn(url);
    if (!r.ok) throw new Error(`fetch ${path}: HTTP ${r.status}`);
    return r.arrayBuffer();
  }
}

/** Embedded packs first when present, then relative fetch (dev, normal hosting). */
export function defaultBackends(win: Window & AssetGlobals): AssetBackend[] {
  const list: AssetBackend[] = [];
  if (EmbeddedBackend.available(win)) list.push(new EmbeddedBackend(win, domScriptInjector(win.document)));
  if (typeof win.fetch === 'function') list.push(new FetchBackend(win.location.href, (u) => win.fetch(u)));
  return list;
}
