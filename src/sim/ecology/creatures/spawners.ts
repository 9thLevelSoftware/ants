// Spawning that is not territory occupancy: prey-patch agents (GDD 05 §2.3), fruit flies at their sources, caterpillars
// on foliage, fly larvae in ripe carrion, stranded earthworms after rain; plus prey patches and antlion pits at the
// start (from the world's placement tables).

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Sim, ZoneType } from '@/sim/types';
import { rngInt, rngRange } from '@/core/rng';
import { randomPointInZone, ageGd } from '@/sim/ecology/sources';
import { zoneAt } from '@/sim/world';
import {
  ANTLION_PIT_DEPTH_PER_R, ANTLION_PIT_RADIUS_MM, CATERPILLAR_DAYS, CATERPILLAR_HAIRY_SHARE, CATERPILLAR_MEDIUM_SHARE,
  CATERPILLAR_PER_PLOT_GD, CATERPILLAR_PUPATE_GD, FLY_LARVA_COUNT, FLY_LARVA_MIN_BULK, FLY_LARVA_MIN_C,
  FRUIT_FLY_FEED_S, FRUIT_FLY_MIN_C, FRUIT_FLY_PER_SOURCE, FRUIT_FLY_SOURCE_RADIUS_MM, FRUIT_FLY_SPAWN_P,
  PATCH_COMPOST_FACTOR, PATCH_IMMIGRATION_PER_GD, PATCH_K_PER_BU2, PATCH_LAMBDA, PATCH_R_PER_GD, PATCH_RADIUS_BU_DEFAULT,
  PATCH_SPAWN_AHEAD_L, PATCH_ZONE_FACTOR, WORM_STRANDED_PER_RAIN,
} from '@/sim/balance/creatures';
import { TICKS_PER_DAY } from '@/sim/time';
import { CreatureFlag, antLen, between, chance, dist2D, isPossessed, onSurface, rng } from './common';
import { inDays, type Conditions } from './conditions';
import { countKind } from './aphidPredators';
import { createPit } from './antlion';
import { spawnKind } from './spawn';
import { capOf } from './caps';

/** Plot = 100 x 100 BU of map (GDD 05 §0). */
function plotMm2(sim: Sim): number {
  const p = 100 * sim.world.bu;
  return p * p;
}

// ---------------------------------------------------------------- initial placement

/** Prey patches from the 'prey' food anchors (`patch r=<BU>`), or from springtail territories in fixtures. */
export function initPreyPatches(sim: Sim): void {
  const eco = sim.state.ecology;
  if (eco.preyPatches.length > 0) return;
  const bu = sim.world.bu;
  const add = (center: Vec3, radiusMm: number, compost: boolean) => {
    const rBu = radiusMm / bu;
    const zone = zoneAt(sim.world, center.x, center.z);
    const f = compost ? PATCH_COMPOST_FACTOR : PATCH_ZONE_FACTOR[zone] ?? 0.5;
    const k = PATCH_K_PER_BU2 * Math.PI * rBu * rBu * f;
    eco.preyPatches.push({ id: sim.state.nextId++, center: { ...center }, radius: radiusMm, kind: 'springtail', count: k, k });
  };
  for (const a of sim.world.placements.foodAnchors) {
    if (a.kind !== 'prey') continue;
    const m = /r=(\d+(?:\.\d+)?)/.exec(a.initialState);
    add(a.pos, (m ? Number(m[1]) : PATCH_RADIUS_BU_DEFAULT) * bu, a.initialState.includes('compost'));
  }
  if (eco.preyPatches.length === 0) {
    for (const t of eco.director.territories) if (t.kind === 'springtail') add(t.center, t.radius, false);
  }
}

/** One pit per antlion territory, each with its antlion (they are worldgen-only and persistent). */
export function initPits(sim: Sim): void {
  const eco = sim.state.ecology;
  eco.director.territories.forEach((t, i) => {
    if (t.kind !== 'antlion' || t.occupantId >= 0) return;
    const r = t.radius > 0 ? Math.min(Math.max(t.radius, ANTLION_PIT_RADIUS_MM[0]), ANTLION_PIT_RADIUS_MM[1]) : between(sim, ANTLION_PIT_RADIUS_MM);
    const pit = createPit(sim, t.center, r, r * ANTLION_PIT_DEPTH_PER_R);
    const c = spawnKind(sim, 'antlion', t.center, { state: 'wait', territoryId: i, homeRadius: r, bb: { pit: pit.id } });
    if (c) t.occupantId = c.id;
  });
}

// ---------------------------------------------------------------- prey patches

/** Hourly logistic regrowth (r 0.8/gd x season) plus immigration 0.05 K/gd (I2). */
export function regrowPatches(sim: Sim, cond: Conditions): void {
  const dt = 1 / 24;
  const season = cond.season === 'winter' ? 0 : cond.season === 'summer' ? (cond.raining ? 1.0 : 0.8) : 1.0;
  for (const p of sim.state.ecology.preyPatches) {
    if (p.k <= 0) continue;
    const grow = PATCH_R_PER_GD * season * p.count * (1 - p.count / p.k) * dt;
    const imm = season > 0 ? PATCH_IMMIGRATION_PER_GD * p.k * dt : 0;
    p.count = Math.max(0, Math.min(p.k, p.count + grow + imm));
  }
}

const _ids: number[] = [];

/** Foraging (scout / forage task) or possessed ants on the ground inside the patch. */
function huntersIn(sim: Sim, center: Vec3, r: number, out: Ant[]): Ant[] {
  out.length = 0;
  sim.index.queryAnts(center, r, _ids);
  _ids.sort((a, b) => a - b);
  for (const id of _ids) {
    const a = sim.stores.ants.get(id);
    if (!a || !onSurface(a) || dist2D(a.pos, center) > r) continue;
    if (a.task === 'forage' || a.task === 'scout' || isPossessed(sim, a)) out.push(a);
  }
  return out;
}

const _h: Ant[] = [];

/** §2.3: per ant moving in a patch, per second lambda = 0.05 count/K (springtail), 0.01 (mite); 2-4 L ahead. */
export function spawnPatchPrey(sim: Sim, cond: Conditions, dtS: number): void {
  if (cond.winter) return;
  for (const p of sim.state.ecology.preyPatches) {
    if (p.k <= 0 || p.count < 1) continue;
    for (const ant of huntersIn(sim, p.center, p.radius, _h)) {
      if (ant.speed <= 0) continue;
      for (const kind of ['springtail', 'mite'] as const) {
        if (countKind(sim, kind) >= capOf(sim, kind)) continue;
        const lambda = (PATCH_LAMBDA[kind] ?? 0) * (p.count / p.k);
        if (!chance(sim, 1 - Math.exp(-lambda * dtS))) continue;
        const L = antLen(sim, ant), d = between(sim, PATCH_SPAWN_AHEAD_L) * L;
        const side = rngRange(rng(sim), -0.5, 0.5);
        const g = { x: ant.pos.x - ant.up.x * ant.footOffset, y: ant.pos.y - ant.up.y * ant.footOffset, z: ant.pos.z - ant.up.z * ant.footOffset };
        const pos = { x: g.x + (ant.fwd.x + side * ant.fwd.z) * d, y: g.y, z: g.z + (ant.fwd.z - side * ant.fwd.x) * d };
        spawnKind(sim, kind, pos, { state: 'graze', bb: { patch: p.id, contact: sim.state.tick } });
      }
    }
  }
}

/** A springtail or mite was caught: one less in its patch. */
export function preyCaught(sim: Sim, patchId: number): void {
  const p = sim.state.ecology.preyPatches.find((x) => x.id === patchId);
  if (p) p.count = Math.max(0, p.count - 1);
}

// ---------------------------------------------------------------- fruit flies, caterpillars, fly larvae, worms

export function spawnFruitFlies(sim: Sim, cond: Conditions): void {
  if (!cond.day || cond.airC < FRUIT_FLY_MIN_C || cond.winter) return;
  const cap = capOf(sim, 'fruit-fly');
  for (const s of sim.stores.sources.list) {
    if (!s.alive || !(s.kind === 'fruit' || s.variant === 'sugary-spill' || s.variant === 'sticky-residue')) continue;
    if (countKind(sim, 'fruit-fly') >= cap) return;
    let here = 0;
    for (const c of sim.stores.creatures.list) if (c.alive && c.kind === 'fruit-fly' && c.bb.src === s.id) here++;
    if (here >= FRUIT_FLY_PER_SOURCE || !chance(sim, FRUIT_FLY_SPAWN_P)) continue;
    const a = rngRange(rng(sim), 0, 2 * Math.PI), d = rngRange(rng(sim), 0, FRUIT_FLY_SOURCE_RADIUS_MM * 0.3);
    spawnKind(sim, 'fruit-fly', { x: s.pos.x + Math.cos(a) * d, y: s.pos.y, z: s.pos.z + Math.sin(a) * d }, {
      state: 'feed', stateS: between(sim, FRUIT_FLY_FEED_S), bb: { src: s.id },
    });
  }
}

const FOLIAGE_ZONES: readonly ZoneType[] = ['forest', 'garden-bed'];

/** Hourly: 0.002 caterpillars per foliage plot per gd, days 3-14, on host plants (else on the ground of the zone). */
export function spawnCaterpillars(sim: Sim, cond: Conditions): void {
  if (!inDays(cond, CATERPILLAR_DAYS) || cond.winter) return;
  let plots = 0;
  for (const z of sim.world.zones) if (FOLIAGE_ZONES.includes(z.type)) plots += z.areaMm2 / plotMm2(sim);
  if (!chance(sim, CATERPILLAR_PER_PLOT_GD * plots / 24) || countKind(sim, 'caterpillar') >= capOf(sim, 'caterpillar')) return;
  const pos = { x: 0, y: 0, z: 0 };
  const plants = sim.stores.plants.list.filter((p) => p.alive);
  let placed = false;
  if (plants.length > 0) {
    const pl = plants[rngInt(rng(sim), 0, plants.length - 1)];
    const obj = sim.world.objects.find((o) => o.id === pl.objectId);
    if (obj) { pos.x = obj.pos.x; pos.y = obj.pos.y; pos.z = obj.pos.z; placed = true; }
  }
  if (!placed) placed = randomPointInZone(sim.world, rng(sim), FOLIAGE_ZONES[rngInt(rng(sim), 0, 1)], pos);
  if (!placed) return;
  const r = rngRange(rng(sim), 0, 1);
  const variant = r < CATERPILLAR_HAIRY_SHARE ? 'hairy' : r < CATERPILLAR_HAIRY_SHARE + CATERPILLAR_MEDIUM_SHARE ? 'medium' : 'small';
  spawnKind(sim, 'caterpillar', pos, {
    variant, state: 'feed', flags: variant === 'hairy' ? CreatureFlag.HAIRY : 0,
    lifeEndTick: sim.state.tick + Math.round(CATERPILLAR_PUPATE_GD * TICKS_PER_DAY),
  });
}

/** Ripe carrion of bulk >= 5 at >= 12 C gets 4-20 fly larvae once (§1.6). Tier 1 carrion has no stages: age 0.5-1.5 gd. */
export function spawnFlyLarvae(sim: Sim, cond: Conditions): void {
  if (cond.winter || cond.airC < FLY_LARVA_MIN_C) return;
  const dir = sim.state.ecology.director;
  const seeded = (dir.seededSources ??= []);
  for (const s of sim.stores.sources.list) {
    if (!s.alive || s.kind !== 'carrion' || s.units * s.unitBulk < FLY_LARVA_MIN_BULK || seeded.includes(s.id)) continue;
    const age = ageGd(sim, s);
    const ripe = s.stage === 'ripe' || (s.stage === null && age >= 0.5 && age < 1.5);
    if (!ripe) continue;
    seeded.push(s.id);
    if (seeded.length > 256) seeded.splice(0, seeded.length - 256);
    const n = rngInt(rng(sim), FLY_LARVA_COUNT[0], FLY_LARVA_COUNT[1]);
    for (let i = 0; i < n && countKind(sim, 'fly-larva') < capOf(sim, 'fly-larva'); i++) {
      const a = rngRange(rng(sim), 0, 2 * Math.PI), d = rngRange(rng(sim), 0, 4);
      spawnKind(sim, 'fly-larva', { x: s.pos.x + Math.cos(a) * d, y: s.pos.y, z: s.pos.z + Math.sin(a) * d }, {
        state: 'feed', bb: { src: s.id, born: sim.state.tick },
      });
    }
  }
}

/** At the start of a rain event: 0-3 earthworms stranded on pavement / asphalt (they die there in daylight). */
export function strandWorms(sim: Sim): void {
  const n = rngInt(rng(sim), WORM_STRANDED_PER_RAIN[0], WORM_STRANDED_PER_RAIN[1]);
  const pos = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < n && countKind(sim, 'earthworm') < capOf(sim, 'earthworm'); i++) {
    const zone: ZoneType = chance(sim, 0.5) ? 'pavement' : 'asphalt';
    if (!randomPointInZone(sim.world, rng(sim), zone, pos)) continue;
    spawnKind(sim, 'earthworm', pos, { state: 'surface', bb: { stranded: 1 } });
  }
}
