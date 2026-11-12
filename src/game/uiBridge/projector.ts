// World point -> screen position for the HUD's anchored chips (the context prompt above the possessed ant, GDD 01 9.1 /
// GDD 08 5.3). The UI calls it from its own animation-frame loop, so the chip follows the camera between the four
// snapshot refreshes per second without re-rendering any component.
import { Vector3, type PerspectiveCamera } from 'three';

export interface ScreenPoint {
  x: number;
  y: number;
}

const v = new Vector3();

/** CSS-pixel position of the world point (mm) on the canvas; false when it is behind the camera or off the canvas. */
export function projectToScreen(camera: PerspectiveCamera, canvas: { clientWidth: number; clientHeight: number }, x: number, y: number, z: number, out: ScreenPoint): boolean {
  v.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
  if (v.z >= 0) return false; // behind the camera (camera space looks down -z)
  v.applyMatrix4(camera.projectionMatrix);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  out.x = (v.x * 0.5 + 0.5) * w;
  out.y = (-v.y * 0.5 + 0.5) * h;
  return out.x >= 0 && out.x <= w && out.y >= 0 && out.y <= h;
}
