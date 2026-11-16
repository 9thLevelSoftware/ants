/**
 * The antlion pit's shape (GDD 05 §2.2 / §2.4: a smooth cone, rounded at the bottom, with a low lip of thrown-out
 * sand), shared by the drawn cone (geometry/props.ts) and by anything that must stand on it. Pure maths, no three.
 *
 * The simulation's pit is a hazard record: it does not lower the field, so walkers on the "slope" stay at the flat
 * ground height. Until the sim makes the ground follow the pit, the renderer draws the cone through the unbroken
 * ground (shader/pitDepth.ts). `pitHeightOverlay` builds the patch the sim can register with
 * `field.setHeightOverlay` (negative heights dig the terrain down) so walkers, the camera and the renderer all
 * agree; once the ground at a pit's centre is lowered, the pit renderer switches to real depths (props/pitRenderer).
 */

/** Height of the unit pit (radius 1, depth 1) at radial distance r (0 = centre): -1 at the bottom, 0 at the rim. */
export function pitProfileUnit(r: number, lipFraction: number, lipHeightPerR: number): number {
  const a = Math.abs(r);
  if (a <= 1) return Math.min(0, -1 + Math.pow(a, 1.35));
  if (a >= 1 + lipFraction) return 0;
  const t = (a - 1) / lipFraction;
  return lipHeightPerR * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (1 - t * 0.3);
}

export interface PitShape { pos: { x: number; y: number; z: number }; radius: number }

/** Surface height of a pit of `depth` mm at (x, z), mm (the rim plane outside it). */
export function pitSurfaceY(pit: PitShape, depth: number, x: number, z: number, lipFraction: number, lipHeightPerR: number): number {
  if (pit.radius <= 0) return pit.pos.y;
  const r = Math.hypot(x - pit.pos.x, z - pit.pos.z) / pit.radius;
  const u = pitProfileUnit(r, lipFraction, lipHeightPerR);
  // the drawn mesh is the unit pit scaled by (radius, depth, radius): the lip scales with the depth too
  return pit.pos.y + u * depth;
}

/** A height patch in the shape of field.ts HeightOverlay (heights relative to the rim plane; border points 0). */
export interface PitOverlay { id: number; x0: number; z0: number; cell: number; nx: number; nz: number; h: Float32Array }

/** The pit as a height overlay with grid spacing `cell` mm (cone only: the lip is dressing, not ground). */
export function pitHeightOverlay(id: number, pit: PitShape, depth: number, cell: number): PitOverlay {
  const half = Math.ceil(pit.radius / cell) + 1;
  const n = half * 2 + 1;
  const x0 = pit.pos.x - half * cell, z0 = pit.pos.z - half * cell;
  const h = new Float32Array(n * n);
  for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) {
    const r = Math.hypot(x0 + ix * cell - pit.pos.x, z0 + iz * cell - pit.pos.z) / pit.radius;
    h[iz * n + ix] = r < 1 ? pitProfileUnit(r, 0, 0) * depth : 0;
  }
  return { id, x0, z0, cell, nx: n, nz: n, h };
}
