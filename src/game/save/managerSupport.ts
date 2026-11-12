// Messages and small pure helpers of the save manager.
import type { StorageFailure, WriteOp } from './storage';
import { slotOfKey } from './slots';
import type { SaveCode, SaveMeta } from './types';

export const MESSAGES: Record<string, string> = {
  unavailable: 'Saving to this browser is not available here. Use Export to keep your colony.',
  quota: 'The browser storage is full. Delete an old save or export your colony.',
  busy: 'Another save or load is still running.',
  'not-found': 'There is no save in that slot.',
  corrupt: 'This save is damaged and cannot be loaded.',
};


export function deleteOps(key: string): WriteOp[] {
  return [
    { op: 'delete', store: 'saves', key },
    { op: 'delete', store: 'meta', key },
    { op: 'delete', store: 'thumbs', key },
  ];
}

export function messageFor(status: StorageFailure | SaveCode, raw: string): string {
  return MESSAGES[status] ?? raw;
}

export function stubMeta(key: string): SaveMeta {
  return {
    key, slot: slotOfKey(key) ?? 'quick', generation: 0, label: '', pinned: false, species: 'lasius-niger', archetype: '', seed: 0,
    seedCode: '', sizeClass: '', difficulty: '', stage: '', tick: 0, dateLabel: '', colonyDay: 0, population: 0, playTimeS: 0,
    savedAtIso: '', savedAtMs: 0, saveVersion: 0, generatorVersion: 0, worldFingerprint: 0, appVersion: '', thumbnail: null,
  };
}
