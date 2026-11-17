// Chaff middens and their seedlings (GDD 07 §6.3.8). Husks from milling and rotten seed go onto a chaff pile
// middenMinBu-middenMaxBu from each open entrance (the carrying out by haul workers is abstracted: the refuse
// appears on the pile as `chaff` items). viableSeedFrac of the discarded seed loads are intact seeds; after rain in
// spring or autumn each germinates with seedlingGerminateP per GD into a seedling, and a seedling that is not
// trampled by a trunk trail for seedlingMaturesGd becomes a seed-bearing plant: a new seed site near the nest.

import { rngFloat } from '@/core/rng';
import type { Vec3 } from '@/core/math/vec3';
import type { Colony, Entrance, GranaryModule, Sim, System } from '@/sim/types';
import { spawnItem } from '@/sim/entities';
import { currentSeason, TICKS_PER_DAY } from '@/sim/time';
import {
  CHAFF_ITEM_LOADS, MIDDEN_ITEMS_MAX, MIDDEN_VIABLE_MAX, SEEDLING_TRAMPLE_BU, SEEDLINGS_MAX, TRUNK_TRAIL_PH,
  GRANARY_STEP_TICKS,
} from '@/sim/balance/species-harvester';
import { granaryColonies } from './economy';
import type { GranaryParams } from './params';
import { newPatchSite } from './seeds';

/** The midden point of an entrance: on the ground, middenMin-middenMax BU out, in a fixed direction per entrance. */
export function middenPoint(sim: Sim, e: Entrance, g: GranaryParams): Vec3 {
  const bu = sim.world.bu;
  const ang = ((e.id * 2654435761) >>> 0) / 4294967296 * Math.PI * 2;
  const r = ((g.middenMinBu + g.middenMaxBu) / 2) * bu;
  const x = e.pos.x + Math.cos(ang) * r, z = e.pos.z + Math.sin(ang) * r;
  return { x, y: sim.field.height(x, z), z };
}

function openEntrances(sim: Sim, col: Colony): Entrance[] {
  const out: Entrance[] = [];
  for (const nid of col.nestIds) {
    const n = sim.stores.nests.get(nid);
    if (n) for (const e of n.entrances) if (e.status === 'open') out.push(e);
  }
  return out;
}

function middenOf(mod: GranaryModule, entranceId: number): GranaryModule['middens'][number] {
  let m = mod.middens.find((x) => x.entranceId === entranceId);
  if (!m) { m = { entranceId, pileId: -1, viableSeeds: 0 }; mod.middens.push(m); }
  return m;
}

/** Chaff items lying on a midden (newest last). */
function pileItems(sim: Sim, col: Colony, at: Vec3, radiusMm: number): number[] {
  const ids: number[] = [];
  for (const it of sim.stores.items.list) {
    if (it.alive && it.kind === 'chaff' && it.colony === col.id && !it.inNest
      && Math.hypot(it.pos.x - at.x, it.pos.z - at.z) <= radiusMm) ids.push(it.id);
  }
  return ids;
}

/** Puts pending chaff and rotten seed on the middens; returns the items made. */
export function dumpRefuse(sim: Sim, col: Colony, g: GranaryParams): number {
  const mod = col.granary!;
  const pending = (mod.chaffPending ?? 0) + (mod.rottenPending ?? 0);
  if (pending < CHAFF_ITEM_LOADS) return 0;
  const ents = openEntrances(sim, col);
  if (ents.length === 0) return 0;
  const bu = sim.world.bu;
  let made = 0;
  let left = pending;
  const rng = sim.stream('rng.colony');
  while (left >= CHAFF_ITEM_LOADS) {
    const e = ents[made % ents.length];
    const m = middenOf(mod, e.id);
    const c = middenPoint(sim, e, g);
    const spread = 2.5 * bu;
    const p = { x: c.x + (rngFloat(rng) - 0.5) * 2 * spread, y: 0, z: c.z + (rngFloat(rng) - 0.5) * 2 * spread };
    p.y = sim.field.height(p.x, p.z);
    const ids = pileItems(sim, col, c, 4 * bu);
    if (ids.length >= MIDDEN_ITEMS_MAX) {
      const it = sim.stores.items.get(ids[ids.length - 1]);
      if (it) it.count++;
    } else {
      const it = spawnItem(sim, {
        kind: 'chaff', pos: p,
        init: { colony: col.id, inNest: false, volume: CHAFF_ITEM_LOADS, lengthMm: 0.25 * bu, bulk: 0.2 },
      });
      m.pileId = it.id;
    }
    // intact seeds among the discarded loads (GDD 07 §6.3.8: 2 %), counted as seeds of the S class
    m.viableSeeds = Math.min(MIDDEN_VIABLE_MAX, m.viableSeeds + (g.viableSeedFrac * CHAFF_ITEM_LOADS) / g.seedLoadsS);
    left -= CHAFF_ITEM_LOADS;
    made++;
  }
  const chaffShare = pending > 0 ? (mod.chaffPending ?? 0) / pending : 0;
  mod.chaffPending = left * chaffShare;
  mod.rottenPending = left * (1 - chaffShare);
  return made;
}

/** Rain within the last game day (the seedlings' cue). */
function rainedRecently(sim: Sim): boolean {
  const w = sim.state.env.weather;
  const last = w.history.lastRainEndTick;
  return w.rainRateMmH > 0 || (last >= 0 && sim.state.tick - last <= TICKS_PER_DAY);
}

/** Germinates midden seeds into seedlings, grows seedlings, tramples those on a trunk trail. dtGd game days. */
export function stepSeedlings(sim: Sim, col: Colony, g: GranaryParams, dtGd: number): void {
  const mod = col.granary!;
  const season = currentSeason(sim.state);
  const bu = sim.world.bu;
  if ((season === 'spring' || season === 'autumn') && rainedRecently(sim)) {
    const rng = sim.stream('rng.colony');
    const pOne = 1 - Math.pow(1 - g.seedlingGerminateP, dtGd);
    for (const m of mod.middens) {
      const e = entranceById(sim, col, m.entranceId);
      if (!e) continue;
      let n = Math.floor(m.viableSeeds);
      while (n-- > 0 && mod.seedlings.length < SEEDLINGS_MAX) {
        if (rngFloat(rng) >= pOne) continue;
        const c = middenPoint(sim, e, g);
        const pos = { x: c.x + (rngFloat(rng) - 0.5) * 6 * bu, y: 0, z: c.z + (rngFloat(rng) - 0.5) * 6 * bu };
        pos.y = sim.field.height(pos.x, pos.z);
        mod.seedlings.push({ pos, plantedTick: sim.state.tick });
        m.viableSeeds -= 1;
        sim.emit({ type: 'midden-seedling', pos });
      }
    }
  }
  const keep: GranaryModule['seedlings'] = [];
  for (const s of mod.seedlings) {
    if (trampled(sim, col, s.pos)) continue;
    if (sim.state.tick - s.plantedTick >= g.seedlingMaturesGd * TICKS_PER_DAY) {
      mod.seedSites?.push(newPatchSite(sim, s.pos));
      sim.emit({ type: 'midden-plant', pos: s.pos });
      continue;
    }
    keep.push(s);
  }
  mod.seedlings = keep;
}

/** A seedling on the trunk-trail ribbon is trampled (trail pheromone at it or SEEDLING_TRAMPLE_BU to a side). */
function trampled(sim: Sim, col: Colony, p: Vec3): boolean {
  const r = SEEDLING_TRAMPLE_BU * sim.world.bu;
  for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]] as const) {
    if (sim.phero.sample(col.id, 'trail', { x: p.x + dx, y: p.y, z: p.z + dz }) > TRUNK_TRAIL_PH) return true;
  }
  return false;
}

function entranceById(sim: Sim, col: Colony, id: number): Entrance | undefined {
  for (const nid of col.nestIds) {
    const e = sim.stores.nests.get(nid)?.entrances.find((x) => x.id === id);
    if (e) return e;
  }
  return undefined;
}

/** Ticks between midden steps. */
const MIDDEN_EVERY = GRANARY_STEP_TICKS * 4;

export const middenSystem: System = {
  name: 'granary-middens', phase: 'colony-economy', every: MIDDEN_EVERY,
  run(sim) {
    for (const { col, g } of granaryColonies(sim)) {
      dumpRefuse(sim, col, g);
      stepSeedlings(sim, col, g, MIDDEN_EVERY / TICKS_PER_DAY);
    }
  },
};
