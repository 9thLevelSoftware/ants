// Design tokens (GDD 08 section 2): colour, type, spacing, radii, elevation, motion. This file is the single
// source: tokensCss() turns it into CSS custom properties, the contrast test reads the same values, and the
// scale helpers in scale.ts use the layout constants. Presentation only; nothing here affects the simulation.

/** A colour with optional alpha (panel surfaces are semi-opaque so the 3D scene stays present). */
export interface Rgba {
  hex: string;
  alpha: number;
}

const solid = (hex: string): Rgba => ({ hex, alpha: 1 });
const a = (hex: string, alpha: number): Rgba => ({ hex, alpha });

/** GDD 08 2.1. Keys are the CSS variable names without the leading `--c-`. */
export const COLORS = {
  panel: a('#16130F', 0.9),
  'panel-raised': a('#221D17', 0.94),
  scrim: a('#16130F', 0.8),
  text: solid('#EEE7D7'),
  'text-2': solid('#BDB29C'),
  'text-3': solid('#A39884'),
  disabled: solid('#6E6556'),
  border: solid('#4A4136'),
  'border-strong': solid('#8A7C66'),
  accent: solid('#E2B04A'),
  'on-accent': solid('#16130F'),
  link: solid('#E8C46A'),
  focus: solid('#F6D36B'),
  halo: solid('#16130F'),
  'status-ok': solid('#8CBF6E'),
  'status-watch': solid('#E3C04D'),
  'status-warn': solid('#EE8A4A'),
  'status-bad': solid('#F06A5A'),
  info: solid('#7FB8E0'),
  'nutrient-c': solid('#E3C04D'),
  'nutrient-p': solid('#C99AD6'),
  /** Full-screen dark of the boot gate and title backdrop (GDD 08 3.2). */
  ground: solid('#0E0C0A'),
} satisfies Record<string, Rgba>;

export type ColorToken = keyof typeof COLORS;

/** High-contrast replacements (GDD 08 2.1, T3). Anything not listed keeps its normal value. */
export const HIGH_CONTRAST: Partial<Record<ColorToken, Rgba>> = {
  panel: solid('#000000'),
  'panel-raised': solid('#000000'),
  scrim: a('#000000', 0.95),
  text: solid('#FFFFFF'),
  'text-2': solid('#E6E6E6'),
  'text-3': solid('#E6E6E6'),
  border: solid('#FFFFFF'),
  'border-strong': solid('#FFFFFF'),
  accent: solid('#FFD400'),
  focus: solid('#FFD400'),
  link: solid('#FFD400'),
};

/** GDD 08 2.2 type scale: size and line height in dp (1 dp = 1/16 rem at UI scale 100 %). */
export const TYPE_SCALE = {
  display: { size: 44, line: 52 },
  h1: { size: 28, line: 34 },
  h2: { size: 22, line: 28 },
  h3: { size: 17, line: 24 },
  body: { size: 15, line: 22 },
  small: { size: 13, line: 18 },
  caption: { size: 12, line: 16 },
  'numeric-l': { size: 20, line: 24 },
} as const;

/** Rendered text never goes below this many CSS px, whatever the scale (GDD 08 2.2). */
export const MIN_TEXT_PX = 11;

export const SPACING_DP = [0, 2, 4, 8, 12, 16, 24, 32, 48, 64] as const;
export const RADII_DP = { xs: 2, s: 4, m: 8, pill: 999 } as const;

export const ELEVATION = {
  '0': 'none',
  '1': '0 2px 8px rgba(0,0,0,.35), 0 0 0 1px var(--c-border)',
  '2': '0 8px 28px rgba(0,0,0,.5)',
  '3': 'rgba(10,8,6,.55)',
} as const;

export const FONT_STACKS = {
  serif: '"Source Serif 4 Variable", Georgia, serif',
  sans: '"Inter Variable", system-ui, sans-serif',
  hyperlegible: '"Atkinson Hyperlegible", "Inter Variable", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
} as const;

/** GDD 08 2.4 motion durations (ms) and easings. */
export const MOTION = {
  instant: 0,
  micro: 90,
  fast: 160,
  standard: 240,
  slow: 400,
  scene: 800,
} as const;
export const EASE_ENTER = 'cubic-bezier(0.2,0,0,1)';
export const EASE_EXIT = 'cubic-bezier(0.4,0,1,1)';
export const EASE_SLOW = 'cubic-bezier(0.3,0,0,1)';
export const EASE_SCENE = 'cubic-bezier(0.45,0,0.2,1)';
/** Reduced motion: every transition becomes an opacity fade of this length (GDD 08 2.4). */
export const REDUCED_FADE_MS = 120;

/** Scaling rule (GDD 08 2.3). */
export const SCALE = {
  referenceW: 1280,
  referenceH: 720,
  autoMin: 0.75,
  autoMax: 2.5,
  uiMin: 0.8,
  uiMax: 1.5,
  uiStep: 0.1,
  textScales: [1, 1.15, 1.3] as readonly number[],
  /** Standard layout needs at least this many dp; below it the layout is compact. */
  standardW: 960,
  standardH: 540,
  /** Below this many dp a "Window too small" notice replaces the UI. */
  tooSmallW: 640,
  tooSmallH: 360,
  baseRootPx: 16,
} as const;

/** UI behaviour constants named by the chapter (GDD 08 section 0 table). */
export const UI_BALANCE = {
  unsavedWarnRealS: 60,
  loadingNoteS: 8,
  tooltipDelayMs: 500,
  seedMaxChars: 32,
  trendWindowGameH: 3,
  trendFlatPct: 2,
  trendStrongPct: 10,
  /** Loading stage weights in percent (GDD 08 3.6); they sum to 100. */
  loadingStageWeights: [5, 15, 15, 15, 5, 5, 10, 5, 15, 10] as readonly number[],
  worldgenMaxAttempts: 8,
} as const;

function cssColor(c: Rgba): string {
  if (c.alpha >= 1) return c.hex;
  const n = parseInt(c.hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${c.alpha})`;
}

function colorVars(map: Partial<Record<ColorToken, Rgba>>): string {
  return Object.entries(map).map(([k, v]) => `--c-${k}: ${cssColor(v)};`).join('\n  ');
}

/** The `:root` block of CSS custom properties (colours, type, spacing, radii, elevation, motion). */
export function tokensCss(): string {
  const type = Object.entries(TYPE_SCALE)
    .map(([k, v]) => `--t-${k}: max(${MIN_TEXT_PX}px, calc(${v.size / 16}rem * var(--text-scale)));\n  --t-${k}-lh: calc(${v.line / 16}rem * var(--text-scale));`)
    .join('\n  ');
  const space = SPACING_DP.map((v, i) => `--s-${i}: ${v / 16}rem;`).join('\n  ');
  const radii = Object.entries(RADII_DP).map(([k, v]) => `--r-${k}: ${v === 999 ? '999px' : `${v / 16}rem`};`).join('\n  ');
  const elev = Object.entries(ELEVATION).map(([k, v]) => `--e-${k}: ${v};`).join('\n  ');
  const motion = Object.entries(MOTION).map(([k, v]) => `--m-${k}: ${v}ms;`).join('\n  ');
  return `:root {
  ${colorVars(COLORS)}
  ${type}
  ${space}
  ${radii}
  ${elev}
  ${motion}
  --ease-enter: ${EASE_ENTER};
  --ease-exit: ${EASE_EXIT};
  --ease-slow: ${EASE_SLOW};
  --ease-scene: ${EASE_SCENE};
  --font-serif: ${FONT_STACKS.serif};
  --font-sans: ${FONT_STACKS.sans};
  --font-mono: ${FONT_STACKS.mono};
  --text-scale: 1;
  --halo-width: 2px;
  --focus-width: 2px;
}
:root[data-contrast="high"] {
  ${colorVars(HIGH_CONTRAST)}
  --focus-width: 3px;
}
:root[data-font="hyperlegible"] { --font-sans: ${FONT_STACKS.hyperlegible}; }
`;
}
