// Surface detail on the big flat faces of built things, by material kind (look pass 4, "far structures are slabs"):
// a wall, a shed, a car body or a kerb seen from an ant's height is a large flat face, and at 3 to 6 m on an ant's scale the scan's
// detail averages out and the haze covers it: a pale untextured block. This adds, from the prim's own size (the way fence boards do,
// surfacePatch.ts WR_BOARDS) and with no per-seed or per-object case:
//   masonry (brick, render, concrete, stone, mortar): a darker, damper plinth along the foot of a tall face; brick courses with
//     staggered joints; panel or render seams (1.2 x 0.6 m) on the other masonry;
//   metal: standing seams with a tint per panel and a fold line half way up;
// each fading out where a line would be under about 3 pixels (no moire), and keeping part of its colour through the fog so the haze
// tints the face instead of bleaching it to the sky colour. Wood keeps its boards (FENCE_BOARDS).
import type { MaterialDef } from './materialDefs';

export const FACE = {
  /** A face is detailed when both its sides are at least this long, mm (a 150 mm kerb is not). */
  minFaceMm: 250,
  /** Plinth: height of the band and the shortest face that gets one, mm; albedo multiplier; greenish damp tint. */
  plinthMm: 150, plinthMinHeightMm: 600, plinthDark: 0.7, plinthDamp: 0.5,
  /** Brick course height and brick length, mm; share of mortar colour. */
  courseMm: 75, brickMm: 215, mortarMix: 0.5, mortarRgb: [0.62, 0.58, 0.5],
  /** Other masonry: seam grid (across, up), mm; seam width as a fraction of a panel; darkening. */
  panelMm: [1200, 600], seamW: 0.025, seamDark: 0.5,
  /** Metal: standing seam spacing, mm; seam width fraction; darkening; panel tint spread; fold line height share. */
  metalSeamMm: 380, metalSeamW: 0.03, metalSeamDark: 0.55, metalTint: 0.14, foldAt: 0.5,
  /** Lines fade out between these fractions of a pattern period per pixel. */
  fadeFrom: 0.35, fadeTo: 0.9,
  /** Share of the face's own colour that survives the fog. */
  fogKeep: 0.7,
  /** Wooden bodies that are not thin panels (a shed, a bin, a table): board width, mm, and the share of gap darkening / tint spread (as FENCE_BOARDS). */
  woodBoardMm: 150, woodGapDark: 0.5, woodTintVar: 0.26,
} as const;

export type FaceKind = 'brick' | 'panel' | 'metal' | null;

const PANEL_MATERIALS: ReadonlySet<string> = new Set(['plaster', 'concrete', 'stone', 'mortar']);

/** Which face detail a material gets (wood has its own boards). */
export function faceKindOf(def: Pick<MaterialDef, 'id'>): FaceKind {
  if (def.id === 'brick') return 'brick';
  if (PANEL_MATERIALS.has(def.id)) return 'panel';
  if (def.id === 'metal') return 'metal';
  return null;
}

const f = (n: number) => n.toFixed(3);

export const FACE_DETAIL_FRAG = /* glsl */ `
#ifdef WR_FACE
float wrFogKeep = 0.0;
{
  vec3 an = abs(vWrN);
  float fx = step(0.7, an.x), fz = step(0.7, an.z) * (1.0 - fx);
  float fw = 2.0 * (fx > 0.5 ? vWrSz.z : vWrSz.x), fh = 2.0 * vWrSz.y;
  if (fx + fz > 0.5 && fw >= ${f(FACE.minFaceMm)} && fh >= ${f(FACE.minFaceMm)}) {
    float u = fx > 0.5 ? vWrP.z : vWrP.x;
    float yb = vWrP.y + vWrSz.y;
    #ifdef WR_FACE_BRICK
    {
      float cy = yb / ${f(FACE.courseMm)}, row = floor(cy), cu = u / ${f(FACE.brickMm)} + 0.5 * mod(row, 2.0);
      float fy = fwidth(cy), fu = fwidth(cu), hf = fract(cu);
      float bed = 1.0 - smoothstep(0.1, 0.1 + max(fy, 0.05), fract(cy));
      float head = 1.0 - smoothstep(0.04, 0.04 + max(fu, 0.04), min(hf, 1.0 - hf));
      float k = 1.0 - smoothstep(${f(FACE.fadeFrom)}, ${f(FACE.fadeTo)}, max(fy, fu));
      wrAlb = mix(wrAlb, vec3(${FACE.mortarRgb.map(f).join(', ')}), max(bed, head) * k * ${f(FACE.mortarMix)});
    }
    #elif defined( WR_FACE_METAL )
    {
      float mx = u / ${f(FACE.metalSeamMm)}, fm = fwidth(mx), mf = fract(mx);
      float k = 1.0 - smoothstep(${f(FACE.fadeFrom)}, ${f(FACE.fadeTo)}, fm);
      float seam = 1.0 - smoothstep(${f(FACE.metalSeamW)}, ${f(FACE.metalSeamW)} + max(fm, 0.02), min(mf, 1.0 - mf));
      float fy = yb / max(fh, 1.0) - ${f(FACE.foldAt)}, ff = fwidth(fy);
      float fold = (1.0 - smoothstep(0.004, 0.004 + max(ff, 0.01), abs(fy))) * (1.0 - smoothstep(${f(FACE.fadeFrom)}, ${f(FACE.fadeTo)}, ff * fh / ${f(FACE.metalSeamMm)}));
      float tint = 1.0 - ${f(FACE.metalTint / 2)} + ${f(FACE.metalTint)} * wrHash12(vec2(floor(mx), 7.0));
      wrAlb *= mix(1.0, tint, k) * (1.0 - ${f(FACE.metalSeamDark)} * max(seam * k, fold));
    }
    #else
    {
      float px = u / ${f(FACE.panelMm[0])}, py = yb / ${f(FACE.panelMm[1])}, fpx = fwidth(px), fpy = fwidth(py);
      float sx = 1.0 - smoothstep(${f(FACE.seamW)}, ${f(FACE.seamW)} + max(fpx, 0.02), min(fract(px), 1.0 - fract(px)));
      float sy = 1.0 - smoothstep(${f(FACE.seamW)}, ${f(FACE.seamW)} + max(fpy, 0.02), min(fract(py), 1.0 - fract(py)));
      float k = 1.0 - smoothstep(${f(FACE.fadeFrom)}, ${f(FACE.fadeTo)}, max(fpx, fpy));
      wrAlb *= 1.0 - ${f(FACE.seamDark)} * max(sx, sy) * k;
    }
    #endif
    #ifndef WR_FACE_METAL
    if (fh >= ${f(FACE.plinthMinHeightMm)}) {
      float pl = 1.0 - smoothstep(${f(FACE.plinthMm)}, ${f(FACE.plinthMm + 25)}, yb);
      wrAlb *= mix(vec3(1.0), vec3(${f(FACE.plinthDark * 0.94)}, ${f(FACE.plinthDark)}, ${f(FACE.plinthDark * 0.9)}), pl * ${f(FACE.plinthDamp + 0.5)});
    }
    #endif
    wrFogKeep = ${f(FACE.fogKeep)};
  }
}
#endif
#ifdef WR_BOARDS
if (wrFogKeep <= 0.0) { // a wooden body that is not a thin panel: upright boards on its big faces
  vec3 an = abs(vWrN);
  float fx = step(0.7, an.x), fz = step(0.7, an.z) * (1.0 - fx);
  float fw = 2.0 * (fx > 0.5 ? vWrSz.z : vWrSz.x), fh = 2.0 * vWrSz.y;
  if (fx + fz > 0.5 && fw >= ${f(FACE.minFaceMm)} && fh >= ${f(FACE.minFaceMm)}) {
    float bu = (fx > 0.5 ? vWrP.z : vWrP.x) / ${f(FACE.woodBoardMm)};
    float bfw = fwidth(bu), bf = fract(bu), be = min(bf, 1.0 - bf);
    float gap = 1.0 - smoothstep(0.02, 0.02 + max(bfw, 0.05), be);
    float keep = 1.0 - smoothstep(${f(FACE.fadeFrom)}, ${f(FACE.fadeTo)}, bfw);
    float tint = 1.0 - ${f(FACE.woodTintVar / 2)} + ${f(FACE.woodTintVar)} * wrHash12(vec2(floor(bu), fx * 3.0 + fz * 5.0 + 11.0));
    wrAlb *= mix(1.0, (1.0 - ${f(FACE.woodGapDark)} * gap) * tint, keep);
    wrFogKeep = ${f(FACE.fogKeep)};
  }
}
#endif`;
