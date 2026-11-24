// Shared by the camera-clearance tests of the possession camera (views.verify.test.ts, reviewFixes.test.ts).
import type { Sim } from '@/sim/types';
import type { ViewDirector } from './viewDirector';

/**
 * f(camera) as the picture sees it. The cell camera (look pass 6, cellCam.ts) takes over where the rig's camera is squeezed against the ant (the queen-sized
 * shaft): it stands in soil that its cut-away removes, so that counts as the clearance the rig keeps; while it blends in (0.5 s) the camera is in free air but
 * may stand closer to the wall than the margin, which counts too. Inside solid the cut-away does not remove is never clear.
 */
export function clearFieldAt(d: ViewDirector, sim: Sim, p: { x: number; y: number; z: number }): number {
  const f = sim.field.sampleXYZ(p.x, p.y, p.z), margin = d.third.clearanceMm;
  if (d.cameraInCutAway(p)) return Math.max(f, margin);
  return d.cellState().weight > 0 && f > 0 ? Math.max(f, margin) : f;
}
