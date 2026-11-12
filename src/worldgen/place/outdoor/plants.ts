// Step 5 — plants (GDD 04 §4.2, §5.1-5.3, §8.3): herb plants on the forest floor outside canopy shade >= 0.7
// (under a canopy disc of transmittance 0.3), dandelions (0.4 mown / 0.8 rough), clover patches, daisies (mown),
// perennials in flower beds, shrubs in flower and shrub beds, bean rows [T2] in vegetable beds. Every plant
// carries its stem route, aphid / nectar / seed POIs and rolled host flags. Seed grass [T2] and joint / verge
// weeds [T2] are left to the Tier 2 ecology (they would spend the plant budget on seeds only Messor uses).

import { rngInt } from '@/core/rng';
import type { GenContext } from '../../kit/context';
import { herbPlant } from '../../catalog/outdoor/forest';
import { cloverPatch, daisy, dandelion } from '../../catalog/outdoor/lawn';
import { beanRow, perennial, shrub } from '../../catalog/outdoor/beds';
import { commit, envFor } from './commit';
import { runTables, type OutTable } from './tables';
import { footprintIn, pointInZone, zonesOf } from './zones';
import { OUTDOOR } from './tuning';

/** x * x (not **: DET-4). */
const sq = (x: number): number => x * x;

function underCanopy(ctx: GenContext, x: number, z: number): boolean {
  return ctx.canopies.some((c) => sq(c.x - x) + sq(c.z - z) < c.r * c.r && 1 - c.transmittance >= OUTDOOR.forestProps.herbShadeMax);
}

function beanRows(ctx: GenContext): void {
  const env = envFor(ctx);
  for (const zn of zonesOf(ctx, 'garden-bed', ['vegetable'])) {
    const rng = ctx.rng(`wg/plants/outdoor/beans/${zn.id}`);
    const p = pointInZone(ctx, rng, zn.id, (x, z) => footprintIn(ctx, x, z, 0, 1200, 600, [zn.id]));
    if (!p) continue;
    const rows = rngInt(rng, 1, OUTDOOR.beds.beanRowsMax);
    for (let r = 0; r < rows; r++) {
      commit(ctx, beanRow(ctx.rngFor(`wg/plants/outdoor/beans/${zn.id}`, r), env), { x: p.x, z: p.z + (r - (rows - 1) / 2) * OUTDOOR.beds.beanRowSpacing, yaw: 0, atGround: 'terrain', collide: true, category: 'plants' });
    }
  }
}

export function placePlants(ctx: GenContext): void {
  const env = envFor(ctx);
  const L = OUTDOOR.lawn, B = OUTDOOR.beds;
  const ids = (type: Parameters<typeof zonesOf>[1], variants?: Parameters<typeof zonesOf>[2]) => zonesOf(ctx, type, variants).map((z) => z.id);
  const upright = () => ({ atGround: 'terrain' as const });
  const tables: OutTable[] = [
    { id: 'shrub', category: 'plants', zones: ids('garden-bed', ['flower', 'shrub']), densityPerM2: B.shrub, spacingMm: 500, make: (r) => shrub(r, env), options: upright },
    { id: 'perennial-plant', category: 'plants', zones: ids('garden-bed', ['flower']), densityPerM2: B.perennial, spacingMm: 220, make: (r) => perennial(r, env), options: upright },
    { id: 'herb-plant', category: 'plants', zones: ids('forest'), densityPerM2: OUTDOOR.forestProps.herb, spacingMm: 200, eligible: (x, z) => !underCanopy(ctx, x, z), make: (r) => herbPlant(r, env), options: upright },
    { id: 'dandelion-mown', category: 'plants', zones: ids('lawn', ['mown']), densityPerM2: L.dandelionMown, spacingMm: 250, make: (r) => dandelion(r, env), options: upright },
    { id: 'dandelion-rough', category: 'plants', zones: ids('lawn', ['rough']), densityPerM2: L.dandelionRough, spacingMm: 250, make: (r) => dandelion(r, env), options: upright },
    { id: 'clover-patch', category: 'plants', zones: ids('lawn'), densityPerM2: L.clover, spacingMm: 400, make: (r) => cloverPatch(r, env), options: upright },
    { id: 'daisy', category: 'plants', zones: ids('lawn', ['mown']), densityPerM2: L.daisy, spacingMm: 120, make: (r) => daisy(r, env), options: upright },
  ];
  const res = runTables(ctx, 'plants', tables);
  for (const [k, v] of Object.entries(res)) ctx.notes.push(`outdoor:table ${k} area=${v.areaM2.toFixed(1)} expected=${v.expected.toFixed(1)} placed=${v.placed} thin=${v.thin.toFixed(3)}`);
  beanRows(ctx);
}
