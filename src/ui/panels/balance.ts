// Presentation constants of the on-demand panels (task ui-panels). They never affect simulation results (GDD 08 section 0).

/** Colony health: factors shown per diagnostic before "Other (n %)" (GDD 08 4.4). */
export const HEALTH_FACTORS_MAX = 5;
/** Colony health: cause chain depth (a diagnostic's factors are depth 1; GDD 08 4.4). */
export const HEALTH_CHAIN_DEPTH = 3;
/** A factor below this weight is not limiting anything and is not listed. */
export const HEALTH_FACTOR_MIN_WEIGHT = 0.005;
/** The highlight of a suggested control and the outline of a "Show" target last this long, real s (GDD 08 4.4). */
export const HIGHLIGHT_REAL_S = 4;

/** Nest overview: occupancy shading steps (GDD 08 4.6: a 4-step pattern, not colour). */
export const NEST_OCCUPANCY_STEPS = 4;
/** Nest overview: schematic canvas, dp (GDD 08 4.6). */
export const NEST_CANVAS = { w: 368, h: 300 } as const;
/** Flood risk at or above this is listed as "flood risk"; a flooded fraction above FLOODED_MIN as "flooded". */
export const NEST_FLOOD_RISK_MIN = 0.25;
export const NEST_FLOODED_MIN = 0.02;

/** Journal graphs: ticks of the value axis, the cursor step and the colour-blind-safe series order (Okabe-Ito, GDD 08 10.1). */
export const CHART_Y_TICKS = 4;
export const OKABE_ITO = ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7', '#F2EFE6'] as const;
/** Dash patterns that give each series a second, non-colour identity (GDD 08 7.2). */
export const CHART_DASHES = ['', '6 3', '2 3', '8 3 2 3', '1 3', '10 4', '4 2 1 2', '3 1'] as const;
