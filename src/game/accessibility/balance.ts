// Presentation constants of the accessibility options (GDD 08 2.4, 12). They never affect simulation results.

/** Depth-of-field strength while reduced motion is on: a gentler blur (1 = the preset's own). Focus changes are instant anyway. */
export const REDUCED_DOF_STRENGTH = 0.5;
/** Camera shake setting (percent) the player gets by default; reduced motion forces the amplitude to zero whatever it says. */
export const SHAKE_DEFAULT_PERCENT = 100;
/** UI scale range in percent (GDD 08 2.3). */
export const UI_SCALE_RANGE = { min: 80, max: 150, step: 10 } as const;
