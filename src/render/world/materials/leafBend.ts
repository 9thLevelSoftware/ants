// Render-only leaf bend (pure; the GLSL below and the CPU mirror `leafBendMm` share one set of constants). Leaf-finish
// primitives are cupped across the blade (margins lifted toward the sky) and bent along it (tip down on a tilted leaf,
// tip up on a leaf lying flat, which rests on the ground or on a wide support). The collision box the walker stands
// on stays flat, so each bend is capped in mm: an ant on a leaf floats or sinks by at most `maxMm` (0.25 BU of the
// smallest species, Lasius, 4 mm; a 1.2 mm cupped margin on a 40 mm leaf was 0.6 BU: look-pass review), and a
// rosette leaf lying on the soil never pushes its tip below the terrain.
import { FINISH } from '../dressing/finishes';

export const LEAF_BEND = {
  /** Margin lift, fraction of the half width. */
  cup: 0.12,
  /** Tip bend, fraction of the half length. */
  droop: 0.06,
  /** Cap on the cup and the tip bend together, mm. */
  maxMm: 1,
  /** |local up . world up| from which a leaf counts as lying flat (its tip curls up instead of drooping): smoothstep. */
  flatLo: 0.9,
  flatHi: 0.97,
} as const;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Local-y displacement (mm) of a leaf box's point at local (lx, lz). `hx`, `hz` = half length and half width;
 * `upY` = world-up component of the leaf's local +y axis (which face looks at the sky).
 */
export function leafBendMm(hx: number, hz: number, lx: number, lz: number, upY: number): number {
  const v = lz / Math.max(hz, 1e-3), t = Math.max(0, lx / Math.max(hx, 1e-3));
  const face = upY >= 0 ? 1 : -1;
  const tip = -1 + 2 * smoothstep(LEAF_BEND.flatLo, LEAF_BEND.flatHi, Math.abs(upY)); // -1 droop .. +1 curl up
  const cup = LEAF_BEND.cup * hz, bend = LEAF_BEND.droop * hx;
  const k = Math.min(1, LEAF_BEND.maxMm / Math.max(cup + bend, 1e-6)); // both together stay within the cap
  return face * k * (cup * v * v + tip * bend * t * t);
}

/** GLSL of the bend (needs the per-instance `iLook`, `iSize` and `instanceMatrix`). */
export const LEAF_BEND_GLSL = /* glsl */ `
bool wrIsLeaf() { return abs(iLook.x - ${FINISH.leaf}.0) < 0.5; }
// amplitudes (cup, tip) in mm with their signs in local y, from the leaf's size and which way it faces
vec2 wrLeafAmp() {
  float upY = normalize(vec3(instanceMatrix[1].xyz)).y;
  float face = upY >= 0.0 ? 1.0 : -1.0;
  float tip = -1.0 + 2.0 * smoothstep(${LEAF_BEND.flatLo.toFixed(3)}, ${LEAF_BEND.flatHi.toFixed(3)}, abs(upY));
  vec2 a = vec2(${LEAF_BEND.cup.toFixed(3)} * iSize.z, ${LEAF_BEND.droop.toFixed(3)} * iSize.x);
  float k = min(1.0, ${LEAF_BEND.maxMm.toFixed(3)} / max(a.x + a.y, 1e-6)); // both together stay within the cap
  return face * k * vec2(a.x, tip * a.y);
}
float wrLeafBend(vec3 p) {
  if (!wrIsLeaf()) return 0.0;
  float v = p.z / max(iSize.z, 1e-3), t = max(0.0, p.x / max(iSize.x, 1e-3));
  vec2 a = wrLeafAmp();
  return a.x * v * v + a.y * t * t;
}
vec3 wrLeafBendNormal(vec3 p, vec3 n) {
  if (!wrIsLeaf()) return n;
  float v = p.z / max(iSize.z, 1e-3), t = max(0.0, p.x / max(iSize.x, 1e-3));
  vec2 a = wrLeafAmp();
  float dydz = 2.0 * a.x * v / max(iSize.z, 1e-3), dydx = 2.0 * a.y * t / max(iSize.x, 1e-3);
  return normalize(n + vec3(-dydx, 0.0, -dydz) * n.y);
}
`;
