// The UI-facing surface of the save layer, in the shapes of src/ui/api.ts (SaveResult, SaveSlotInfo, ExportResult).
// Game.save / load / listSaves reach it through SaveHooks; the optional facade methods (deleteSave, exportSave,
// importSave, storageAvailable...) are attached to the Game by install.ts.
import type { ExportResult, SaveResult, SaveSlotInfo } from '@/ui/api';
import { AUTOSAVE_LABELS_TEXT } from './labels';
import type { SaveManager } from './manager';
import { isAutoKey } from './slots';
import type { SaveListing, SaveOutcome } from './types';

/** SaveOutcome -> the UI's SaveResult (extra fields are additive). */
export function toSaveResult(o: SaveOutcome<unknown>): SaveResult {
  return { ok: o.ok, status: o.status, message: o.message, code: o.code, ...(o.volatile ? { volatile: true } : {}) };
}

export function toSlotInfo(l: SaveListing): SaveSlotInfo {
  const kind: SaveSlotInfo['kind'] = isAutoKey(l.key) ? 'auto' : l.key === 'quick' ? 'quick' : 'manual';
  return {
    slot: l.key, label: l.title, savedAt: l.meta.savedAtIso, colonyDay: l.meta.colonyDay, workers: l.meta.population,
    kind, trigger: l.label ? AUTOSAVE_LABELS_TEXT[l.label] ?? l.label : undefined, species: l.meta.species, archetype: l.meta.archetype,
    seedCode: l.meta.seedCode, dateLabel: l.meta.dateLabel, playTimeS: l.meta.playTimeS, version: l.meta.appVersion,
    thumbnail: l.meta.thumbnail, damaged: l.damaged, generation: l.generation, pinned: l.pinned,
  };
}

export async function listSlotInfos(manager: SaveManager, includeHidden = false): Promise<SaveSlotInfo[]> {
  const r = await manager.list({ includeHidden });
  return r.ok && r.value ? r.value.map(toSlotInfo) : [];
}

/** Bytes of a stored slot (or `current` = the running game, which needs no storage) for the UI's download / text fallback. */
export async function exportSlotBytes(manager: SaveManager, slot: string): Promise<ExportResult> {
  const r = slot === 'current' ? await manager.exportCurrent({ method: 'bytes' }) : await manager.exportSlot(slot, { method: 'bytes' });
  return r.ok && r.value?.bytes ? { ok: true, bytes: r.value.bytes, message: r.message } : { ok: false, message: r.message };
}

/** Import into a slot, or `now` = load without storing (GDD 08 §7.6). */
export async function importInto(manager: SaveManager, data: Uint8Array | string, target: string): Promise<SaveResult> {
  const parsed = manager.parseImport(data);
  if (!parsed.ok || !parsed.value) return toSaveResult(parsed);
  return toSaveResult(target === 'now' ? await manager.loadParsed(parsed.value) : await manager.importToSlot(parsed.value, target));
}
