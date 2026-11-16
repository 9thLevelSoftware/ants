// Creature territories and spawn areas per habitat (GDD 04 §8.2, GDD 05 §2.2, §2.7) as data for the creature
// director: prey (springtails and mites with the prey patches), neutral fauna (woodlice and millipedes under
// logs, stones and pots; earthworms, snails), aphids and their predators with the herds, ant predators
// (wolf and jumping spiders, ant-spiders, antlions, centipedes, rove beetles) and bird regions. Ant-predator
// territories keep clear of the start (no hazard on top of the queen; the start rule checks it again).

import type { RngState } from '@/core/rng';
import { rngFloat, rngInt } from '@/core/rng';
import type { CreatureKind, FoodAnchor, ZoneType } from '@/sim/types';
import { ZONE_TYPES } from '@/sim/types';
import type { GenContext } from '../kit/context';
import { addTerritory } from '../kit/records';
import { mapState } from '../maps/state';
import { navCentre, objectById, roundRandom, shuffled, zoneCells } from './common';
import {
  ANT_PREDATORS, ANT_SPIDER, ANTLION, APHID_PREDATORS, BIRD, JUMPING_SPIDER, PREDATOR_START_CLEAR_BU, PREY_PATCH,
  SHELTER_FAUNA, TERRITORY_ZONE_RULES,
} from './tuning';

const maskOf = (zones: readonly ZoneType[]) => zones.reduce((m, z) => m | (1 << ZONE_TYPES.indexOf(z)), 0);
const between = (rng: RngState, r: [number, number]) => r[0] + (r[1] - r[0]) * rngFloat(rng);

function farFromStart(ctx: GenContext, kind: CreatureKind, x: number, z: number, radius: number): boolean {
  if (!ANT_PREDATORS.includes(kind)) return true;
  const s = ctx.world.queenStart.pos, clear = PREDATOR_START_CLEAR_BU * ctx.dims.bu + radius;
  return (s.x - x) ** 2 + (s.z - z) ** 2 >= clear * clear;
}

function put(ctx: GenContext, kind: CreatureKind, x: number, z: number, radiusMm: number, zones: readonly ZoneType[], cap: number): boolean {
  if (!farFromStart(ctx, kind, x, z, radiusMm)) return false;
  addTerritory(ctx, { creatureKind: kind, center: { x, y: 0, z }, radiusMm, zoneMask: maskOf(zones), cap });
  return true;
}

/** Zone-area rules: earthworms, snails, wolf spiders, centipedes, rove beetles. */
function byArea(ctx: GenContext, rng: RngState): void {
  const cellM2 = (ctx.dims.navCell / 1000) ** 2;
  for (const rule of TERRITORY_ZONE_RULES) {
    const cells = shuffled(rng, rule.zones.flatMap((z) => zoneCells(ctx, z)));
    const n = Math.min(rule.cap, roundRandom(rng, (rule.perM2 ?? 0) * cells.length * cellM2));
    let placed = 0;
    for (const c of cells) {
      if (placed >= n) break;
      const p = navCentre(ctx, c);
      if (put(ctx, rule.kind, p.x, p.z, between(rng, rule.radiusMm), rule.zones, 1)) placed++;
    }
  }
}

/** Prey with the prey patches; aphids with the herd sites; aphid predators per 4 herd sites. */
/** Bins whose crumbs draw fruit flies (GDD 04 §8.2: bins, fruit bowl, windfalls). */
const FLY_BINS = new Set(['litter-bin', 'pedal-bin']);

/** The springtail and mite territories of one prey-patch anchor (also for the start's prey top-ups, finalize.ts). */
export function preyTerritories(ctx: GenContext, a: FoodAnchor): void {
  const m = /r=(\d+)/.exec(a.initialState);
  const r = (m ? Number(m[1]) : PREY_PATCH.radiusBu[0]) * ctx.dims.bu;
  put(ctx, 'springtail', a.pos.x, a.pos.z, r, ['forest', 'lawn', 'garden-bed'], 1);
  put(ctx, 'mite', a.pos.x, a.pos.z, r, ['forest', 'lawn', 'garden-bed'], 1);
}

function withAnchors(ctx: GenContext, rng: RngState): void {
  const bu = ctx.dims.bu;
  let herds = 0;
  for (const a of ctx.world.placements.foodAnchors) {
    if (a.kind === 'prey') {
      preyTerritories(ctx, a);
    } else if (a.initialState.startsWith('aphid-herd')) {
      put(ctx, 'aphid', a.pos.x, a.pos.z, 6 * bu, ['forest', 'lawn', 'garden-bed'], 1);
      if (++herds % APHID_PREDATORS.perAnchors === 0) {
        const kind = APHID_PREDATORS.kinds[rngInt(rng, 0, APHID_PREDATORS.kinds.length - 1)];
        put(ctx, kind, a.pos.x, a.pos.z, APHID_PREDATORS.radiusMm, ['forest', 'lawn', 'garden-bed'], 1);
      }
    } else if (a.kind === 'fruit' || (a.kind === 'crumb' && FLY_BINS.has(objectById(ctx, a.hostObjectId)?.templateId ?? ''))) {
      put(ctx, 'fruit-fly', a.pos.x, a.pos.z, 20 * bu, ['garden-bed', 'lawn', 'interior', 'pavement'], 1);
    }
  }
}

/** Objects: woodlice / millipedes under logs, stumps, large stones and pots; jumping spiders on walls and fences. */
function onObjects(ctx: GenContext, rng: RngState): void {
  const SHELTERS = new Set(['log', 'stump', 'plant-pot', 'planter', 'compost-bin', 'flat-stone', 'stone', 'stepping-stone']);
  let wallLen = 0;
  const walls: { x: number; z: number }[] = [];
  for (const ob of ctx.world.objects) {
    if (SHELTERS.has(ob.templateId)) {
      let size = 0;
      for (let i = ob.primStart; i < ob.primStart + ob.primCount; i++) { const s = ctx.world.prims[i].size; size = Math.max(size, 2 * s.x, 2 * s.z); }
      const stone = ob.templateId.includes('stone');
      if (stone && size < SHELTER_FAUNA.stoneMinMm) continue;
      if (rngFloat(rng) < SHELTER_FAUNA.p) put(ctx, rngFloat(rng) < 0.5 ? 'woodlouse' : 'millipede', ob.pos.x, ob.pos.z, SHELTER_FAUNA.radiusMm, ['forest', 'garden-bed', 'lawn'], 1);
      if (ob.templateId === 'compost-bin') put(ctx, 'fly-larva', ob.pos.x, ob.pos.z, SHELTER_FAUNA.radiusMm, ['garden-bed'], 1);
    }
    if (ob.templateId === 'fence' || ob.templateId === 'garden-wall' || ob.templateId === 'house-wall') {
      for (let i = ob.primStart; i < ob.primStart + ob.primCount; i++) wallLen += 2 * Math.max(ctx.world.prims[i].size.x, ctx.world.prims[i].size.z);
      walls.push({ x: ob.pos.x, z: ob.pos.z });
    }
  }
  const n = Math.min(JUMPING_SPIDER.cap, Math.floor(wallLen * JUMPING_SPIDER.perMm));
  let placed = 0;
  for (const w of shuffled(rng, walls)) {
    if (placed >= n) break;
    if (put(ctx, 'jumping-spider', w.x, w.z, JUMPING_SPIDER.radiusMm, ['lawn', 'garden-bed', 'forest', 'pavement'], 1)) placed++;
  }
}

/** Ant-spiders on the warmest dry ground, antlions in sheltered dry sand, bird regions over open zones. */
function byMaps(ctx: GenContext, rng: RngState): void {
  const st = mapState(ctx);
  const lay = ctx.layout;
  const { theta0 } = st.surface, shade = st.shade.mean;
  if (ctx.params.region === 'temperate-eu' || ctx.params.region === 'mediterranean') {
    const cells = [...zoneCells(ctx, 'sand'), ...zoneCells(ctx, 'lawn')].filter((c) => theta0[c] <= ANT_SPIDER.thetaMax);
    cells.sort((a, b) => ((1 - shade[b]) * (1 - theta0[b])) - ((1 - shade[a]) * (1 - theta0[a])) || a - b);
    let placed = 0;
    for (const c of cells) {
      if (placed >= ANT_SPIDER.max) break;
      const p = navCentre(ctx, c);
      if (put(ctx, 'ant-spider', p.x, p.z, ANT_SPIDER.radiusMm, ['sand', 'lawn'], 1)) placed++;
    }
  }
  const sand = zoneCells(ctx, 'sand').filter((c) => shade[c] >= ANTLION.shadeMin && theta0[c] < ANTLION.thetaMax);
  const n = Math.min(ANTLION.cap, roundRandom(rng, ANTLION.perM2 * sand.length * (ctx.dims.navCell / 1000) ** 2));
  let pits = 0;
  for (const c of shuffled(rng, sand)) {
    if (pits >= n) break;
    const p = navCentre(ctx, c);
    if (put(ctx, 'antlion', p.x, p.z, ANTLION.radiusMm, ['sand'], 1)) pits++;
  }
  for (const z of lay.zones) {
    if (!BIRD.zones.includes(z.type)) continue;
    const cells = zoneCells(ctx, z.type).filter((c) => lay.nav[c] === z.id && st.surface.exposure[c] >= BIRD.exposureMin);
    const areaM2 = cells.length * (ctx.dims.navCell / 1000) ** 2;
    if (areaM2 < BIRD.minAreaM2) continue;
    let sx = 0, sz = 0;
    for (const c of cells) { const p = navCentre(ctx, c); sx += p.x; sz += p.z; }
    put(ctx, 'bird', sx / cells.length, sz / cells.length, Math.sqrt(areaM2 / 3.141592653589793) * 1000, [z.type], 1);
  }
}

export function placeTerritories(ctx: GenContext): void {
  const rng = ctx.rng('wg/resources/territories');
  byArea(ctx, rng);
  withAnchors(ctx, rng);
  onObjects(ctx, rng);
  byMaps(ctx, rng);
}

