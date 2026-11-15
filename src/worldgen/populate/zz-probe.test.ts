// TEMPORARY probe (deleted before handing in).
import { it, vi } from 'vitest';
import type { ArchetypeId, ZoneType } from '@/sim/types';
import { CARRION_DROP_VARIANTS, CRUMB_REPLACE_FRACTION } from '@/sim/balance/ecology';
import { generated } from './testkit';
import { startDistances, objectById } from './common';
import { anchorDistance, dayOffer, defAt, sourceVariant } from './economy';
import { HOST_BIT } from './hosts';
import { cellAt } from '../validate/graph';
import { walkable } from '../maps/nav';
import { NODE_DENSITY } from './tuning';

vi.setConfig({ testTimeout: 600_000 });

it('probe', () => {
  for (const a of ['woodland-edge', 'suburban-garden', 'playground-park', 'car-park-verge', 'kitchen-door'] as ArchetypeId[]) {
    const { ctx, report } = generated(a, 1, 'standard', 'lasius-niger', false);
    const d = startDistances(ctx);
    const s = ctx.world.queenStart.pos;
    const sz = ctx.layout.zones[ctx.layout.nav[cellAt(ctx, s.x, s.z)]].type;
    const out: string[] = [`${a} start=${sz} attempts=${report.attempts} notes=${ctx.notes.filter((n) => n.startsWith('food')).join('|')}`];
    for (const R of [300, 900]) {
      let c = 0, p = 0;
      const tops: string[] = [];
      for (const an of ctx.world.placements.foodAnchors) {
        const v = sourceVariant(an);
        if (!v || !(anchorDistance(ctx, an, d) <= R)) continue;
        const def = defAt(v);
        const stock = (def.units[0] + def.units[1]) / 2;
        const per = def.refillPerGd > 0 ? def.refillPerGd : an.kind === 'crumb' ? CRUMB_REPLACE_FRACTION * stock : 0;
        c += per * def.c; p += per * def.p;
        if (/top-up/.test(an.initialState)) tops.push(v);
      }
      const all = dayOffer(ctx, d, R);
      let cc = 0, cp = 0;
      for (const v of CARRION_DROP_VARIANTS) { cc += all.byVariant[v]?.c ?? 0; cp += all.byVariant[v]?.p ?? 0; }
      const used = new Set(ctx.world.placements.foodAnchors.filter((x) => x.kind === 'nectar').map((x) => x.hostObjectId));
      const freeFlowers = ctx.world.placements.plants.filter((pl) => pl.hostFlags & HOST_BIT.nectar && !used.has(pl.objectId)).filter((pl) => {
        const ob = objectById(ctx, pl.objectId); return ob && d[cellAt(ctx, ob.pos.x, ob.pos.z)] <= R;
      }).length;
      const zc: Record<string, number> = {};
      for (let i = 0; i < d.length; i++) if (d[i] <= R && walkable(ctx.world.nav.cls.data[i])) { const z = ctx.layout.zones[ctx.layout.nav[i]].type; zc[z] = (zc[z] ?? 0) + 1; }
      const crumbZoneCells = Object.entries(zc).filter(([z]) => (NODE_DENSITY.crumb.perPlot[z as ZoneType] ?? 0) > 0).reduce((s2, [, n]) => s2 + n, 0);
      out.push(`  ${R}: flow ${(c + cc).toFixed(1)}C/${(p + cp).toFixed(1)}P (carrion ${cc.toFixed(1)}/${cp.toFixed(1)}) counted ${all.c.toFixed(1)}/${all.p.toFixed(1)} freeFlowers=${freeFlowers} crumbZoneCells=${crumbZoneCells} zones=${JSON.stringify(zc)} tops=${tops.join(',')}`);
    }
    out.push(`  crumbs=${ctx.world.placements.foodAnchors.filter((x) => x.kind === 'crumb').length} flowers=${ctx.world.placements.foodAnchors.filter((x) => x.kind === 'nectar').length} gen=${report.timingsMs.total}`);
    console.info(out.join('\n'));
  }
});
