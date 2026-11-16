// Which pheromone layers the scent view draws (GDD 08 §10.1): the player colony's trail and home, the shared alarm
// layer, the rival colonies' trail and home (same glyphs, hatched), and the food odour plumes of live sources.
// Also the field-backed surface snapper. Reads sim state only.
import type { Vec3 } from '@/core';
import type { Sim } from '@/sim/types';
import { PHERO_SHARED_COLONY } from '@/sim/balance';
import { odourRadiusMm } from '@/sim/ecology/sources/def';
import type { LayerSpec, PointEntry, SurfaceSnapper } from './ScentCache';
import { FOOD_PLUME_MAX_BU, FULL_PH, RIVAL_FLAG, STYLE } from './tuning';

export const FOOD_LAYER_KEY = 'food';

function entrancesOf(sim: Sim, colonyId: number): Vec3[] {
  const out: Vec3[] = [];
  for (const n of sim.state.nests) if (n.colony === colonyId) for (const e of n.entrances) out.push(e.pos);
  return out;
}

/** Layer specs for the current sim: player colony first, then rivals (alive colonies only), then food plumes. */
export function scentLayers(sim: Sim): LayerSpec[] {
  const specs: LayerSpec[] = [];
  const cols = sim.state.colonies;
  for (const c of cols) {
    if (!c.alive) continue;
    const rival = c.isPlayer ? 0 : RIVAL_FLAG;
    const origins = entrancesOf(sim, c.id);
    specs.push({ kind: 'cells', key: `${c.id}:trail`, colony: c.id, channel: 'trail', style: STYLE.trail + rival, fullPh: FULL_PH.trail, origins });
    specs.push({ kind: 'cells', key: `${c.id}:home`, colony: c.id, channel: 'home', style: STYLE.home + rival, fullPh: FULL_PH.home, origins });
  }
  specs.push({ kind: 'cells', key: 'alarm', colony: PHERO_SHARED_COLONY, channel: 'alarm', style: STYLE.alarm, fullPh: FULL_PH.alarm, origins: [] });
  specs.push({ kind: 'points', key: FOOD_LAYER_KEY, style: STYLE.food });
  return specs;
}

/** A key that changes when the colony / nest set changes (rebuild the specs only then). */
export function layersKey(sim: Sim): string {
  let k = '';
  for (const c of sim.state.colonies) if (c.alive) k += `${c.id}${c.isPlayer ? 'p' : 'r'},`;
  for (const n of sim.state.nests) k += `${n.id}:${n.entrances.length};`;
  return k;
}

/** Food odour plumes: one glyph per live source with food left, radius = its smell range (capped). */
export function foodPlumes(sim: Sim, out: PointEntry[]): PointEntry[] {
  out.length = 0;
  const bu = sim.world.bu;
  const cap = FOOD_PLUME_MAX_BU * bu;
  for (const s of sim.state.sources) {
    if (!s.alive) continue;
    const left = s.pool >= 0 ? s.pool : s.units;
    if (!(left > 0)) continue;
    const r = Math.min(cap, odourRadiusMm(s, bu));
    if (!(r > 0)) continue;
    const full = s.pool >= 0 ? Math.max(s.poolCap, 1e-6) : Math.max(s.capacity, 1e-6);
    out.push({ id: s.id, pos: s.pos, up: s.up, radiusMm: r, intensity: 0.45 + 0.55 * Math.min(1, left / full) });
  }
  return out;
}

/** Projects onto f = 0 with the world field (ground, walls, tunnel walls alike). */
export function fieldSnapper(sim: Sim): SurfaceSnapper {
  const p: Vec3 = { x: 0, y: 0, z: 0 };
  return {
    snap(x, y, z, outPos, outNrm) {
      p.x = x; p.y = y; p.z = z;
      return sim.field.project(p, 0, outPos, outNrm);
    },
  };
}
