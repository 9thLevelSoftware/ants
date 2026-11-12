// Game settings (GDD 08 §7.4). The model, validation and store live in model.ts, schema.ts and store.ts; this file
// keeps the import path `@/game/settings/settings` that Game and the UI already use.
export * from './model';
export { SettingsStore, type SettingsListener } from './store';
export { sanitizeSettings, changedPaths } from './schema';
