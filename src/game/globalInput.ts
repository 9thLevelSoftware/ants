// Global and view-switching actions while playing (GDD 01 §5.1): pause, speeds, HUD, colony view, photo mode,
// role possession, Tab cycling, menu. Translates input edges into calls on the game; no state of its own.
import type { InputState } from '@/input';
import type { PossessRole, SpeedLevel } from '@/sim/types';
import { nextSpeed } from './time/speedRules';

/** What this module may ask of the game. */
export interface GlobalControls {
  readonly level: SpeedLevel;
  setSpeed(level: SpeedLevel): void;
  togglePause(): void;
  toggleHud(): void;
  toggleColonyView(): void;
  togglePhoto(): void;
  menuPressed(): void;
  possess(target: number | PossessRole): void;
  possessLast(): void;
  cycle(dir: 1 | -1): void;
  quickSave(): void;
  quickLoad(): void;
}

const ROLE_ACTIONS: [string, PossessRole][] = [
  ['possess-queen', 'queen'], ['possess-forager', 'forager'], ['possess-digger', 'digger'], ['possess-nurse', 'nurse'],
];
const SPEED_ACTIONS: [string, SpeedLevel][] = [['speed-1', 1], ['speed-2', 2], ['speed-4', 4], ['speed-8', 8]];

export function handleGlobalInput(input: InputState, g: GlobalControls): void {
  if (input.pressed('menu')) { g.menuPressed(); return; }
  if (input.pressed('pause-toggle')) g.togglePause();
  for (const [id, level] of SPEED_ACTIONS) if (input.pressed(id)) g.setSpeed(level);
  if (input.pressed('speed-up')) g.setSpeed(nextSpeed(g.level, 1));
  if (input.pressed('speed-down')) g.setSpeed(nextSpeed(g.level, -1));
  if (input.pressed('hide-hud')) g.toggleHud();
  if (input.pressed('colony-view')) g.toggleColonyView();
  if (input.pressed('photo-mode')) g.togglePhoto();
  for (const [id, role] of ROLE_ACTIONS) if (input.pressed(id)) g.possess(role);
  if (input.pressed('possess-last')) g.possessLast();
  if (input.pressed('possess-next')) g.cycle(1);
  if (input.pressed('possess-prev')) g.cycle(-1);
  if (input.pressed('pointer-lock-toggle')) input.pointer.setPreference(input.pointer.preference === 'locked' ? 'drag' : 'locked');
  if (input.pressed('quick-save')) g.quickSave();
  if (input.pressed('quick-load')) g.quickLoad();
}

/** Photo mode's own exit keys (only Ph is live there). */
export function handlePhotoInput(input: InputState, g: Pick<GlobalControls, 'togglePhoto'>): void {
  if (input.pressed('menu') || input.pressed('photo-mode') || input.pressed('ph-exit')) g.togglePhoto();
}
