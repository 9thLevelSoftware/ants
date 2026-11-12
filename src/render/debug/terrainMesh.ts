// Debug terrain: a regular height grid sampled from the world field (so mound overlays are included), with vertex
// colours from the surface material map and normals from central differences. Plain BufferGeometry, no LOD.
import { BufferAttribute, BufferGeometry, Color } from 'three';
import { hash2u } from '@/core';
import type { Sim } from '@/sim/types';
import { materialFromCode } from '@/sim/types';
import { MATERIAL_COLORS } from './palette';

/** Brightness variation of the vertex colours (+-), so flat ground still shows its shape. */
const COLOR_JITTER = 0.08;

export interface PatchSpec {
  /** World x, z of the first grid point, mm. */
  x0: number;
  z0: number;
  /** Cells along x and z. */
  cells: number;
  /** mm per cell. */
  step: number;
}

const _c = new Color();

function surfaceColor(sim: Sim, x: number, z: number, out: Color): Color {
  const m = sim.world.ground.surface;
  const ix = Math.max(0, Math.min(m.nx - 1, Math.floor(x / m.cell)));
  const iz = Math.max(0, Math.min(m.nz - 1, Math.floor(z / m.cell)));
  out.setHex(MATERIAL_COLORS[materialFromCode(m.data[iz * m.nx + ix])] ?? MATERIAL_COLORS.loam);
  const j = 1 + COLOR_JITTER * ((hash2u(ix, iz, 7) & 0xffff) / 0x8000 - 1);
  return out.multiplyScalar(j);
}

/** Builds (or refills, when `geo` has the right size) the patch geometry. */
export function buildTerrainPatch(sim: Sim, spec: PatchSpec, geo?: BufferGeometry): BufferGeometry {
  const n = spec.cells + 1;
  const count = n * n;
  const g = geo && (geo.getAttribute('position') as BufferAttribute | undefined)?.count === count ? geo : new BufferGeometry();
  const pos = (g.getAttribute('position') as BufferAttribute | undefined) ?? new BufferAttribute(new Float32Array(count * 3), 3);
  const nor = (g.getAttribute('normal') as BufferAttribute | undefined) ?? new BufferAttribute(new Float32Array(count * 3), 3);
  const col = (g.getAttribute('color') as BufferAttribute | undefined) ?? new BufferAttribute(new Float32Array(count * 3), 3);
  const P = pos.array as Float32Array, N = nor.array as Float32Array, C = col.array as Float32Array;
  const f = sim.field, h = spec.step;
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const x = spec.x0 + ix * h, z = spec.z0 + iz * h;
      const i = (iz * n + ix) * 3;
      const y = f.height(x, z);
      P[i] = x; P[i + 1] = y; P[i + 2] = z;
      const dx = (f.height(x + h * 0.5, z) - f.height(x - h * 0.5, z)) / h;
      const dz = (f.height(x, z + h * 0.5) - f.height(x, z - h * 0.5)) / h;
      const l = Math.hypot(dx, 1, dz);
      N[i] = -dx / l; N[i + 1] = 1 / l; N[i + 2] = -dz / l;
      surfaceColor(sim, x, z, _c);
      C[i] = _c.r; C[i + 1] = _c.g; C[i + 2] = _c.b;
    }
  }
  if (!g.getAttribute('position')) {
    g.setAttribute('position', pos);
    g.setAttribute('normal', nor);
    g.setAttribute('color', col);
    const idx = new Uint32Array(spec.cells * spec.cells * 6);
    let k = 0;
    for (let iz = 0; iz < spec.cells; iz++) {
      for (let ix = 0; ix < spec.cells; ix++) {
        const a = iz * n + ix, b = a + 1, c = a + n, d = c + 1;
        // counter-clockwise seen from above (+Y)
        idx[k++] = a; idx[k++] = c; idx[k++] = b;
        idx[k++] = b; idx[k++] = c; idx[k++] = d;
      }
    }
    g.setIndex(new BufferAttribute(idx, 1));
  } else {
    pos.needsUpdate = true; nor.needsUpdate = true; col.needsUpdate = true;
  }
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}
