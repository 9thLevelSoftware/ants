// What a garden looks like (GDD 07 §5.4.12: the garden is a per-chamber state with a visual volume, not voxels).
// Each garden keeps a heap of inert display lumps on its chamber floor: `fungus-piece` items (pale, spongy) with no
// nutrients, one per DISPLAY_GU_PER_LUMP of garden up to DISPLAY_LUMPS_MAX, laid out as a low dome by a fixed hash
// pattern; while the garden is infected a share i of them are drawn as grey `garden-waste` lumps (GDD 07 §5.4.9
// item 7: "grey patches of infected fungus"). They mirror the record and are rebuilt as it changes; the record stays
// the only garden. Display lumps are marked hardness 0 (a carried fungus piece or real waste never is).

import { hash3i } from '@/core/math/noise';
import type { Chamber, Colony, GardenRecord, Item, ItemKind, Sim, System } from '@/sim/types';
import { DISPLAY_GU_PER_LUMP, DISPLAY_LUMPS_MAX, DISPLAY_MIN_LUMPS, LUMP_BU, DOME_BU, DISPLAY_STEP_TICKS, FLOOR_STEP_BU } from '@/sim/balance/species-leafcutter';
import { spawnItem, removeItem } from '@/sim/entities';
import { chamberById } from '@/sim/colony/census';
import { floorPoint } from '@/sim/ants/behaviours/nest/places';
import { atColonies } from './economy';


/** A display lump of this colony (inert, in the nest, hardness 0). */
export function isDisplayLump(it: Item, colonyId: number): boolean {
  return it.alive && (it.kind === 'fungus-piece' || it.kind === 'garden-waste') && it.inNest && it.colony === colonyId
    && it.hardness === 0 && it.carrierIds.length === 0;
}

function lumpsFor(g: GardenRecord): number {
  if (g.state === 'dead' || g.biomass <= 0) return 0;
  return Math.min(DISPLAY_LUMPS_MAX, Math.max(DISPLAY_MIN_LUMPS, Math.round(g.biomass / DISPLAY_GU_PER_LUMP)));
}

const scratch = { x: 0, y: 0, z: 0 };

/** The floor below a point of the chamber (the fitted ellipsoid's bottom is often below the dug floor). */
function floorAt(sim: Sim, ch: Chamber, x: number, z: number): number | null {
  const step = FLOOR_STEP_BU * sim.world.bu;
  let y = ch.center.y;
  if (!(sim.field.sampleXYZ(x, y, z) > 0)) return null;
  const bottom = ch.center.y - 2 * ch.radii.y;
  while (y - step > bottom && sim.field.sampleXYZ(x, y - step, z) > 0) y -= step;
  return y - step <= bottom ? null : y;
}

function spawnLump(sim: Sim, col: Colony, ch: Chamber, k: number, kind: ItemKind, nestId: number, spread: number): void {
  const bu = sim.world.bu;
  const frac = spread * Math.sqrt(hash3i(ch.id, k, 1, 0xf00d));
  const ang = hash3i(ch.id, k, 2, 0xf00d) * Math.PI * 2;
  const p = floorPoint(ch, frac, ang, scratch);
  const y = floorAt(sim, ch, p.x, p.z);
  const len = (LUMP_BU[0] + (LUMP_BU[1] - LUMP_BU[0]) * hash3i(ch.id, k, 3, 0xf00d)) * bu;
  // a dome: lumps near the middle sit higher (stacked garden comb)
  const lift = (1 - (frac / Math.max(1e-6, spread)) ** 2) * DOME_BU * bu * hash3i(ch.id, k, 4, 0xf00d);
  spawnItem(sim, {
    kind, pos: { x: p.x, y: (y ?? p.y) + lift, z: p.z },
    init: { colony: col.id, inNest: true, nestId, chamberId: ch.id, lengthMm: len, bulk: 0, hardness: 0, count: 1, stageClock: k },
  });
}

/** Brings the display lumps of each garden of the colony in line with its mass and infection (lump k is stable:
 * its index is kept in Item.stageClock, so a growing garden only adds lumps and a recovering one swaps colours). */
export function syncGardenDisplay(sim: Sim, col: Colony): void {
  const mod = col.fungus!;
  const have = new Map<number, Item[]>();
  for (const it of sim.stores.items.list) {
    if (!isDisplayLump(it, col.id)) continue;
    const l = have.get(it.chamberId) ?? [];
    l.push(it);
    have.set(it.chamberId, l);
  }
  const chambers = new Set<number>([...have.keys(), ...mod.gardens.map((g) => g.chamberId)]);
  for (const chId of chambers) {
    const g = mod.gardens.find((x) => x.chamberId === chId);
    const n = g ? lumpsFor(g) : 0;
    const grey = g ? Math.round(n * Math.min(1, g.infection * 2)) : 0;
    const items = have.get(chId) ?? [];
    const present = new Set<number>();
    for (const it of items) {
      const k = it.stageClock;
      const kind: ItemKind = k < grey ? 'garden-waste' : 'fungus-piece';
      if (k >= n || it.kind !== kind || present.has(k)) removeItem(sim, it.id, 'eaten');
      else present.add(k);
    }
    const ch = chamberById(sim, chId);
    if (!ch || !g || n === 0 || present.size === n) continue;
    const nestId = col.nestIds.find((nid) => sim.stores.nests.get(nid)?.chambers.some((c) => c.id === chId)) ?? -1;
    const spread = Math.min(0.85, 0.35 + 0.5 * Math.sqrt(Math.min(1, g.biomass / Math.max(0.5, g.gcap ?? 1))));
    for (let k = 0; k < n; k++) if (!present.has(k)) spawnLump(sim, col, ch, k, k < grey ? 'garden-waste' : 'fungus-piece', nestId, spread);
  }
}

export const gardenDisplaySystem: System = {
  name: 'fungus-display', phase: 'colony-economy', every: DISPLAY_STEP_TICKS,
  run(sim) {
    for (const { col } of atColonies(sim)) if (col.isPlayer) syncGardenDisplay(sim, col);
  },
};
