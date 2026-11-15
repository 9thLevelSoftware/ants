// Adversarial review of task worldgen-life (populate step, start rule, food guarantees). One world, woodland-edge
// seed 1 standard (Lasius), generated twice: once through the testkit (with its context) and once more for the
// determinism comparison. The long block (FOUNDRESS_LONG=1) generates compact and large maps and non-default
// difficulty presets, which the implementer's sweep did not cover (acceptance 2 "per archetype and size").
//
// The FINDING tests were the review's findings (they failed on the reviewed tree) and are now regression tests:
//  - the C13 economy floor holds on the renewable daily supply, not by counting one-time crumb stock;
//  - guarantee top-ups put crumb clusters only in zones where GDD 05 §1.2 / §1.3 places crumbs (not forest);
//  - Tier 1 flowers carry the winter bit (the catalogue's T1 row is "always" open).
import { describe, expect, it, vi } from 'vitest';
import type { ArchetypeId, DifficultyId, WorldSizeId, ZoneType } from '@/sim/types';
import { SEASONS } from '@/sim/types';
import { CARRION_DROP_VARIANTS, CRUMB_REPLACE_FRACTION, ECOLOGY_TIER } from '@/sim/balance/ecology';
import { generateWorldReport } from '../pipeline';
import { defaultWorldParams } from '../params';
import { discoveredModules, type WorldgenModule } from '../kit/registry';
import type { GenContext } from '../kit/context';
import { cellAt } from '../validate/graph';
import { mapState } from '../maps/state';
import { checkStartRule } from '../maps/start';
import { VALID } from '../tuning/pipeline';
import { generated, walkToDigSite } from './testkit';
import { startDistances } from './common';
import { anchorDistance, dayOffer, defAt, sourceVariant } from './economy';
import { foodReport } from './finalize';
import { ANT_PREDATORS, ECONOMY_FLOORS, START_RULE } from './tuning';

vi.setConfig({ testTimeout: 240_000 });

const ARCH: ArchetypeId = 'woodland-edge';
const world = () => generated(ARCH, 1);
const zoneOf = (ctx: GenContext, x: number, z: number): ZoneType => ctx.layout.zones[ctx.layout.nav[cellAt(ctx, x, z)]].type;
const SUMMER = 1 << SEASONS.indexOf('summer');
const WINTER = 1 << SEASONS.indexOf('winter');

/**
 * Sustained per-day offer within radiusBu of the start: pool refill per gd, the T1 crumb rule (30 % of consumed
 * clusters re-placed daily, GDD 05 §1.2), and the expected carrion drops (as dayOffer computes them). One-time
 * stock (a crumb cluster's units, a sugar patch) is not a daily supply.
 */
function sustainedOffer(ctx: GenContext, radiusBu: number): { c: number; p: number } {
  const d = startDistances(ctx);
  let c = 0, p = 0;
  for (const a of ctx.world.placements.foodAnchors) {
    const v = sourceVariant(a);
    if (!v || !(a.seasonMask & SUMMER) || !(anchorDistance(ctx, a, d) <= radiusBu)) continue;
    const def = defAt(v);
    const stock = (def.units[0] + def.units[1]) / 2;
    const perDay = def.refillPerGd > 0 ? def.refillPerGd : a.kind === 'crumb' ? CRUMB_REPLACE_FRACTION * stock : 0;
    c += perDay * def.c; p += perDay * def.p;
  }
  const all = dayOffer(ctx, d, radiusBu);
  for (const v of CARRION_DROP_VARIANTS) { c += all.byVariant[v]?.c ?? 0; p += all.byVariant[v]?.p ?? 0; }
  return { c, p };
}

describe('determinism (acceptance 6)', () => {
  it('the same params give the same fingerprint, start pose and placement tables in one process', () => {
    const a = world().report;
    const b = generateWorldReport({ ...defaultWorldParams('lasius-niger', 1), archetype: ARCH });
    expect(b.world.meta.fingerprint).toBe(a.world.meta.fingerprint);
    expect(JSON.stringify(b.world.queenStart)).toBe(JSON.stringify(a.world.queenStart));
    expect(JSON.stringify(b.world.placements)).toBe(JSON.stringify(a.world.placements));
    expect(JSON.stringify(b.world.micro)).toBe(JSON.stringify(a.world.micro));
  });
});

describe('start pose (deliverable 5, GDD 04 §12.5, START_RULE)', () => {
  it('>= 300 BU from the edge, flood risk <= 0.3, ant-predator territories farther than their radius + the hazard clearance', () => {
    const { ctx } = world();
    const w = ctx.world, s = w.queenStart.pos, bu = w.bu;
    expect(Math.min(s.x, s.z, w.size - s.x, w.size - s.z)).toBeGreaterThanOrEqual(VALID.startEdgeMinBu * bu);
    expect(mapState(ctx).water.flood[cellAt(ctx, s.x, s.z)]).toBeLessThanOrEqual(VALID.startFloodMax);
    for (const t of w.placements.territories) {
      if (!ANT_PREDATORS.includes(t.creatureKind)) continue;
      expect(Math.hypot(t.center.x - s.x, t.center.z - s.z), t.creatureKind).toBeGreaterThanOrEqual(t.radiusMm + START_RULE.hazardClearBu * bu);
    }
    for (const b of w.waterBodies) expect(Math.hypot(b.pos.x - s.x, b.pos.z - s.z)).toBeGreaterThanOrEqual(b.radius + START_RULE.hazardClearBu * bu);
  });
});

describe('food (deliverable 1 / 6, acceptance 4)', () => {
  it('every anchor references an existing host object and has a non-empty season mask', () => {
    const { ctx } = world();
    const ids = new Set(ctx.world.objects.map((o) => o.id));
    for (const a of ctx.world.placements.foodAnchors) {
      if (a.hostObjectId >= 0) expect(ids.has(a.hostObjectId), `${a.id} ${a.initialState}`).toBe(true);
      expect(a.seasonMask).toBeGreaterThan(0);
      expect(Number.isFinite(a.pos.x + a.pos.y + a.pos.z)).toBe(true);
    }
  });

  it('the stock-inclusive offer the check uses meets the floors (implementer claim, reproduced)', () => {
    const r = foodReport(world().ctx);
    r.floors.forEach((f, i) => {
      expect(f.c).toBeGreaterThanOrEqual(ECONOMY_FLOORS[i].c);
      expect(f.p).toBeGreaterThanOrEqual(ECONOMY_FLOORS[i].p);
    });
  });

  it('FINDING: the sustained per-day offer (renewal + 30 % crumb re-placement + carrion) meets the C13 floors', () => {
    const { ctx } = world();
    const lines: string[] = [];
    let ok = true;
    for (const f of ECONOMY_FLOORS) {
      const s = sustainedOffer(ctx, f.radiusBu), all = dayOffer(ctx, startDistances(ctx), f.radiusBu);
      lines.push(`${f.radiusBu} BU: counted ${all.c.toFixed(1)} C / ${all.p.toFixed(1)} P, sustained ${s.c.toFixed(1)} C / ${s.p.toFixed(1)} P, floor ${f.c} C / ${f.p} P`);
      if (s.c < f.c || s.p < f.p) ok = false;
    }
    console.info(`[verify economy] ${ARCH}#1\n  ${lines.join('\n  ')}`);
    expect(ok, lines.join('; ')).toBe(true);
  });

  it('FINDING: guarantee top-up crumbs lie only in zones where GDD 05 §1.2 / §1.3 places crumbs', () => {
    const { ctx } = world();
    const allowed = new Set<ZoneType>(['lawn', 'pavement', 'asphalt', 'sand', 'rubber', 'interior']);
    const bad = ctx.world.placements.foodAnchors
      .filter((a) => /top-up/.test(a.initialState) && (a.kind === 'crumb' || a.kind === 'sugar'))
      .map((a) => `${a.initialState} in ${zoneOf(ctx, a.pos.x, a.pos.z)}`)
      .filter((s) => !allowed.has(s.split(' in ')[1] as ZoneType));
    expect(bad).toEqual([]);
  });

  it('FINDING: Tier 1 flowers are open all year (GDD 05 §1.2 "T1: always"), so their anchor mask includes winter', () => {
    const { ctx } = world();
    const flowers = ctx.world.placements.foodAnchors.filter((a) => a.initialState.startsWith('flower'));
    expect(flowers.length).toBeGreaterThan(0);
    if (ECOLOGY_TIER === 1) for (const f of flowers) expect(f.seasonMask & WINTER, `flower ${f.id} mask ${f.seasonMask}`).not.toBe(0);
  });
});

// ---- long: sizes and presets the implementer's sweep did not cover (acceptance 2 "per archetype and size") ----

declare const process: { env: Record<string, string | undefined> } | undefined;
const LONG = (typeof process !== 'undefined' ? process.env : {}).FOUNDRESS_LONG === '1';

function gen(a: ArchetypeId, seed: number, size: WorldSizeId, diff: DifficultyId, rivals?: number) {
  let ctx: GenContext | null = null;
  const spy: WorldgenModule = { placers: [{ id: 'zz-verify/capture', step: 'start', order: 1e9, run: (c) => { ctx = c; } }] };
  const params = { ...defaultWorldParams('lasius-niger', seed, diff, size, rivals === undefined ? {} : { rivalCount: rivals }), archetype: a };
  const report = generateWorldReport(params, { modules: [...discoveredModules(), spy] });
  return { report, ctx: ctx! as GenContext };
}

describe.skipIf(!LONG)('long: compact and large maps, gentle / harsh presets, no rivals', () => {
  const CASES: [ArchetypeId, WorldSizeId, DifficultyId, number | undefined][] = [];
  for (const a of ['woodland-edge', 'suburban-garden', 'playground-park', 'car-park-verge', 'kitchen-door'] as ArchetypeId[]) {
    CASES.push([a, 'compact', 'harsh', undefined], [a, 'large', 'naturalist', undefined], [a, 'standard', 'gentle', 0]);
  }
  for (const [a, size, diff, rivals] of CASES) {
    it(`${a} ${size} ${diff}${rivals === 0 ? ' rivals 0' : ''}: seeds 201-203 validate, start rule holds, walker reaches a dig site`, () => {
      const fails: string[] = [];
      for (let seed = 201; seed <= 203; seed++) {
        const { report: r, ctx } = gen(a, seed, size, diff, rivals);
        const tag = `${a}/${size}/${diff}#${seed}`;
        for (const c of r.checks) if (c.status === 'fail') fails.push(`${tag} ${c.id}: ${c.detail}`);
        if (r.repairs.length > 0) console.info(`[verify long] ${tag} repaired [${r.repairs}] attempts=${r.attempts}`);
        const rule = checkStartRule(ctx);
        if (!rule.ok) fails.push(`${tag} start ${rule.detail}`);
        const walk = walkToDigSite(ctx);
        if (!walk.reached || !walk.diggable) fails.push(`${tag} walk ${walk.detail}`);
        const est = ctx.world.placements.rivalSites.filter((x) => !x.incipient);
        if (rivals === 0 && est.length > 0) fails.push(`${tag} rivals placed although 0 requested`);
        const s = sustainedOffer(ctx, ECONOMY_FLOORS[0].radiusBu);
        console.info(`[verify long] ${tag} attempts=${r.attempts} rivals=${est.length}/${ctx.params.rivalCount} inc=${ctx.world.placements.rivalSites.length - est.length}/${ctx.params.incipientCount} sustained300=${s.c.toFixed(1)}C/${s.p.toFixed(1)}P`);
      }
      expect(fails, fails.join('\n')).toEqual([]);
    }, 1_800_000);
  }
});
