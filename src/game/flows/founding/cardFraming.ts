// Where the cell stands in the frame behind a centred card (app-seams-4 item 5): between the top of the screen (the HUD's top band stands
// at the corners, so the middle column is free from a small margin) and the card's top edge. Pure arithmetic in screen pixels; the
// shot's `lift` (how far above the middle of the frame, 0..1 of the half height) and `fill` (the subject sphere's share of the half height,
// foundingShot.ts) follow from it. The card is `.fo-card` (ui/screens/founding): centred, about CARD_HALF_REM tall on each side of the middle.
import { FSHOT_FOV_DEG, FSHOT_PITCH_DEG } from '@/render/camera';

/** Half the card's height in rem (1.5 rem padding twice, a heading, a line and a button row: 160 px at 16 px). */
export const CARD_HALF_REM = 5;
/** Margin above the cell (rem) and between the cell and the card (rem). */
export const CARD_TOP_MARGIN_REM = 1.5;
export const CARD_GAP_REM = 1;

export interface CardFraming { lift: number; fill: number }

/**
 * `heightPx` the canvas height, `remPx` the root font size. The subject circle is centred in the free band between the top margin and the
 * card, and fills it. Falls back to the band of a 720 px screen at 16 px per rem when the numbers are not usable.
 */
export function cardFraming(heightPx: number, remPx: number): CardFraming {
  const h = heightPx > 100 && Number.isFinite(heightPx) ? heightPx : 720;
  const rem = remPx > 4 && Number.isFinite(remPx) ? remPx : 16;
  const top = CARD_TOP_MARGIN_REM * rem, bottom = h / 2 - (CARD_HALF_REM + CARD_GAP_REM) * rem;
  const band = Math.max(40, bottom - top), centre = top + band / 2;
  const half = h / 2;
  const lift = Math.min(0.9, Math.max(0, (half - centre) / half));
  // the sphere of radius r at distance d spans r / (d tan(fov / 2)) of the half height; foundingShotDistance uses d = r / (fill sin(fov / 2))
  const fill = Math.min(0.92, ((band / 2) / half) / Math.cos((FSHOT_FOV_DEG * Math.PI) / 360));
  return { lift, fill };
}

/**
 * The slice plane is the nearest part of the cell to the camera, and nearer things are drawn larger: a point `sin(pitch) r` closer than the
 * subject's centre is magnified by d / (d - sin(pitch) r), d = r / (fill sin(fov / 2)) (foundingShotDistance). The subject radius is grown by
 * this factor so the cell still fits the band (real founding of seed 1, `u12-s1/12b-outcome-card-settled.png`: a cell reaching 12 % past its sphere
 * was cut by the top of the frame).
 */
export function perspectiveGrow(fill: number): number {
  const near = Math.sin((FSHOT_PITCH_DEG * Math.PI) / 180) * fill * Math.sin((FSHOT_FOV_DEG * Math.PI) / 360);
  return 1 / Math.max(0.5, 1 - near);
}
