// Puddles on the nav grid (GDD 06 §3.10): a cell whose standing water is at least WX_PUDDLE_AVOID_BU deep costs
// WX_PUDDLE_AVOID_COST times more to plan through, one at least WX_PUDDLE_BLOCK_BU deep is blocked (autonomous
// walkers go round; the possessed ant is never planned and may swim). The moisture grid lives on the same 16 BU
// cells as the nav grid when both cover the map; otherwise each moisture cell maps onto the nav cells it covers.
//
// Synced every tick from state (env.moisture.puddle), comparing with the copy taken at the last sync, so the
// overlay is a function of the current state: a restored game derives the same one on its first tick.

import type { Sim } from '@/sim/types';
import { WX_PUDDLE_AVOID_BU, WX_PUDDLE_AVOID_COST, WX_PUDDLE_BLOCK_BU, WX_PUDDLE_UNIT_MM } from '@/sim/balance/weather';
import type { LocoNavGrid } from './grid/navGridImpl';
import type { LocoRuntime } from './runtime';

const _cells: number[] = [], _vals: number[] = [];

/** Overlay value of a puddle store byte (units of WX_PUDDLE_UNIT_MM). */
function overlayOf(units: number, avoidU: number, blockU: number): number {
  return units >= blockU ? Infinity : units >= avoidU ? WX_PUDDLE_AVOID_COST : 1;
}

/** Brings the grid's puddle overlay in line with the moisture state (no-op while nothing changed). */
export function syncPuddles(sim: Sim, g: LocoNavGrid, r: LocoRuntime): void {
  const m = sim.state.env.moisture;
  if (!m || m.nx <= 0 || !m.puddle || m.puddle.length === 0) return;
  const src = m.puddle;
  let seen = r.puddleSeen;
  const fresh = !seen || seen.length !== src.length;
  if (fresh) seen = r.puddleSeen = new Uint8Array(src.length);
  const bu = sim.world.bu;
  const avoidU = Math.ceil((WX_PUDDLE_AVOID_BU * bu) / WX_PUDDLE_UNIT_MM - 1e-9);
  const blockU = Math.ceil((WX_PUDDLE_BLOCK_BU * bu) / WX_PUDDLE_UNIT_MM - 1e-9);
  _cells.length = 0; _vals.length = 0;
  const same = m.cell === g.cell && m.nx === g.w && m.nz === g.h;
  for (let i = 0; i < src.length; i++) {
    const u = src[i], old = seen![i];
    if (!fresh && u === old) continue;
    seen![i] = u;
    const v = overlayOf(u, avoidU, blockU);
    if (!fresh && v === overlayOf(old, avoidU, blockU)) continue;
    if (fresh && v === 1) continue;
    if (same) { _cells.push(i); _vals.push(v); continue; }
    pushCovered(g, m.cell, i % m.nx, Math.floor(i / m.nx), v);
  }
  if (_cells.length > 0) g.setWetCells(_cells, _vals);
}

/** The nav cells under one moisture cell (grids of different cell sizes). */
function pushCovered(g: LocoNavGrid, mCell: number, ix: number, iz: number, v: number): void {
  const x0 = Math.floor((ix * mCell) / g.cell), x1 = Math.min(g.w - 1, Math.floor(((ix + 1) * mCell - 1e-6) / g.cell));
  const z0 = Math.floor((iz * mCell) / g.cell), z1 = Math.min(g.h - 1, Math.floor(((iz + 1) * mCell - 1e-6) / g.cell));
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { _cells.push(z * g.w + x); _vals.push(v); }
}
