// Water standing in flooded nest cavities (GDD 03 App. F12): one flat sheet at the nest's water level over every
// flooded carve sample that is open but dry above (src/sim/nest/flood floodSurface). Rebuilt when the level or the
// cell count changes, at most every FLOOD_REBUILD_S. Slightly emissive so it reads in the dim nest light; a faint
// moving sheen when the clock runs.
import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial } from 'three';
import type { Sim } from '@/sim/types';
import { floodSurface } from '@/sim/nest/flood/surface';
import {
  FLOOD_LEVEL_EPS_MM, FLOOD_REBUILD_S, FLOOD_WATER_EMISSIVE, FLOOD_WATER_ENV, FLOOD_WATER_OPACITY, FLOOD_WATER_RGB, FLOOD_WATER_ROUGHNESS,
} from './tuning';

interface Sheet { mesh: Mesh; level: number; cells: number }

export class FloodWater {
  readonly group = new Group();
  private readonly material: MeshStandardMaterial;
  private readonly sheets = new Map<number, Sheet>();
  private sinceBuild = Infinity;
  /** Cells drawn over all nests (stats). */
  cells = 0;

  constructor() {
    this.group.name = 'weather.flood-water';
    const c = new Color(FLOOD_WATER_RGB[0], FLOOD_WATER_RGB[1], FLOOD_WATER_RGB[2]);
    this.material = new MeshStandardMaterial({
      color: c, roughness: FLOOD_WATER_ROUGHNESS, metalness: 0, transparent: true, opacity: FLOOD_WATER_OPACITY, side: DoubleSide,
      emissive: new Color(0.5, 0.6, 0.55).multiplyScalar(FLOOD_WATER_EMISSIVE), envMapIntensity: FLOOD_WATER_ENV, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1,
    });
  }

  /** Follows the nests' water (dt real seconds; 0 = settle now). */
  update(sim: Sim | null, dt: number): void {
    this.sinceBuild += dt > 0 ? dt : Infinity;
    if (this.sinceBuild < FLOOD_REBUILD_S) return;
    this.sinceBuild = 0;
    const seen = new Set<number>();
    let total = 0;
    if (sim) {
      for (const nest of sim.stores.nests.list) {
        if (!nest.alive || nest.flood.water <= 0) continue;
        const s = floodSurface(sim, nest.id);
        if (!s || s.cells.length === 0) continue;
        seen.add(nest.id);
        total += s.cells.length / 2;
        const old = this.sheets.get(nest.id);
        if (old && Math.abs(old.level - s.level) < FLOOD_LEVEL_EPS_MM && old.cells === s.cells.length) continue;
        if (old) { this.group.remove(old.mesh); old.mesh.geometry.dispose(); }
        const mesh = new Mesh(sheetGeometry(s.cells, s.cell, s.level), this.material);
        mesh.name = `flood-water:${nest.id}`;
        mesh.renderOrder = 5;
        this.group.add(mesh);
        this.sheets.set(nest.id, { mesh, level: s.level, cells: s.cells.length });
      }
    }
    for (const [id, sh] of this.sheets) {
      if (seen.has(id)) continue;
      this.group.remove(sh.mesh);
      sh.mesh.geometry.dispose();
      this.sheets.delete(id);
    }
    this.cells = total;
  }

  clear(): void {
    for (const sh of this.sheets.values()) { this.group.remove(sh.mesh); sh.mesh.geometry.dispose(); }
    this.sheets.clear();
    this.cells = 0;
    this.sinceBuild = Infinity;
  }

  dispose(): void {
    this.clear();
    this.material.dispose();
  }
}

/** One quad per surface cell (cell-sized, centred on the sample), all at height y. */
function sheetGeometry(cells: number[], cell: number, y: number): BufferGeometry {
  const n = cells.length / 2, h = cell / 2;
  const pos = new Float32Array(n * 12), nor = new Float32Array(n * 12), idx: number[] = [];
  for (let c = 0; c < n; c++) {
    const x = cells[c * 2], z = cells[c * 2 + 1], o = c * 12;
    pos.set([x - h, y, z - h, x + h, y, z - h, x + h, y, z + h, x - h, y, z + h], o);
    for (let k = 0; k < 4; k++) nor[o + k * 3 + 1] = 1;
    const b = c * 4;
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
