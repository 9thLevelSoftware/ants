// localStorage behind a try/catch wall (architecture §8: storage may be unavailable or throw). Reading the
// `localStorage` global itself can throw in a sandboxed iframe, and so can getItem/setItem (quota, private mode).
// Used by the settings and the profile fallback.

export interface LocalKv {
  /** A probe write worked (False: nothing persists; callers keep the values in memory only). */
  readonly available: boolean;
  /** Text of the last failure, '' when none. */
  readonly lastError: string;
  get(key: string): string | null;
  set(key: string, value: string): boolean;
  remove(key: string): boolean;
}

export function createLocalKv(source?: () => Storage | null | undefined): LocalKv {
  let lastError = '';
  const grab = (): Storage | null => {
    try {
      return (source ? source() : globalThis.localStorage) ?? null;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      return null;
    }
  };
  const probe = (): boolean => {
    const s = grab();
    if (!s) return false;
    try {
      s.setItem('foundress.probe', '1');
      s.removeItem('foundress.probe');
      return true;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      return false;
    }
  };
  const available = probe();
  return {
    available,
    get lastError() { return lastError; },
    get(key) {
      if (!available) return null;
      try { return grab()?.getItem(key) ?? null; } catch (e) { lastError = String(e); return null; }
    },
    set(key, value) {
      if (!available) return false;
      try { const s = grab(); if (!s) return false; s.setItem(key, value); return true; } catch (e) { lastError = e instanceof Error ? e.message : String(e); return false; }
    },
    remove(key) {
      if (!available) return false;
      try { grab()?.removeItem(key); return true; } catch (e) { lastError = e instanceof Error ? e.message : String(e); return false; }
    },
  };
}

/** A LocalKv over a plain Map (tests, and the stand-in when localStorage is unavailable). */
export function memoryKv(available = true): LocalKv & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map, available, lastError: '',
    get: (k) => (available ? map.get(k) ?? null : null),
    set: (k, v) => { if (!available) return false; map.set(k, v); return true; },
    remove: (k) => { if (!available) return false; map.delete(k); return true; },
  };
}
