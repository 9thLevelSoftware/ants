// `__game.saves`: plain-JSON verification surface for the harness (page.evaluate can return only JSON). It wraps the
// save manager, the profile and the settings persistence; nothing here is used by the game itself.
import type { Persistence } from './install';
import { fromBase64, toBase64 } from '@/core/serialize';
import { readFileBytes } from './download';
import { listSlotInfos } from './facade';

const outcome = (o: { ok: boolean; status: string; code: string; message: string; volatile?: boolean }) => ({
  ok: o.ok, status: o.status, code: o.code, message: o.message, volatile: o.volatile === true,
});

export function buildSavesDebug(p: Persistence) {
  const m = p.manager;
  return {
    status: () => ({ save: m.status(), profile: p.profile.status(), settings: p.settings.status(), policy: policyState(p) }),
    save: async (slot: string) => outcome(await m.saveTo(slot)),
    autosave: async (label = 'interval') => outcome(await m.autosave(label as never)),
    load: async (slot: string) => outcome(await m.load(slot)),
    remove: async (slot: string) => outcome(await m.delete(slot)),
    list: async (hidden = false) => (await listSlotInfos(m, hidden)).map((s) => ({ ...s, thumbnail: s.thumbnail ? `${s.thumbnail.length} chars` : null })),
    /** Exports a slot ('current' = the running game) with the chosen method; returns text or base64, never bytes. */
    export: async (slot: string, method: 'auto' | 'text' | 'bytes' = 'text') => {
      const r = slot === 'current' ? await m.exportCurrent({ method }) : await m.exportSlot(slot, { method });
      const v = r.value;
      return { ...outcome(r), method: v?.method ?? null, filename: v?.filename ?? null, sizeBytes: v?.sizeBytes ?? 0, text: v?.text ?? null, base64: v?.bytes ? toBase64(v.bytes) : null };
    },
    /** Imports `FOUNDRESS1:` text into a slot, or `now` to load it. */
    importText: async (text: string, target: string) => {
      const parsed = m.parseImport(text);
      if (!parsed.ok || !parsed.value) return outcome(parsed);
      return outcome(target === 'now' ? await m.loadParsed(parsed.value) : await m.importToSlot(parsed.value, target));
    },
    importBase64: async (b64: string, target: string) => {
      const parsed = m.parseImport(fromBase64(b64));
      if (!parsed.ok || !parsed.value) return outcome(parsed);
      return outcome(target === 'now' ? await m.loadParsed(parsed.value) : await m.importToSlot(parsed.value, target));
    },
    /** Imports the first file of an <input type=file> (the real file-picker path). */
    importFromInput: async (selector: string, target: string) => {
      const input = document.querySelector(selector) as HTMLInputElement | null;
      const file = input?.files?.[0];
      if (!file) return { ok: false, status: 'failed', code: 'failed', message: 'no file chosen', volatile: false };
      const bytes = await readFileBytes(file);
      if (!bytes) return { ok: false, status: 'failed', code: 'failed', message: 'file could not be read', volatile: false };
      const parsed = m.parseImport(bytes);
      if (!parsed.ok || !parsed.value) return outcome(parsed);
      return outcome(target === 'now' ? await m.loadParsed(parsed.value) : await m.importToSlot(parsed.value, target));
    },
    /** Test helper: adds a file input to the page for Playwright's setInputFiles. */
    addFileInput: (id = 'save-import-input') => {
      let el = document.getElementById(id) as HTMLInputElement | null;
      if (!el) {
        el = document.createElement('input');
        el.type = 'file';
        el.id = id;
        el.accept = '.foundress';
        el.style.display = 'none';
        document.body.appendChild(el);
      }
      return `#${id}`;
    },
    /** Advance the autosave clock by `dtS` real seconds (a test does not wait five minutes). */
    frame: (dtS: number) => { p.driver.frame(dtS); return policyState(p); },
    trigger: (label: string) => p.driver.trigger(label as never),
    written: () => p.driver.written.slice(),
    lastSave: () => m.lastSaveInfo(),
    thumbnail: () => { const t = m.captureThumbnail(); return t ? { chars: t.length, prefix: t.slice(0, 22) } : null; },
    settings: { get: () => p.game.settings.get(), set: (patch: never) => { p.game.setSettings(patch); return p.game.settings.get(); }, flush: () => p.settings.flush() },
    profile: {
      get: () => p.profile.get(),
      hints: () => p.profile.hints(),
      recordHintUse: (id: never, learnAt = 1) => p.profile.recordHintUse(id, learnAt),
      resetHints: () => p.profile.resetHints(),
      flush: () => p.profile.flush(),
    },
  };
}

function policyState(p: Persistence) {
  const pol = p.policy;
  return { enabled: pol.enabled, disabled: pol.disabled, intervalS: pol.intervalS, secondsToNext: Number.isFinite(pol.secondsToNext()) ? pol.secondsToNext() : null };
}

export type SavesDebug = ReturnType<typeof buildSavesDebug>;
