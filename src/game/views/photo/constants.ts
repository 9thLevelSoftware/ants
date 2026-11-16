// Photo mode presentation constants (GDD 08 7.9, GDD 01 6.9). The camera and lens limits themselves live with the rig
// (src/render/camera/constants.ts: PHOTO_*); these are the game-side extras. Real seconds and mm unless noted.

/** Aperture the lens starts at on every entry: the look-dev default (GDD 08 7.9: f/2.8 -> bokeh scale 3.2). */
export const PHOTO_DEFAULT_F = 2.8;
/** The point a subject is focused on / orbited, this far above its feet along its up (body lengths). */
export const PHOTO_BODY_LIFT_L = 0.3;
/** Closest an orbit may bring the camera to its subject (BU). */
export const PHOTO_ORBIT_MIN_BU = 0.6;
/** An orbit turn is split into steps of at most this many degrees so the collision check follows the arc. */
export const PHOTO_ORBIT_STEP_DEG = 12;
/** The camera's frame must not move the focus more than this per orbit step (guards a runaway input). */
export const PHOTO_ORBIT_MAX_DEG = 180;

/** Capture: the biggest image the capture will render (pixels), whatever the GPU says. */
export const PHOTO_CAPTURE_MAX_PIXELS = 12_000_000;
/** Capture scales offered (1 = canvas resolution; 2 = internal super-sampling). */
export const PHOTO_CAPTURE_SCALES = [1, 2] as const;
export type CaptureScale = (typeof PHOTO_CAPTURE_SCALES)[number];

/** Autofocus along the view axis never looks further than the rig's focus limit; this is the ray's start offset (BU). */
export const PHOTO_AUTOFOCUS_PROBE_BU = 0.05;
