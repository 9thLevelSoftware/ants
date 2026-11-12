// A stand-in ant as ONE merged geometry in units of body length (L = 1): gaster, thorax and head ellipsoids, a
// petiole and three leg pairs, feet on y = 0, facing +X, up +Y, right +Z. Scaled per instance to the real length.
import { BoxGeometry, SphereGeometry, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

interface Part { geo: BufferGeometry; x: number; y: number; z: number; sx: number; sy: number; sz: number; rotY?: number }

function place(p: Part): BufferGeometry {
  const g = p.geo;
  g.scale(p.sx, p.sy, p.sz);
  if (p.rotY) g.rotateY(p.rotY);
  g.translate(p.x, p.y, p.z);
  return g;
}

/** Body height above the feet, in L. */
export const ANT_BODY_Y = 0.16;

export function buildAntShape(): BufferGeometry {
  const s = () => new SphereGeometry(1, 12, 8);
  const y = ANT_BODY_Y;
  const parts: Part[] = [
    { geo: s(), x: -0.27, y: y + 0.01, z: 0, sx: 0.21, sy: 0.15, sz: 0.15 }, // gaster
    { geo: s(), x: -0.05, y, z: 0, sx: 0.045, sy: 0.05, sz: 0.04 }, // petiole
    { geo: s(), x: 0.08, y, z: 0, sx: 0.14, sy: 0.07, sz: 0.065 }, // thorax
    { geo: s(), x: 0.3, y: y + 0.01, z: 0, sx: 0.1, sy: 0.08, sz: 0.09 }, // head
  ];
  // legs: thin bars from the thorax down and out to both sides (one box per pair, slightly splayed)
  const legX = [-0.02, 0.08, 0.18];
  const legRot = [0.35, 0, -0.35];
  const knee = y * 0.55, span = 0.31;
  legX.forEach((x, i) => {
    parts.push({ geo: new BoxGeometry(1, 1, 1), x, y: knee, z: 0, sx: 0.025, sy: 0.02, sz: 2 * span, rotY: legRot[i] });
    // lower legs down to the feet on y = 0, at the (rotated) bar ends
    for (const side of [-1, 1]) {
      const dz = side * span * Math.cos(legRot[i]), dx = side * span * Math.sin(legRot[i]);
      parts.push({ geo: new BoxGeometry(1, 1, 1), x: x + dx, y: knee / 2, z: dz, sx: 0.02, sy: knee, sz: 0.02 });
    }
  });
  // antennae: two thin bars forward from the head
  parts.push({ geo: new BoxGeometry(1, 1, 1), x: 0.42, y: y + 0.06, z: 0.05, sx: 0.22, sy: 0.015, sz: 0.015, rotY: -0.35 });
  parts.push({ geo: new BoxGeometry(1, 1, 1), x: 0.42, y: y + 0.06, z: -0.05, sx: 0.22, sy: 0.015, sz: 0.015, rotY: 0.35 });
  const geos = parts.map(place).map((g) => g.index ? g.toNonIndexed() : g);
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (!merged) throw new Error('debug ant shape: mergeGeometries failed');
  merged.computeVertexNormals();
  return merged;
}
