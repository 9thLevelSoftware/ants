// Independent review tests for the settings store (task save): hostile and edge values never reach the game.
import { describe, expect, it } from 'vitest';
import { memoryKv } from '../save/localKv';
import { SETTINGS_STORAGE_KEY } from '../save/constants';
import { defaultSettings } from './model';
import { attachSettingsPersistence, loadSettings } from './persist';
import { sanitizeSettings } from './schema';
import { SettingsStore } from './store';

describe('review: settings validation edges', () => {
  it('NaN, Infinity, strings and null in numeric fields keep the previous value', () => {
    const s = sanitizeSettings({ audio: { master: Number.NaN, ambience: Infinity, effects: '0.2', giants: null } });
    const d = defaultSettings();
    expect(s.audio.master).toBe(d.audio.master);
    expect(s.audio.ambience).toBe(d.audio.ambience);
    expect(s.audio.effects).toBe(d.audio.effects);
    expect(s.audio.giants).toBe(d.audio.giants);
  });

  it('steps snap and clamp at both ends', () => {
    const s = sanitizeSettings({ accessibility: { uiScale: 84 }, graphics: { quality: 'high', overrides: { resolutionScale: 0.52, density: 7 } } });
    expect(s.accessibility.uiScale).toBe(80);
    expect(sanitizeSettings({ accessibility: { uiScale: 1e9 } }).accessibility.uiScale).toBe(150);
    expect(sanitizeSettings({ accessibility: { uiScale: -5 } }).accessibility.uiScale).toBe(80);
    expect(s.graphics.overrides.resolutionScale).toBe(0.5);
    expect(s.graphics.overrides.density).toBe(1);
  });

  it('autosave interval accepts only the four choices', () => {
    for (const v of [0, 2, 5, 10]) expect(sanitizeSettings({ gameplay: { autosaveMin: v } }).gameplay.autosaveMin).toBe(v);
    for (const v of [1, 3, -2, 60, '5']) expect(sanitizeSettings({ gameplay: { autosaveMin: v } }).gameplay.autosaveMin).toBe(5);
  });

  it('a stored __proto__ section does not pollute Object.prototype and the store still works', () => {
    const kv = memoryKv();
    kv.set(SETTINGS_STORAGE_KEY, '{"v":1,"settings":{"__proto__":{"polluted":1},"audio":{"__proto__":{"master":0}}}}');
    const loaded = loadSettings(kv);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(loaded.settings.audio.master).toBe(defaultSettings().audio.master);
  });

  it('a change made before the debounced write is flushed on pagehide and read back', () => {
    const kv = memoryKv();
    const store = new SettingsStore();
    const pending: (() => void)[] = [];
    const p = attachSettingsPersistence(store, kv, { setTimer: (fn) => { pending.push(fn); return pending.length; }, clearTimer: () => {} });
    store.set({ audio: { master: 0.25 }, gameplay: { autosaveMin: 2 } });
    p.flush();
    const again = new SettingsStore();
    attachSettingsPersistence(again, kv, { setTimer: () => 0, clearTimer: () => {} });
    expect(again.get().audio.master).toBe(0.25);
    expect(again.get().gameplay.autosaveMin).toBe(2);
  });
});
