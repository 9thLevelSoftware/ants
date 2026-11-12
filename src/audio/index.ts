// FOUNDRESS audio (GDD 08 §13): Web Audio engine, ambience, positional foley, giant human sounds, UI sounds and
// optional generative music. The game creates one AudioSystem (createGameAudio); the UI uses the facade.
export { AudioSystem, type AudioFrame, type AudioSettingsSource, type AudioSystemOptions, type AudioAssets } from './system';
export { AudioRuntime, type RuntimeFrame } from './runtime';
export { audioEnable, audioStatus, audioUi, setAudioFacadeTarget } from './facade';
export type { AudioStatus } from './context';
export type { UiSoundId } from './uiSounds';
export { UI_SOUND_IDS } from './uiSounds';
export { createGameAudio } from './gameAudio';
