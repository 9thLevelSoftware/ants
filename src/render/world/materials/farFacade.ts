// Far walls (look pass 3, "far structures read as pale straight-edged blocks", review: a render-side remedy was asked for and not tried).
// At an ant's distance a building is a few hundred pixels of wall whose texture has long faded to its mean: lit by the sun and
// metered to the haze it became a flat pale plane. Beyond FAR_FACADE.startMm a wall (a surface with little up in its normal) takes a
// weathering that is large in world space, so it survives the distance: tall rain streaks, a darker band of splashed dirt at the base
// and faint storey lines. All numbers are here; the GLSL only reads them. Albedo only (no geometry is invented: no windows).
export const FAR_FACADE = {
  /** Distance (mm) from which the pattern fades in, and where it is full. */
  startMm: 3000, fullMm: 14000,
  /** Streaks: depth (share of albedo) and the world size of the noise cell across and along the wall. */
  streak: 0.14, streakAcrossMm: 420, streakTallMm: 5200,
  /** Storey lines: depth, the storey height and the line half-width (share of a storey). */
  line: 0.1, storeyMm: 2700, lineWidth: 0.012,
  /** Splashed dirt: depth and the height it reaches (mm above y = 0, the ground of the locality). */
  grime: 0.22, grimeMm: 1400,
  /** How far from vertical a face may be to count as a wall: |n.y| below `wallFrom` is a wall, above `wallTo` it is not. */
  wallFrom: 0.35, wallTo: 0.8,
} as const;

const f = (v: number) => v.toFixed(4);

/** GLSL block (needs wrNoise, wrN0, vWrW, wrDist and wrAlb in scope: surfacePatch.ts). */
export const FAR_FACADE_GLSL = /* glsl */ `
{
  float wfK = smoothstep(${f(FAR_FACADE.startMm)}, ${f(FAR_FACADE.fullMm)}, wrDist) * (1.0 - smoothstep(${f(FAR_FACADE.wallFrom)}, ${f(FAR_FACADE.wallTo)}, abs(wrN0.y)));
  if (wfK > 0.001) {
    float wfStreak = wrNoise(vec2((vWrW.x + vWrW.z) / ${f(FAR_FACADE.streakAcrossMm)}, vWrW.y / ${f(FAR_FACADE.streakTallMm)}));
    float wfSt = fract(vWrW.y / ${f(FAR_FACADE.storeyMm)});
    float wfLine = 1.0 - smoothstep(0.0, ${f(FAR_FACADE.lineWidth)}, min(wfSt, 1.0 - wfSt));
    float wfGrime = 1.0 - smoothstep(0.0, ${f(FAR_FACADE.grimeMm)}, vWrW.y);
    wrAlb *= 1.0 - wfK * (${f(FAR_FACADE.streak)} * wfStreak + ${f(FAR_FACADE.line)} * wfLine + ${f(FAR_FACADE.grime)} * wfGrime);
  }
}`;
