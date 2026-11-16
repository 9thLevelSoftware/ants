// Presentation-side input constants (GDD 01 sections 5 and 6.8). Real time, not game time.

/** Tap/hold split for tap/hold inputs (foot grip, LB tap). */
export const HOLD_THRESHOLD_MS = 250;
/** `interact` secondary and `inspect` sniff. */
export const INTERACT_HOLD_MS = 400;
/** `special` -> release alarm. */
export const SPECIAL_ALARM_HOLD_MS = 500;
/** A mouse press that moves less than this and is released within CLICK_MAX_MS is a click, not a drag. */
export const CLICK_SLOP_PX = 6;
export const CLICK_MAX_MS = 300;
/** Two clicks of the same button within this time (and slop) are a double click. */
export const DBL_CLICK_MS = 350;
/** Radial dead zone of sticks; digital threshold of analogue triggers / half axes. */
export const STICK_DEADZONE = 0.15;
export const TRIGGER_THRESHOLD = 0.3;
/** Digital threshold for ordinary pad buttons (value 0..1). */
export const PAD_BUTTON_THRESHOLD = 0.5;
/** Last-used device must hold for this long before the glyph set switches. */
export const DEVICE_SWITCH_HYST_S = 0.5;
/** Observer fast-fly multiplier. */
export const OBS_FAST_MULT = 4;
/** After a pointer-lock refusal, do not ask again for this long. */
export const POINTER_LOCK_RETRY_MS = 5000;

/** Wheel: pixels per notch after deltaMode conversion; deltaMode lines/pages to pixels (GDD 01 5.6). */
export const WHEEL_PX_PER_NOTCH = 100;
export const WHEEL_LINE_PX = 16;
export const WHEEL_PAGE_PX = 400;
/** Zoom: distance factor per wheel notch, and per real second while a zoom key is held (GDD 01 6.8). */
export const ZOOM_STEP_PER_NOTCH = 1.12;
export const ZOOM_STEP_PER_SECOND_KEYS = 1.8;
/** Gamepad zoom (LB + RS vertical) in distance factor per second at full deflection. */
export const ZOOM_STEP_PER_SECOND_PAD = 2.2;

/** Keyboard orbit rates (deg/s) for arrow keys (GDD 01 5.6). */
export const KEY_ORBIT_YAW_DEG_S = 120;
export const KEY_ORBIT_PITCH_DEG_S = 90;
/** Colony view Q/E yaw rate. */
export const KEY_CV_YAW_DEG_S = 90;
/** Repeat rate for press actions that auto-repeat while held (colony slice up/down). */
export const SLICE_REPEAT_HZ = 8;

/** Number of keyboard/mouse slots per action and gamepad slots per action (GDD 01 5.7). */
export const KBM_SLOTS = 2;
export const PAD_SLOTS = 1;

/** localStorage key for bindings. */
export const BINDINGS_STORAGE_KEY = 'foundress.bindings.v1';

/** Settings consumed by the input state (subset of the game settings; defaults per GDD 01 6.8 / 08 7.4). */
export interface InputSettings {
  mouseLook: 'drag' | 'locked';
  leftButton: 'bite' | 'orbit';
  /** deg per pixel of drag (orbitSensDrag) and of locked mouse motion (orbitSensLocked). */
  orbitSensDrag: number;
  orbitSensLocked: number;
  /** Global sensitivity multiplier from Settings > Controls (0.2..3.0). */
  mouseSensitivity: number;
  invertX: boolean;
  invertY: boolean;
  stickYawRate: number;
  stickPitchRate: number;
  stickResponse: number;
  deadZone: number;
  /**
   * Hold duration for hold-activated buttons, ms (GDD 08 7.4: 300-1500, default 600). Every hold threshold of the
   * action table (GDD 01 5: 250 / 400 / 500 / 1000 ms) is multiplied by `holdMs / HOLD_MS_DEFAULT`, so the default
   * keeps the designed feel and a slower player stretches all of them together.
   */
  holdMs?: number;
  /** Orbit by drag: a press of the drag button starts the orbit and the next press ends it (GDD 08 12 hold-to-toggle). */
  orbitToggle?: boolean;
}

/** The hold duration setting's default, the point where every GDD 01 threshold is used as written. */
export const HOLD_MS_DEFAULT = 600;
export const HOLD_MS_RANGE = { min: 300, max: 1500 } as const;

export function defaultInputSettings(): InputSettings {
  return {
    mouseLook: 'drag',
    leftButton: 'bite',
    orbitSensDrag: 0.25,
    orbitSensLocked: 0.15,
    mouseSensitivity: 1,
    invertX: false,
    invertY: false,
    stickYawRate: 180,
    stickPitchRate: 120,
    stickResponse: 1.6,
    deadZone: STICK_DEADZONE,
    holdMs: HOLD_MS_DEFAULT,
    orbitToggle: false,
  };
}

/** Standard-mapping gamepad button indices (W3C Gamepad "standard" layout). */
export const PAD = {
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, START: 9, LS: 10, RS: 11,
  DUP: 12, DDOWN: 13, DLEFT: 14, DRIGHT: 15, HOME: 16,
} as const;
/** Standard-mapping axes. */
export const PAD_AXIS = { LX: 0, LY: 1, RX: 2, RY: 3 } as const;
