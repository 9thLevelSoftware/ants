// Overlay controls and legends, pure part (GDD 08 10.1, GDD 08 4.3): which overlays exist, their keys and icons, the
// colour-blind-safe palettes, and the legend each overlay shows. Every channel has a pattern of its own, so the palette
// setting `pattern-only` (monochrome) still tells them apart (GDD 08 App. E check 19). The 3D overlays are drawn by the
// scent-fx task; this file only describes what they mean.
export const OVERLAY_IDS = ['scent', 'temperature', 'moisture', 'threats', 'dig-plans'] as const;
export type OverlayId = (typeof OVERLAY_IDS)[number];

/** Overlays of which only one is active at a time; scent combines with any one of them (GDD 08 10.1). */
export const EXCLUSIVE_OVERLAYS: readonly OverlayId[] = ['temperature', 'moisture', 'threats', 'dig-plans'];

export type PaletteId = 'okabe-ito' | 'high-contrast' | 'pattern-only';

export const OVERLAY_WORD: Record<OverlayId, string> = {
  scent: 'Scent', temperature: 'Temperature', moisture: 'Moisture', threats: 'Threats', 'dig-plans': 'Dig plans',
};
export const OVERLAY_ICON: Record<OverlayId, string> = {
  scent: 'overlay-scent', temperature: 'overlay-temperature', moisture: 'overlay-moisture', threats: 'overlay-threats', 'dig-plans': 'overlay-dig-plans',
};
/** The input action of an overlay's key: V toggles the scent view, O cycles the others. */
export const OVERLAY_ACTION: Record<OverlayId, string> = {
  scent: 'scent-view', temperature: 'overlay-cycle', moisture: 'overlay-cycle', threats: 'overlay-cycle', 'dig-plans': 'overlay-cycle',
};

/** Pattern ids; each is drawn as an SVG pattern by overlays/patterns.tsx. Independent of colour (check 19). */
export const PATTERN_IDS = ['chevron', 'stipple', 'zigzag', 'rings', 'hatch', 'cross-hatch', 'dashed', 'dotted', 'solid', 'waves', 'grey-dash'] as const;
export type PatternId = (typeof PATTERN_IDS)[number];

export const OKABE_ITO = {
  orange: '#E69F00', skyBlue: '#56B4E9', bluishGreen: '#009E73', yellow: '#F0E442', blue: '#0072B2', vermillion: '#D55E00', reddishPurple: '#CC79A7', paper: '#F2EFE6',
} as const;

/** Ink of an entry in a palette: Okabe-Ito hue, high contrast (white or yellow), pattern only (the text colour). */
export function inkFor(palette: PaletteId, hue: string, index: number): string {
  if (palette === 'okabe-ito') return hue;
  if (palette === 'high-contrast') return index % 2 === 0 ? '#FFFFFF' : '#FFD400';
  return '#EEE7D7';
}

export interface LegendEntry {
  id: string;
  label: string;
  /** Short note: the encoding of intensity, a unit, a reason. */
  note?: string;
  pattern: PatternId;
  hue: string;
}

export interface LegendScale {
  /** Gradient stops, hex, from the low end to the high end. */
  stops: string[];
  /** Tick labels with their position 0..1. */
  ticks: { at: number; label: string }[];
  lowWord: string;
  highWord: string;
  /** A marked band (the species' comfort band), positions 0..1. */
  band?: { from: number; to: number; label: string };
  caption: string;
}

export interface Legend {
  id: OverlayId;
  title: string;
  entries: LegendEntry[];
  scale?: LegendScale;
  /** One line under the entries: how intensity is encoded or what the contours mean. */
  footnote: string;
}

const SCALE_C = { min: -5, max: 50 };

function tempScale(band: { lo: number; hi: number } | null): LegendScale {
  const pos = (c: number): number => (c - SCALE_C.min) / (SCALE_C.max - SCALE_C.min);
  const ticks = [0, 10, 20, 30, 40, 50].map((c) => ({ at: pos(c), label: `${c}` }));
  return {
    stops: [OKABE_ITO.blue, OKABE_ITO.paper, OKABE_ITO.vermillion], ticks, lowWord: 'Cold', highWord: 'Hot', caption: '°C',
    band: band ? { from: pos(band.lo), to: pos(band.hi), label: `Brood ${band.lo}-${band.hi} °C` } : undefined,
  };
}

const MOISTURE_SCALE: LegendScale = {
  stops: ['#F3E3C3', OKABE_ITO.skyBlue, OKABE_ITO.blue], lowWord: 'Dry', highWord: 'Saturated', caption: 'moisture',
  ticks: [{ at: 0.25, label: '25 %' }, { at: 0.5, label: '50 %' }, { at: 0.75, label: '75 %' }],
};

/** The legend of an overlay (GDD 08 10.1 table). `comfort` is the species' brood band for the temperature scale. */
export function legendFor(id: OverlayId, comfort: { lo: number; hi: number } | null = null): Legend {
  switch (id) {
    case 'scent':
      return {
        id, title: 'Scent view', footnote: 'Intensity: opacity and density.',
        entries: [
          { id: 'trail', label: 'Trail', note: 'towards the food', pattern: 'chevron', hue: OKABE_ITO.orange },
          { id: 'home', label: 'Home', note: 'colony smell', pattern: 'stipple', hue: OKABE_ITO.skyBlue },
          { id: 'alarm', label: 'Alarm', note: 'spreading', pattern: 'zigzag', hue: OKABE_ITO.vermillion },
          { id: 'food', label: 'Food odour', note: 'around a source', pattern: 'rings', hue: OKABE_ITO.bluishGreen },
          { id: 'rival', label: 'Rival colony', note: 'same glyphs, hatched', pattern: 'hatch', hue: OKABE_ITO.reddishPurple },
        ],
      };
    case 'temperature':
      return { id, title: 'Temperature', entries: [], scale: tempScale(comfort), footnote: 'Contour lines every 5 °C, labelled every 10 °C.' };
    case 'moisture':
      return {
        id, title: 'Moisture', scale: MOISTURE_SCALE, footnote: 'Contour lines at 25, 50 and 75 %.',
        entries: [{ id: 'flooded', label: 'Flooded', note: 'solid, with waves', pattern: 'waves', hue: OKABE_ITO.blue }],
      };
    case 'threats':
      return {
        id, title: 'Threats', footnote: 'Each class has its own pattern.',
        entries: [
          { id: 'predator', label: 'Predator area', note: 'with its creature icon', pattern: 'hatch', hue: OKABE_ITO.vermillion },
          { id: 'rival-territory', label: 'Rival territory', note: 'outline', pattern: 'solid', hue: OKABE_ITO.reddishPurple },
          { id: 'hot', label: 'Hot surface', pattern: 'stipple', hue: OKABE_ITO.orange },
          { id: 'human', label: 'Human event forecast', note: 'with a countdown', pattern: 'dashed', hue: '#FFFFFF' },
        ],
      };
    case 'dig-plans':
      return {
        id, title: 'Dig plans', footnote: 'Stalled plans carry their reason.',
        entries: [
          { id: 'proposed', label: 'Proposed', note: 'by the architect', pattern: 'dotted', hue: OKABE_ITO.skyBlue },
          { id: 'queued', label: 'Queued', pattern: 'dashed', hue: OKABE_ITO.yellow },
          { id: 'active', label: 'Active', note: 'carved part filled', pattern: 'solid', hue: OKABE_ITO.yellow },
          { id: 'stalled', label: 'Stalled', note: 'with a reason', pattern: 'cross-hatch', hue: OKABE_ITO.vermillion },
          { id: 'paused', label: 'Paused', pattern: 'grey-dash', hue: '#9A9A9A' },
        ],
      };
  }
}

/** Words for a stalled plan's reason id (the nest module's `blockedReason`). */
export const BLOCKED_WORD: Readonly<Record<string, string>> = {
  'no-diggers': 'No diggers free', 'no-haulers': 'No one to haul the soil', unreachable: 'Cannot be reached', flooded: 'Water in the way',
  obstructed: 'Something is in the way', unstable: 'The ceiling is unstable', temperature: 'Too cold to dig', season: 'Out of season',
  'foreign-contact': 'Rival workers nearby', invalidated: 'The wall changed', cap: 'Too many plans',
};

/** Overlay state rules: turning one exclusive overlay on turns the other exclusive ones off; scent is independent. */
export interface OverlaySet {
  scent: boolean;
  /** The active exclusive overlay or null. */
  other: Exclude<OverlayId, 'scent'> | null;
}

export function applyOverlay(s: OverlaySet, id: OverlayId, on: boolean): OverlaySet {
  if (id === 'scent') return { ...s, scent: on };
  if (on) return { ...s, other: id as OverlaySet['other'] };
  return s.other === id ? { ...s, other: null } : s;
}

/** The O key: off -> temperature -> moisture -> threats -> dig plans -> off. */
export function cycleOverlay(s: OverlaySet): OverlaySet {
  const i = s.other ? EXCLUSIVE_OVERLAYS.indexOf(s.other) : -1;
  const next = i + 1 < EXCLUSIVE_OVERLAYS.length ? EXCLUSIVE_OVERLAYS[i + 1] : null;
  return { ...s, other: next as OverlaySet['other'] };
}

export function isActive(s: OverlaySet, id: OverlayId): boolean {
  return id === 'scent' ? s.scent : s.other === id;
}

/**
 * The overlays whose legend is on screen: the ones switched on, plus the dig-plans legend while the dig tool is active in
 * the colony view (GDD 08 10.1: "always on in colony view while the dig tool is active"), so plan status and the reason a
 * plan is blocked can be read without pressing O four times.
 */
export function shownLegends(s: OverlaySet, digToolActive: boolean): OverlayId[] {
  return OVERLAY_IDS.filter((id) => isActive(s, id) || (id === 'dig-plans' && digToolActive));
}
