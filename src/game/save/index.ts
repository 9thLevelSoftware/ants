// Persistence of the game layer (task save): saves, settings and the profile. See install.ts for the wiring.
export * from './types';
export * from './constants';
export { SaveManager, type SaveHost, type SaveManagerOptions, type SaveOptions, type ExportOptions, type ExportValue } from './manager';
export { IndexedDbStorage } from './indexedDbStorage';
export { MemoryStorage } from './memoryStorage';
export type { SaveStorage, StorageResult, StoreName, WriteOp } from './storage';
export { AutosavePolicy, CHECKPOINT_LABELS } from './autosavePolicy';
export { AutosaveDriver } from './autosaveDriver';
export { bytesToText, exportFileName, packContainer, parseBytes, parseText, type ParsedSave } from './container';
export { copyText, downloadBytes, readFileBytes } from './download';
export { installPersistence, type InstallOptions, type Persistence } from './install';
export { createLocalKv, memoryKv, type LocalKv } from './localKv';
export { toSaveResult, toSlotInfo } from './facade';
export { deepCopy } from './deepCopy';
