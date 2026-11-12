// Shared input types. Pure data: no DOM, no three. See docs/design/gdd/01-modes-controls-camera.md section 5.

/**
 * Input contexts (GDD 01 section 0): `G` global while playing, `P` possession, `O` observer, `C` colony view,
 * `Ph` photo mode, `TL` time-lapse, `UI` menus/panels.
 */
export type InputContext = 'G' | 'P' | 'O' | 'C' | 'Ph' | 'TL' | 'UI';

export const INPUT_CONTEXTS: readonly InputContext[] = ['G', 'P', 'O', 'C', 'Ph', 'TL', 'UI'];

/**
 * One physical input that can trigger a bindable action. Serialisable (plain JSON).
 * - `key`: KeyboardEvent.code (physical key). `shift: true` = only with Shift held (the only modifier allowed).
 * - `mouse`: a mouse button. Default: fires on press. `gesture` narrows it to a click (press + release within
 *   CLICK_SLOP_PX / CLICK_MAX_MS), a double click, or a press held for `holdMs` without dragging.
 * - `drag`: a mouse button whose drag feeds a look/pan axis (orbit without pointer lock).
 * - `wheel`: one wheel direction (`dir` -1 = towards the user's screen top, i.e. "scroll up").
 * - `pad`: a standard-mapping gamepad button. `mod` = another button that must be held (LB+Dpad); `gesture`
 *   `tap` fires on a quick release that was not used as a modifier, `hold` after `holdMs`.
 * - `padAxis`: one half of a gamepad axis (`dir` +1 / -1), optionally with a held modifier button.
 * - `padStick`: a whole stick (`left` = axes 0,1; `right` = axes 2,3) for 2D axes.
 */
export type Binding =
  | { kind: 'key'; code: string; shift?: boolean }
  | { kind: 'mouse'; button: number; gesture?: 'click' | 'dbl' | 'hold'; holdMs?: number }
  | { kind: 'drag'; button: number }
  | { kind: 'wheel'; dir: 1 | -1; shift?: boolean }
  | { kind: 'pad'; button: number; mod?: number; gesture?: 'tap' | 'hold'; holdMs?: number }
  | { kind: 'padAxis'; axis: number; dir: 1 | -1; mod?: number }
  | { kind: 'padStick'; stick: 'left' | 'right'; mod?: number };

export type BindingKind = Binding['kind'];

/**
 * How an action is meant to be read (the game decides what it does with it):
 * press: edge on press; hold: level while held (may be switched to toggle); toggle: press that flips a game state;
 * tapHold: one input carrying two meanings split by a hold threshold; axis: component of an analogue axis.
 */
export type ActionType = 'press' | 'hold' | 'toggle' | 'tapHold' | 'axis';

export type HoldToggleMode = 'hold' | 'toggle';

/** One rebindable action (a button action or one component of an axis). */
export interface ActionDef {
  id: string;
  label: string;
  contexts: InputContext[];
  type: ActionType;
  /** Default keyboard/mouse bindings, at most KBM_SLOTS (2). */
  kbm: Binding[];
  /** Default gamepad binding (one slot), or null. */
  pad: Binding | null;
  /** Bindings that always apply in addition to the user's slots and are not rebindable (e.g. double-click). */
  fixed?: Binding[];
  /** Hold threshold for tap/hold split (real ms); default HOLD_THRESHOLD_MS. */
  holdMs?: number;
  /** May the player toggle this between hold and toggle behaviour (GDD 01 5.7)? */
  holdToggle?: boolean;
  /** Cannot be rebound at all (menu). */
  locked?: boolean;
  /** Must not be left unbound (move, interact, release, menu). */
  required?: boolean;
  /** For axis components: the axis this belongs to. */
  axis?: string;
  tier: 1 | 2 | 3;
}

/** 2D rate axes (move/pan) report -1..1; look axes report degrees per frame; zoom axes a log-distance step. */
export type AxisKind = 'rate2' | 'look2' | 'zoom1';

export interface AxisDef {
  id: string;
  label: string;
  contexts: InputContext[];
  kind: AxisKind;
  /** Key-rate for look axes (deg/s yaw, deg/s pitch); zoom: unused. */
  keyRateDeg?: [number, number];
  /** Locked pointer: does raw mouse motion feed this look axis? */
  lockedMouse?: boolean;
  required?: boolean;
  tier: 1 | 2 | 3;
}

/** A gamepad snapshot handed to the input state each frame by the device adapter (or a test). */
export interface PadSnapshot {
  index: number;
  id: string;
  mapping: string;
  /** Button values 0..1 (standard mapping order). */
  buttons: number[];
  /** Axis values -1..1. */
  axes: number[];
}

export type InputDevice = 'kbm' | 'pad';

/** Events the input layer reports to the game (toasts, auto-pause). Drained once per frame. */
export type InputEvent =
  | { type: 'device-changed'; device: InputDevice }
  | { type: 'pad-connected'; index: number; id: string }
  | { type: 'pad-disconnected'; index: number; wasActiveDevice: boolean }
  | { type: 'pad-nonstandard'; index: number; id: string }
  | { type: 'focus-lost' }
  | { type: 'pointer-lock'; state: 'locked' | 'unlocked' | 'lost' | 'refused' };

export interface Vec2 {
  x: number;
  y: number;
}
