import { describe, expect, it } from 'vitest';
import { defaultBindings, serializeBindings } from '@/input/bindings';
import { BINDINGS_STORAGE_KEY } from '@/input/defaults';
import { SETTINGS_STORAGE_KEY } from '../save/constants';
import { createLocalKv, memoryKv } from '../save/localKv';
import { defaultSettings } from './model';
import { attachSettingsPersistence, loadSettings, SETTINGS_SCHEMA_VERSION } from './persist';
import { sanitizeSettings } from './schema';
import { SettingsStore } from './store';

describe('defaults', () => {
  it('match GDD 08 §7.4', () => {
    const d = defaultSettings();
    expect(d.audio).toMatchObject({ master: 1, ambience: 0.8, effects: 0.9, giants: 0.9, ui: 0.6, music: 0.5, musicMode: 'sparse', muteWhenHidden: true });
    expect(d.gameplay).toMatchObject({ autosaveMin: 5, prompts: 'always', hints: true, autoSlowCritical: 'slow', autoSlowWarning: 'off', minimap: 'never', focusLine: 'auto', milestoneNotices: 'full' });
    expect(d.accessibility).toMatchObject({ uiScale: 100, textScale: 100, font: 'standard', reducedMotion: 'system', shake: 100, spiderComfort: 'off', overlayPalette: 'okabe-ito', flashReduction: true });
    expect(d.controls).toMatchObject({ mouseSensitivity: 1, invertY: false, mouseLook: 'drag', holdMs: 600, deadZone: 0.15 });
    expect(d.graphics).toEqual({ quality: 'auto', overrides: {} });
    expect(d.bindings.version).toBe(1);
  });
});

describe('validation and clamping', () => {
  it('clamps numbers, snaps steps, falls back on bad enums and types', () => {
    const s = sanitizeSettings({
      audio: { master: 7, ambience: -1, effects: 'loud', musicMode: 'loud' },
      accessibility: { uiScale: 133, textScale: 120, shake: 250, font: 'comic' },
      controls: { mouseSensitivity: 99, holdMs: 10, deadZone: Number.NaN, invertY: 'yes' },
      camera: { fovOffset: -50 },
      gameplay: { autosaveMin: 7, prompts: 'sometimes', hints: 0 },
      graphics: { quality: 'ultra', overrides: { resolutionScale: 0.1, targetFps: 45, depthOfField: 'full', haze: 'x', bogus: 1 } },
      nonsense: { a: 1 },
    });
    expect(s.audio).toMatchObject({ master: 1, ambience: 0, effects: 0.9, musicMode: 'sparse' });
    expect(s.accessibility).toMatchObject({ uiScale: 130, textScale: 100, shake: 100, font: 'standard' });
    expect(s.controls).toMatchObject({ mouseSensitivity: 3, holdMs: 300, deadZone: 0.15, invertY: false });
    expect(s.camera.fovOffset).toBe(-10);
    expect(s.gameplay).toMatchObject({ autosaveMin: 5, prompts: 'always', hints: true });
    expect(s.graphics).toEqual({ quality: 'ultra', overrides: { resolutionScale: 0.5, depthOfField: 'full' } });
    expect((s as unknown as Record<string, unknown>).nonsense).toBeUndefined();
  });

  it('accepts a complete valid object unchanged and anything else gives the defaults', () => {
    const d = defaultSettings();
    expect(sanitizeSettings(d)).toEqual(d);
    for (const junk of [null, undefined, 42, 'x', [], { gameplay: 3 }]) expect(sanitizeSettings(junk)).toEqual(d);
  });

  it('a broken bindings object falls back to the default bindings', () => {
    expect(sanitizeSettings({ bindings: 'junk' }).bindings).toEqual(defaultBindings());
    const b = defaultBindings();
    b.kbm['dig'] = [{ kind: 'key', code: 'KeyD' }, null];
    expect(sanitizeSettings({ bindings: b }).bindings.kbm['dig'][0]).toEqual({ kind: 'key', code: 'KeyD' });
  });
});

describe('SettingsStore', () => {
  it('merges a patch per section, validates it, and notifies with the changed paths', () => {
    const store = new SettingsStore();
    const calls: string[][] = [];
    store.subscribe((_s, changed) => calls.push(changed));
    store.set({ audio: { master: 0.5 }, gameplay: { pauseOnBlur: false } });
    expect(store.get().audio.master).toBe(0.5);
    expect(store.get().audio.ambience).toBe(0.8);
    expect(calls).toEqual([['gameplay.pauseOnBlur', 'audio.master']]);
    store.set({ audio: { master: 0.5 } }); // no change: no notification
    expect(calls).toHaveLength(1);
    store.set({ audio: { master: 5 } });
    expect(store.get().audio.master).toBe(1);
    store.set({ graphics: { quality: 'nonsense' as never } });
    expect(store.get().graphics.quality).toBe('auto');
  });

  it('replace() sanitises, reset() restores defaults, unsubscribe works', () => {
    const store = new SettingsStore();
    let n = 0;
    const off = store.subscribe(() => n++);
    store.replace({ audio: { master: 0.1 } });
    expect(store.get().audio.master).toBe(0.1);
    store.reset('audio');
    expect(store.get().audio.master).toBe(1);
    off();
    store.set({ camera: { worldUpLock: true } });
    expect(n).toBe(2);
  });
});

describe('persistence', () => {
  const timers = () => {
    const pending: (() => void)[] = [];
    return { pending, setTimer: (fn: () => void) => { pending.push(fn); return pending.length; }, clearTimer: () => {} };
  };

  it('writes changes debounced and reads them back (schema versioned)', () => {
    const kv = memoryKv();
    const t = timers();
    const store = new SettingsStore();
    const p = attachSettingsPersistence(store, kv, { ...t });
    expect(p.status()).toMatchObject({ available: true, loaded: 'none', notice: '' });
    store.set({ audio: { master: 0.3 } });
    store.set({ accessibility: { uiScale: 120 } });
    expect(t.pending).toHaveLength(1); // one write for two changes
    expect(kv.map.has(SETTINGS_STORAGE_KEY)).toBe(false);
    t.pending[0]();
    const env = JSON.parse(kv.map.get(SETTINGS_STORAGE_KEY)!);
    expect(env.v).toBe(SETTINGS_SCHEMA_VERSION);
    expect(env.settings.audio.master).toBe(0.3);
    expect(env.settings.bindings).toBeUndefined(); // bindings have their own key
    expect(kv.map.get(BINDINGS_STORAGE_KEY)).toBe(serializeBindings(store.get().bindings));

    const again = new SettingsStore();
    const applied: number[] = [];
    const p2 = attachSettingsPersistence(again, kv, { ...timers(), apply: (s) => applied.push(s.accessibility.uiScale) });
    expect(again.get().audio.master).toBe(0.3);
    expect(again.get().accessibility.uiScale).toBe(120);
    expect(applied).toEqual([120]);
    expect(p2.status().loaded).toBe('ok');
  });

  it('rebinding persists across a reload (Appendix E check 21)', () => {
    const kv = memoryKv();
    const t = timers();
    const store = new SettingsStore();
    attachSettingsPersistence(store, kv, { ...t });
    const b = defaultBindings();
    b.kbm['dig'] = [{ kind: 'key', code: 'KeyD' }, null];
    b.kbm['inspect'] = [{ kind: 'key', code: 'KeyG' }, null];
    store.set({ bindings: b });
    t.pending.at(-1)!();
    const loaded = loadSettings(kv).settings;
    expect(loaded.bindings.kbm['dig'][0]).toEqual({ kind: 'key', code: 'KeyD' });
    expect(loaded.bindings.kbm['inspect'][0]).toEqual({ kind: 'key', code: 'KeyG' });
  });

  it('a damaged stored value gives the defaults and says so; a newer schema is read best-effort', () => {
    const kv = memoryKv();
    kv.map.set(SETTINGS_STORAGE_KEY, '{not json');
    expect(loadSettings(kv)).toMatchObject({ loaded: 'damaged' });
    expect(loadSettings(kv).settings).toEqual(defaultSettings());
    kv.map.set(SETTINGS_STORAGE_KEY, JSON.stringify({ v: 99, settings: { audio: { master: 0.4 }, future: { x: 1 } } }));
    const l = loadSettings(kv);
    expect(l.loaded).toBe('ok');
    expect(l.settings.audio.master).toBe(0.4);
  });

  it('with no storage the settings last for the session and the header says why', () => {
    const kv = memoryKv(false);
    const t = timers();
    const store = new SettingsStore();
    const p = attachSettingsPersistence(store, kv, { ...t });
    expect(p.status()).toMatchObject({ available: false, notice: 'Settings cannot be stored in this browser context' });
    store.set({ audio: { master: 0.2 } });
    t.pending[0]?.();
    expect(store.get().audio.master).toBe(0.2);
  });

  it('a throwing localStorage never escapes', () => {
    const boom = { setItem() { throw new Error('quota'); }, getItem() { throw new Error('denied'); }, removeItem() { throw new Error('x'); } } as unknown as Storage;
    // the probe write throws: unavailable
    const kv = createLocalKv(() => boom);
    expect(kv.available).toBe(false);
    expect(kv.get('a')).toBeNull();
    expect(kv.set('a', 'b')).toBe(false);
    const throwingGlobal = createLocalKv(() => { throw new Error('SecurityError'); });
    expect(throwingGlobal.available).toBe(false);
    expect(throwingGlobal.lastError).toContain('SecurityError');
  });

  it('a write that fails is reported, not thrown', () => {
    let fail = false;
    const mem = new Map<string, string>();
    const storage = {
      setItem: (k: string, v: string) => { if (fail && k !== 'foundress.probe') throw new Error('QuotaExceededError'); mem.set(k, v); },
      getItem: (k: string) => mem.get(k) ?? null, removeItem: (k: string) => { mem.delete(k); },
    } as unknown as Storage;
    const kv = createLocalKv(() => storage);
    const t = timers();
    const store = new SettingsStore();
    const p = attachSettingsPersistence(store, kv, { ...t });
    fail = true;
    store.set({ audio: { master: 0.7 } });
    t.pending[0]();
    expect(p.status()).toMatchObject({ writeFailed: true });
    expect(p.status().notice).toMatch(/could not be stored/);
  });
});

