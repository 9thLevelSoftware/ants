// Stable shadow-map placement (pure, tested): the sun's orthographic shadow frustum follows the view, centred a
// little ahead of the subject (spike 2.4), and its centre is snapped to whole shadow texels in light space so the
// shadow edges do not crawl when the camera moves.
import { Vector3 } from 'three';

const fwd = new Vector3(), right = new Vector3(), up = new Vector3(), tmp = new Vector3();

/** Light-space basis for a light shining along -toLight. */
export function lightBasis(toLight: Vector3, outRight: Vector3, outUp: Vector3, outFwd: Vector3): void {
  outFwd.copy(toLight).normalize().negate();
  tmp.set(0, 1, 0);
  if (Math.abs(outFwd.y) > 0.999) tmp.set(0, 0, 1);
  outRight.crossVectors(tmp, outFwd).normalize();
  outUp.crossVectors(outFwd, outRight).normalize();
}

/**
 * Snaps a world-space centre so that its light-space x/y are whole multiples of the shadow texel.
 * `halfExtent` mm, `mapSize` texels. Writes into out and returns it.
 */
export function snapShadowCenter(center: Vector3, toLight: Vector3, halfExtent: number, mapSize: number, out: Vector3): Vector3 {
  lightBasis(toLight, right, up, fwd);
  const texel = (2 * halfExtent) / mapSize;
  const x = Math.round(center.dot(right) / texel) * texel;
  const y = Math.round(center.dot(up) / texel) * texel;
  const z = center.dot(fwd);
  return out.set(0, 0, 0).addScaledVector(right, x).addScaledVector(up, y).addScaledVector(fwd, z);
}

/** Frustum centre ahead of the subject along the horizontal view direction. */
export function shadowFocus(subject: Vector3, viewDir: Vector3, aheadMm: number, out: Vector3): Vector3 {
  tmp.set(viewDir.x, 0, viewDir.z);
  if (tmp.lengthSq() < 1e-8) tmp.set(0, 0, -1);
  tmp.normalize();
  return out.copy(subject).addScaledVector(tmp, aheadMm);
}
