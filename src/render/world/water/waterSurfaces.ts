// Water surfaces to draw (pure): static bodies (puddle, bowl-water, gully-water; GDD 04 §13.1) at their current
// level, and puddles on impermeable hollows from the environment's puddle store (GDD 06 §3.10) or from an input
// level (weather renderer, demo). Each puddle region is one flat sheet at a single level: its lowest ground plus
// its deepest water, so connected cells never step.
import type { Sim, WaterBody, WorldData } from '@/sim/types';
import type { GroundView } from '../decor/ground';
import { WATER } from '../decor/tuning';

export interface WaterDisc {
  kind: 'disc';
  bodyId: number;
  /** Centre and radius, mm; surface height y, mm. */
  x: number;
  z: number;
  r: number;
  y: number;
  /** Water depth for vessels (flat bottom), mm; -1 = depth from the terrain under the sheet. */
  vesselDepth: number;
}

export interface WaterSheet {
  kind: 'sheet';
  /** Cells covered (nav-cell rectangles x0, z0, x1, z1 flattened), mm. */
  rects: number[];
  y: number;
}

export type WaterSurface = WaterDisc | WaterSheet;

export interface WaterInputs {
  /** Multiplier on every body level (1 = as simulated). */
  bodyLevelScale: number;
  /** Puddle depth on every puddle-capable cell, mm, capped by its capacity; null = from the simulation. */
  puddleMm: number | null;
}

const VESSELS = new Set(['bowl-water', 'gully-water']);

function bodyLevel(sim: Sim | null, i: number, b: WaterBody): number {
  const lv = (sim?.state.worldDelta as { waterLevels?: Float32Array } | undefined)?.waterLevels;
  return lv && i < lv.length ? lv[i] : b.levelMm;
}

/** Puddle depth per nav cell, mm (sim store in 0.05 mm units, or the input level capped by capacity). */
function puddleDepths(world: WorldData, sim: Sim | null, input: number | null): { cell: number; nx: number; nz: number; mm: Float32Array } | null {
  const cap = world.maps.puddleCapMm;
  const moist = (sim?.state.env as { moisture?: { cell: number; nx: number; nz: number; puddle: Uint8Array } } | undefined)?.moisture;
  if (input !== null && cap) {
    const mm = new Float32Array(cap.nx * cap.nz);
    for (let i = 0; i < mm.length; i++) mm[i] = Math.min(cap.data[i], input);
    return { cell: cap.cell, nx: cap.nx, nz: cap.nz, mm };
  }
  if (moist && moist.puddle.length === moist.nx * moist.nz) {
    const mm = new Float32Array(moist.puddle.length);
    for (let i = 0; i < mm.length; i++) mm[i] = moist.puddle[i] * 0.05;
    return { cell: moist.cell, nx: moist.nx, nz: moist.nz, mm };
  }
  return null;
}

export function collectWater(ground: GroundView, sim: Sim | null, inputs: WaterInputs): WaterSurface[] {
  const world = ground.world, out: WaterSurface[] = [];
  world.waterBodies.forEach((b, i) => {
    if (b.kind === 'wet-patch') return; // a moisture source, not standing water
    const level = bodyLevel(sim, i, b) * inputs.bodyLevelScale;
    if (level < WATER.minPuddleMm) return;
    const vessel = VESSELS.has(b.kind);
    out.push({ kind: 'disc', bodyId: b.id, x: b.pos.x, z: b.pos.z, r: b.radius, y: b.pos.y + level, vesselDepth: vessel ? level : -1 });
  });
  const p = puddleDepths(world, sim, inputs.puddleMm);
  if (!p) return out;
  // connected regions of wet cells (4-neighbour flood fill in index order: deterministic)
  const seen = new Uint8Array(p.mm.length);
  for (let start = 0; start < p.mm.length; start++) {
    if (seen[start] || p.mm[start] < WATER.minPuddleMm) continue;
    const stack = [start], cells: number[] = [];
    seen[start] = 1;
    while (stack.length) {
      const c = stack.pop()!;
      cells.push(c);
      const i = c % p.nx, k = (c - i) / p.nx;
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, kk = k + dk;
        if (ii < 0 || kk < 0 || ii >= p.nx || kk >= p.nz) continue;
        const n = kk * p.nx + ii;
        if (!seen[n] && p.mm[n] >= WATER.minPuddleMm) { seen[n] = 1; stack.push(n); }
      }
    }
    cells.sort((a, b) => a - b);
    let low = Infinity, deep = 0;
    const rects: number[] = [];
    for (const c of cells) {
      const i = c % p.nx, k = (c - i) / p.nx, x0 = i * p.cell, z0 = k * p.cell;
      for (let sz = 0; sz <= 4; sz++) for (let sx = 0; sx <= 4; sx++) low = Math.min(low, ground.height(x0 + (sx / 4) * p.cell, z0 + (sz / 4) * p.cell));
      deep = Math.max(deep, p.mm[c]);
      rects.push(x0, z0, x0 + p.cell, z0 + p.cell);
    }
    out.push({ kind: 'sheet', rects, y: low + deep });
  }
  return out;
}

/** Change signature of the inputs that move water (cheap; rebuild only when it changes). */
export function waterSignature(world: WorldData, sim: Sim | null, inputs: WaterInputs): string {
  const lv = (sim?.state.worldDelta as { waterLevels?: Float32Array } | undefined)?.waterLevels;
  const moist = (sim?.state.env as { moisture?: { puddle: Uint8Array } } | undefined)?.moisture;
  let h = 0;
  if (moist) for (let i = 0; i < moist.puddle.length; i++) h = (Math.imul(h, 31) + moist.puddle[i]) | 0;
  return `${world.waterBodies.length}|${lv ? Array.from(lv).join(',') : ''}|${h}|${inputs.bodyLevelScale}|${inputs.puddleMm}`;
}
