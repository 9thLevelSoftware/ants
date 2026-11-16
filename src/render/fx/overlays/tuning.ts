// Presentation constants of the world overlays (GDD 08 §10.1): temperature, moisture, threats, dig plans.
// Render-only numbers; colours come from the overlay catalogue (src/ui/overlays/catalogue.ts) so the 3D fields and
// the legends agree.
import type { QualityId } from '@/render/app/quality';
import type { CreatureKind } from '@/sim/types';

/** Scene darkening while any overlay is on (GDD 08 OVERLAY_SCENE_DIM). */
export const OVERLAY_SCENE_DIM = 0.25;

/** Temperature scale of the field and its legend, °C (catalogue SCALE_C). */
export const TEMP_MIN_C = -5;
export const TEMP_MAX_C = 50;
/** Isotherms every 5 °C, labelled every 10 °C (GDD 08 §10.1). */
export const ISOTHERM_STEP_C = 5;
export const ISOTHERM_LABEL_C = 10;
/** Moisture contours at 25 / 50 / 75 %: spacing as a fraction. */
export const MOISTURE_CONTOUR = 0.25;
/** Puddle depth (0.05 mm units of the moisture grid) from which a cell shows as flooded. */
export const FLOODED_PUDDLE = 4;
/** Chamber flood level (Chamber.flooded 0..1) from which a chamber shows as flooded. */
export const FLOODED_CHAMBER = 0.25;

/**
 * Temperature / moisture fill: the ramp colour multiplies the ground (groundShader stain pass), so the ground keeps its
 * texture and brightness. The scene is blended in linear HDR before tone mapping, where an ordinary translucent fill
 * over dark soil reads far more opaque than its alpha; the multiplier avoids that. FILL_ALPHA is the strongest the
 * temperature stain gets (far end of the scale).
 */
export const FILL_ALPHA = 0.65;
/**
 * Moisture stain: none on dry ground. The opacity rises from 0 at MOISTURE_STAIN_START (below the 25 % contour, the
 * lowest band of the legend) to MOISTURE_FILL_MAX at MOISTURE_STAIN_FULL (nearly saturated) and stays there. The
 * simulation's topsoil sits near 0.65 between showers and about 0.77 after a downpour, so a wet world is a tinted one
 * (a quarter to a third opaque) and never an opaque blue sheet: the ground texture stays readable. Paving and dry
 * sand (below 0.25) carry almost no tint.
 */
export const MOISTURE_STAIN_START = 0.15;
export const MOISTURE_STAIN_FULL = 0.85;
export const MOISTURE_FILL_MAX = 0.38;
/**
 * Temperature stain: amp = 1 - exp(-gain x departure from the optimum), the departure 0..1 over the way to the end
 * of the scale. The opacity is FILL_ALPHA x amp and the colour is the ramp at the amplified place (optimum + amp of the
 * way to the end), so a modest departure (a 12 K cold day against a 25 C optimum) is a readable tint while the ground at
 * the optimum stays as it is. The numbers are on the isotherms and the labels; the tint is the warning.
 */
export const TEMP_STAIN_GAIN = 2.4;
/**
 * The stain's colour is the legend ramp at its place, with its chroma scaled by this (1 = the ramp as it is): the pale
 * middle of the diverging scale carries almost no hue, so the temperature stain boosts it.
 */
export const STAIN_CHROMA = { temperature: 1.9, moisture: 1.15 } as const;
/** Share of the ramp's own lightness step kept by the stain (0 = hue only; wetter / off-optimum = darker). */
export const STAIN_LIGHTNESS = 0.1;
/** Standing water and flooded chambers: solid blue (GDD 08 §10.1), opacity. */
export const FLOOD_ALPHA = 0.92;
/** Chamber discs (cavity values) of the temperature and moisture overlays, opacity. */
export const CHAMBER_ALPHA = 0.45;
export const LINE_ALPHA = 0.8;
/** Lift of the draped field above the terrain, mm (plus polygon offset). */
export const FIELD_LIFT_MM = 0.4;
/** The field climbs onto hard surfaces lying on the ground up to this high (paving, kerbs), not onto walls, BU. */
export const DRAPE_MAX_RISE_BU = 6;

/**
 * Region covered by the ground field: a square centred on what the camera looks at, its edge
 * clamp(height above ground x K, MIN, MAX) BU, snapped to 1/SNAP of the edge so it does not swim.
 */
export const REGION = { k: 7, minBu: 120, maxBu: 900, snap: 16 } as const;
/** A raster pass starts at most this often, real s (fields change slowly), unless the region moved. */
export const RASTER_REFRESH_S = 1;

export interface OverlayBudget {
  /** Field texture edge, texels. */
  texels: number;
  /** Draped grid edge, vertices. */
  grid: number;
  /** Texel rows rastered per frame. */
  rowsPerFrame: number;
  /** Isotherm / countdown labels at most. */
  labels: number;
}

export const OVERLAY_BUDGET: Readonly<Record<QualityId, OverlayBudget>> = {
  test: { texels: 96, grid: 64, rowsPerFrame: Infinity, labels: 8 },
  low: { texels: 64, grid: 48, rowsPerFrame: 16, labels: 4 },
  medium: { texels: 96, grid: 64, rowsPerFrame: 24, labels: 6 },
  high: { texels: 128, grid: 96, rowsPerFrame: 32, labels: 8 },
  ultra: { texels: 160, grid: 128, rowsPerFrame: 40, labels: 10 },
};

/** Threats: creature kinds whose area is shown as a predator area (ant predators, GDD 05 §2). */
export const PREDATOR_KINDS: ReadonlySet<CreatureKind> = new Set<CreatureKind>([
  'jumping-spider', 'wolf-spider', 'ant-spider', 'antlion', 'centipede', 'rove-beetle',
]);
/** A live predator's area when it has no territory radius, BU. */
export const PREDATOR_REACH_BU = 12;
/** Danger grid value (GDD 05 §2.4 DANGER_ADD units) shown at full strength. */
export const DANGER_FULL = 2;
/** Labels: world height above the ground, BU, and screen height as a fraction of the viewport. */
export const LABEL_LIFT_BU = 3;
export const LABEL_SCREEN_H = 0.028;

/** Render orders: the ground field under the scent glyphs; dimming before every overlay. */
export const DIM_RENDER_ORDER = 880;
export const FIELD_RENDER_ORDER = 890;
export const LABEL_RENDER_ORDER = 960;
