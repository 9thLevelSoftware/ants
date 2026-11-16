// The living layer on three generated standard worlds (woodland-edge, the default suburban-garden and
// kitchen-door, seed 1; generated once per file). Task worldgen-life acceptance 2-6, GDD 04 App. E 6 / 7, the
// GDD 05 §1.3 site-food rule and the registry C13 economy floors. The 20-seed sweeps are in
// validate/sweep.test.ts (FOUNDRESS_LONG=1).
import { describe, expect, it, vi } from 'vitest';
import type { ArchetypeId } from '@/sim/types';
import { SEASONS } from '@/sim/types';
import { createKernel } from '@/sim/kernel';
import { walkRoute } from '../place/outdoor/routeWalk';
import { navDistances, cellAt } from '../validate/graph';
import { walkable } from '../maps/nav';
import { mapState } from '../maps/state';
import { checkStartRule, goodNear } from '../maps/start';
import { SUIT } from '../tuning/maps';
import { VALID } from '../tuning/pipeline';
import { generated, siteDistribution, walkToDigSite } from './testkit';
import { ECOLOGY_TIER } from '@/sim/balance';
import { accessOfAnchor, dayOffer, sourceVariant, sustainedOffer } from './economy';
import { foodReport, siteFoodShare } from './finalize';
import { honeydewFilmFeet, placeFilm, removeFilm } from './food';
import { anchorSeasonMask, startDistances } from './common';
import { HOST_BIT, routeOfPoi } from './hosts';
import { ANT_PREDATORS, CRUMB_SPOT, ECONOMY_FLOORS, ECONOMY_LEAN_ACCEPT, INCIPIENT, PREDATOR_START_CLEAR_BU, START_RULE, topUpZones } from './tuning';

vi.setConfig({ testTimeout: 180_000 });

const WORLDS: readonly ArchetypeId[] = ['woodland-edge', 'suburban-garden', 'kitchen-door'];
const all = () => WORLDS.map((a) => ({ a, ...generated(a, 1, 'standard', 'lasius-niger', true, () => performance.now()) }));
const dist = (p: { x: number; z: number }, q: { x: number; z: number }) => Math.sqrt((p.x - q.x) ** 2 + (p.z - q.z) ** 2);

describe('validation (acceptance 2)', () => {
  it('every check passes within the attempt limit', () => {
    for (const { a, report: r, ms } of all()) {
      console.info(`[populate] ${a}#1 attempts=${r.attempts} repairs=[${r.repairs}] ${ms.toFixed(0)} ms\n  ${r.checks.map((c) => `${c.id}:${c.status} ${c.detail}`).join('\n  ')}`);
      expect(r.checks.filter((c) => c.status === 'fail').map((c) => `${c.id}: ${c.detail}`)).toEqual([]);
      for (const id of ['v-food', 'v-micro', 'v-rivals', 'v-start', 'v-found', 'v-connect'] as const) {
        expect(r.checks.find((c) => c.id === id)?.status, `${a} ${id}`).toBe('pass');
      }
      expect(r.attempts).toBeLessThanOrEqual(8);
    }
  });
});

describe('food anchors (acceptance 5, GDD 04 §8.1, GDD 05 §0 / §1.3)', () => {
  it('none is inside a solid and every one is reachable from the start (nav grid, portals, walkable climb routes)', () => {
    for (const { a, ctx } of all()) {
      const w = ctx.world;
      const k = createKernel(w, { voxel: w.bu / 2, keys: [], chunks: [], breaches: [] }, { field: { hashCell: 32 * w.bu } });
      const d = navDistances(ctx, [cellAt(ctx, w.queenStart.pos.x, w.queenStart.pos.z)]);
      let climbs = 0;
      for (const an of w.placements.foodAnchors) {
        expect(k.field.sampleXYZ(an.pos.x, an.pos.y, an.pos.z), `${a} anchor ${an.id} ${an.initialState} inside a solid`).toBeGreaterThan(-0.5);
        const acc = accessOfAnchor(ctx, an);
        expect(acc, `${a} anchor ${an.id} has no access`).not.toBeNull();
        expect(d[acc!.cell], `${a} anchor ${an.id} ${an.initialState} unreachable`).toBeLessThan(Infinity);
        if (acc!.climbBu > 0) climbs++;
      }
      // climb routes to flowers and herds: an independent walker (the outdoor placer's, up and back) follows them
      const routes = new Set<number>();
      for (const an of w.placements.foodAnchors) {
        const ob = w.objects.find((o) => o.id === an.hostObjectId);
        if (ob && accessOfAnchor(ctx, an)!.climbBu > 0 && an.kind === 'nectar') for (const r of ob.routeIds) routes.add(r);
      }
      let ok = 0, tried = 0;
      for (const id of [...routes].slice(0, 40)) {
        const r = w.climbRoutes.find((x) => x.id === id)!;
        tried++;
        if (walkRoute(k, r.points, w.bu).up) ok++;
      }
      console.info(`[populate] ${a}: ${w.placements.foodAnchors.length} anchors, ${climbs} by climbing; flower routes walked ${ok}/${tried}`);
      expect(ok).toBeGreaterThanOrEqual(tried - 1);
    }
  });

  it('kinds by zone and season: flowers on nectar hosts, honeydew sites, crumbs, interior food, season masks', () => {
    for (const { a, ctx } of all()) {
      const w = ctx.world;
      const fa = w.placements.foodAnchors;
      const byObj = new Map(w.placements.plants.map((p) => [p.objectId, p]));
      for (const an of fa.filter((x) => x.initialState.startsWith('flower'))) expect(byObj.get(an.hostObjectId)!.hostFlags & HOST_BIT.nectar).toBeTruthy();
      const films = fa.filter((x) => x.initialState.startsWith('honeydew-film'));
      const d = navDistances(ctx, [cellAt(ctx, w.queenStart.pos.x, w.queenStart.pos.z)]);
      if (ECOLOGY_TIER < 2) { // the T1 static films (GDD 05 §0); at T2 they are not sources and their count is free
        expect(films.length, a).toBe(6); // 1 per 250 plots on a standard map (GDD 05 §0)
        expect(films.filter((f) => d[accessOfAnchor(ctx, f)!.cell] <= 600).length, a).toBeGreaterThanOrEqual(2);
      }
      for (const f of films) expect(byObj.get(f.hostObjectId)!.hostFlags & HOST_BIT.aphid).toBeTruthy();
      const crumbs = fa.filter((x) => x.kind === 'crumb');
      expect(crumbs.some((c) => c.initialState.startsWith('crumb-protein')), a).toBe(true);
      expect(fa.filter((x) => x.kind === 'crumb' || x.kind === 'sugar').length).toBeLessThanOrEqual(60 + 24);
      const elaio = fa.filter((x) => x.initialState.startsWith('elaiosome-seed'));
      // elaiosome seeds: catalogue days 3-9 (spring and the first summer days), never autumn or winter
      for (const e of elaio) expect(e.seasonMask).toBe((1 << SEASONS.indexOf('spring')) | (1 << SEASONS.indexOf('summer')));
      for (const x of fa) expect(x.seasonMask, `${a} ${x.initialState}`).toBeGreaterThan(0);
      if (a === 'kitchen-door') {
        const interior = fa.filter((x) => ctx.layout.zones[ctx.layout.nav[cellAt(ctx, x.pos.x, x.pos.z)]].type === 'interior');
        expect(interior.some((x) => x.kind === 'crumb'), 'interior crumbs').toBe(true);
      }
      // T1 sources come from flowers, films, crumbs and sugar; T2 kinds wait for their tier. At Tier 2 (viab-economy
      // R1) the static films give way to the herds on the `aphid-herd` anchors (plants module) and T2 kinds appear.
      const made = new Set(fa.map((x) => sourceVariant(x)).filter((v) => v));
      if (ECOLOGY_TIER < 2) {
        expect([...made].every((v) => ['flower', 'honeydew-film', 'crumb-starch', 'crumb-protein', 'sugar-granules', 'sugary-spill'].includes(v!)), [...made].join()).toBe(true);
        expect(made.has('flower') && made.has('honeydew-film')).toBe(true);
      } else {
        expect(made.has('flower') && !made.has('honeydew-film'), [...made].join()).toBe(true);
        expect(fa.some((x) => x.initialState.startsWith('aphid-herd')), a).toBe(true);
      }
    }
  });

  it('economy floors (registry C13) and food near the start (GDD 04 v-food, GDD 05 §1.3)', () => {
    for (const { a, ctx } of all()) {
      const r = foodReport(ctx);
      console.info(`[economy] ${a}#1 summer day offer: ${r.floors.map((f) => `${f.radiusBu} BU ${f.c.toFixed(1)} C / ${f.p.toFixed(1)} P`).join(', ')}; near=${r.near} siteCarbMin=${r.siteMin}`);
      // integrator ruling R8 (econ-growth): a floor passes from ECONOMY_LEAN_ACCEPT of its target; below the full
      // target the world is flagged economyLean
      r.floors.forEach((f, i) => {
        expect(f.c, `${a} C within ${f.radiusBu}`).toBeGreaterThanOrEqual(ECONOMY_LEAN_ACCEPT * ECONOMY_FLOORS[i].c);
        expect(f.p, `${a} P within ${f.radiusBu}`).toBeGreaterThanOrEqual(ECONOMY_LEAN_ACCEPT * ECONOMY_FLOORS[i].p);
        const full = f.c >= ECONOMY_FLOORS[i].c && f.p >= ECONOMY_FLOORS[i].p;
        expect(f.lean, `${a} lean flag at ${f.radiusBu}`).toBe(!full);
      });
      expect(r.economyLean).toBe(r.floors.some((f) => f.lean));
      // the generation note agrees with the final report (econ-growth review: it was read before the last flowers)
      expect(ctx.notes.some((n) => n.startsWith('economyLean:')), `${a} economyLean note`).toBe(r.economyLean);
      expect(r.near).toBeGreaterThanOrEqual(3);
      expect(r.carb && r.protein).toBe(true);
      expect(r.siteMin).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('plant hosts (deliverable 2)', () => {
  it('aphid hosts within 20-90; usable host points are POIs of the plant whose routes a walker follows', () => {
    for (const { a, ctx } of all()) {
      const w = ctx.world;
      const aphid = w.placements.plants.filter((p) => p.hostFlags & HOST_BIT.aphid).length;
      expect(aphid, a).toBeGreaterThanOrEqual(20);
      // promotions and film hosts stop at the cap; only tree branch colonies (p 0.35 per branch) come on top
      expect(aphid, a).toBeLessThanOrEqual(90 + w.placements.plants.filter((p) => p.hostClass === 'tree').length);
      const k = createKernel(w, { voxel: w.bu / 2, keys: [], chunks: [], breaches: [] }, { field: { hashCell: 32 * w.bu } });
      let checked = 0;
      for (const p of w.placements.plants.filter((x) => x.hostFlags !== 0).slice(0, 25)) {
        const ob = w.objects.find((o) => o.id === p.objectId)!;
        expect(p.hostPoiIds, `${a} plant ${p.objectId}`).toBeDefined();
        for (const id of p.hostPoiIds!) expect(ob.poiIds).toContain(id);
        if (p.hostPoiIds!.length > 0) {
          // the route that leads to the usable point (a tree has one per branch; its first route need not be one)
          const poi = w.pois.find((q) => q.id === p.hostPoiIds![0])!;
          const route = w.climbRoutes.find((r) => r.id === routeOfPoi(ctx, ob, poi))!;
          expect(walkRoute(k, route.points, w.bu).up).toBe(true);
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(5);
    }
  });
});

describe('creature territories (deliverable 3, GDD 04 §8.2)', () => {
  it('prey with prey patches, aphids with herd sites, caps respected, ant predators clear of the start', () => {
    for (const { a, ctx } of all()) {
      const w = ctx.world, t = w.placements.territories;
      const count = (k: string) => t.filter((x) => x.creatureKind === k).length;
      expect(count('springtail')).toBe(w.placements.foodAnchors.filter((x) => x.kind === 'prey').length);
      expect(count('aphid')).toBeGreaterThan(0);
      expect(count('wolf-spider')).toBeLessThanOrEqual(4);
      expect(count('jumping-spider')).toBeLessThanOrEqual(4);
      expect(count('earthworm')).toBeLessThanOrEqual(30);
      expect(count('antlion')).toBeLessThanOrEqual(6);
      for (const x of t) {
        expect(x.radiusMm).toBeGreaterThan(0);
        if (ANT_PREDATORS.includes(x.creatureKind)) expect(dist(x.center, w.queenStart.pos), `${a} ${x.creatureKind}`).toBeGreaterThanOrEqual(PREDATOR_START_CLEAR_BU * w.bu + x.radiusMm - 1);
      }
    }
  });
});

describe('rival sites (deliverable 4, acceptance 3, GDD 04 §12.5)', () => {
  it('established rivals respect RIVAL_SPACING_BU / RIVAL_START_MIN_BU / the edge rule; incipients 300-800 BU', () => {
    for (const { a, ctx } of all()) {
      const w = ctx.world, bu = w.bu, s = w.queenStart.pos;
      const est = w.placements.rivalSites.filter((r) => !r.incipient), inc = w.placements.rivalSites.filter((r) => r.incipient);
      console.info(`[rivals] ${a}#1 ${w.placements.rivalSites.map((r) => `${r.species}${r.incipient ? ' (incipient)' : ''} ${(dist(r.origin, s) / bu).toFixed(0)} BU`).join(', ')}`);
      expect(est.length).toBe(w.params.rivalCount);
      expect(inc.length).toBe(w.params.incipientCount);
      expect(est.filter((r) => r.species === 'formica-rufa').length).toBeLessThanOrEqual(1);
      expect(est.some((r) => r.species === w.params.speciesId), 'a conspecific on naturalist').toBe(true);
      for (let i = 0; i < est.length; i++) {
        expect(dist(est[i].origin, s)).toBeGreaterThanOrEqual(VALID.startRivalMinBu * bu);
        const e = Math.min(est[i].origin.x, est[i].origin.z, w.size - est[i].origin.x, w.size - est[i].origin.z);
        if (est[i].species !== 'formica-rufa') expect(e).toBeGreaterThanOrEqual(VALID.rivalEdgeMinBu * bu);
        for (let j = i + 1; j < est.length; j++) expect(dist(est[i].origin, est[j].origin)).toBeGreaterThanOrEqual(VALID.rivalSpacingBu * bu);
        if (est[i].species !== w.params.speciesId) expect(w.maps.suitability[est[i].species], `${est[i].species} map`).toBeDefined();
      }
      for (const r of inc) {
        expect(dist(r.origin, s)).toBeGreaterThanOrEqual(INCIPIENT.minBu * bu);
        expect(dist(r.origin, s)).toBeLessThanOrEqual(INCIPIENT.maxBu * bu);
        for (const o of w.placements.rivalSites) if (o !== r) expect(dist(o.origin, r.origin)).toBeGreaterThanOrEqual(INCIPIENT.nestSpacingBu * bu);
      }
    }
  });
});

describe('queen start (deliverable 5, acceptance 3, directions §K)', () => {
  it('outdoors on bare natural ground, fair or worse, >= 3 good sites by walking within 250 BU, a founding patch nearby', () => {
    for (const { a, ctx } of all()) {
      const w = ctx.world, s = w.queenStart.pos;
      const c = cellAt(ctx, s.x, s.z);
      const zone = ctx.layout.zones[ctx.layout.nav[c]];
      const rule = checkStartRule(ctx);
      console.info(`[start] ${a}#1 ${rule.detail}`);
      expect(rule.ok, rule.detail).toBe(true);
      expect(zone.built).toBeNull();
      expect(['forest', 'lawn', 'garden-bed']).toContain(zone.type);
      expect(walkable(w.nav.cls.data[c])).toBe(true);
      expect(mapState(ctx).q[w.params.speciesId][c]).toBeLessThan(SUIT.good);
      expect(goodNear(ctx, c).count).toBeGreaterThanOrEqual(START_RULE.goodMin);
      expect(Math.hypot(w.queenStart.fwd.x, w.queenStart.fwd.z)).toBeCloseTo(1, 4);
    }
  });

  it('a kernel walker gets from the start to a diggable founding site (the opening\'s first dig)', () => {
    for (const { a, ctx } of all()) {
      const r = walkToDigSite(ctx);
      console.info(`[start] ${a}#1 walk to dig site: ${r.detail}`);
      expect(r.reached, `${a}: ${r.detail}`).toBe(true);
      expect(r.diggable, `${a}: ${r.detail}`).toBe(true);
    }
  });
});

describe('founding-site quality discriminates (directions §K ruling, measured on the final worlds)', () => {
  // Only the caps on excellent and good are binding (directions §K ruling, worldgen-life addendum 3); the other
  // shares are printed. The scoring itself is being unified with the live read-out by the founding task.
  it('excellent <= 10 %, good <= 25 % of the diggable cells', () => {
    for (const { a, ctx } of all()) {
      const d = siteDistribution(ctx);
      const pct = (x: number) => (100 * x).toFixed(1);
      console.info(`[sites] ${a}#1 ${d.total} diggable cells: excellent ${pct(d.excellent)} %, good ${pct(d.good)} %, fair ${pct(d.fair)} %, poor ${pct(d.poor)} %; open lawn fair ${d.lawnFair}/${d.lawn}; sunny cover good+ ${d.covGood}/${d.cov}`);
      expect(d.excellent).toBeLessThanOrEqual(0.1);
      expect(d.good).toBeLessThanOrEqual(0.25);
    }
  });
});

// ---- review fixes (worldgen-life review): flows-only economy, zone rules of top-ups, T1 flower season, crumb
// spot hosts, the film host flag, the start-rule check, map-wide site food ----

describe('review fixes', () => {
  it('the floors are checked against the renewable daily supply; it never exceeds stock + one day of renewal', () => {
    for (const { a, ctx } of all()) {
      const d = startDistances(ctx);
      for (const f of ECONOMY_FLOORS) {
        const flow = sustainedOffer(ctx, d, f.radiusBu), stock = dayOffer(ctx, d, f.radiusBu);
        expect(flow.c, `${a} ${f.radiusBu}`).toBeLessThanOrEqual(stock.c + 1e-9);
        // sugar granules have no renewal at Tier 1: they add nothing to the daily supply
        expect(flow.byVariant['sugar-granules']?.c ?? 0).toBe(0);
        const r = foodReport(ctx).floors.find((x) => x.radiusBu === f.radiusBu)!;
        expect(r.c).toBeCloseTo(flow.c, 9);
        expect(r.p).toBeCloseTo(flow.p, 9);
      }
    }
  });

  it('guarantee top-ups lie only in zones where the catalogue places that food (no crumbs in forest or beds)', () => {
    for (const { a, ctx } of all()) {
      for (const an of ctx.world.placements.foodAnchors) {
        if (!/top-up/.test(an.initialState) || an.kind !== 'crumb') continue;
        const zone = ctx.layout.zones[ctx.layout.nav[cellAt(ctx, an.pos.x, an.pos.z)]].type;
        expect(topUpZones(sourceVariant(an)!), `${a} ${an.initialState} in ${zone}`).toContain(zone);
      }
      expect(topUpZones('crumb-starch')).not.toContain('forest');
      expect(topUpZones('crumb-starch')).not.toContain('garden-bed');
    }
  });

  it('Tier 1 flowers are open all year (GDD 05 §1.2 "T1: always"): their anchors carry the winter bit', () => {
    const winter = 1 << SEASONS.indexOf('winter');
    expect(anchorSeasonMask('flower', 'nectar') & winter).toBe(ECOLOGY_TIER === 1 ? winter : 0);
    expect(anchorSeasonMask('elaiosome-seed', 'seed') & winter).toBe(0);
    for (const { ctx } of all()) {
      for (const f of ctx.world.placements.foodAnchors.filter((x) => x.initialState.startsWith('flower'))) {
        expect(f.seasonMask).toBe(anchorSeasonMask('flower', 'nectar'));
      }
    }
  });

  it('crumbs by benches, tables and bins name their object; bin crumbs draw fruit flies', () => {
    const SPOTS = new Set(['bench', 'patio-table', 'picnic-table', 'litter-bin']);
    let spotCrumbs = 0, binCrumbs = 0;
    for (const { a, ctx } of all()) {
      const w = ctx.world;
      const byId = new Map(w.objects.map((o) => [o.id, o]));
      for (const an of w.placements.foodAnchors.filter((x) => x.kind === 'crumb' && x.hostObjectId >= 0)) {
        const ob = byId.get(an.hostObjectId)!;
        if (SPOTS.has(ob.templateId)) { spotCrumbs++; expect(dist(an.pos, ob.pos), `${a} crumb ${an.id}`).toBeLessThanOrEqual(CRUMB_SPOT.radiusMm + 1); }
        if (ob.templateId === 'litter-bin' || ob.templateId === 'pedal-bin') {
          binCrumbs++;
          const fly = w.placements.territories.some((t) => t.creatureKind === 'fruit-fly' && dist(t.center, an.pos) < 1e-6);
          expect(fly, `${a} bin crumb ${an.id}`).toBe(true);
        }
      }
      // no fruit flies on crumbs of other objects (counters, tables): GDD 04 §8.2 lists bins, fruit and windfalls
      for (const t of w.placements.territories.filter((x) => x.creatureKind === 'fruit-fly')) {
        const src = w.placements.foodAnchors.find((x) => dist(x.pos, t.center) < 1e-6);
        if (!src) continue; // its anchor was pruned as unreachable from the final start
        const host = byId.get(src.hostObjectId)?.templateId ?? '';
        expect(src.kind === 'fruit' || host === 'litter-bin' || host === 'pedal-bin', `${a} fly on ${src.initialState} @${host}`).toBe(true);
      }
    }
    expect(spotCrumbs).toBeGreaterThan(0);
    expect(binCrumbs).toBeGreaterThan(0);
  });

  it('a film turned down after placing leaves no host flag; removing a film demotes a plant it promoted', () => {
    const { ctx } = all()[0];
    const w = ctx.world;
    const foot = honeydewFilmFeet(ctx).find((f) => !f.host && !(f.p.hostFlags & HOST_BIT.aphid));
    expect(foot).toBeDefined();
    const flags = foot!.p.hostFlags, n = w.placements.foodAnchors.length, pois = foot!.p.hostPoiIds;
    try {
      expect(placeFilm(ctx, foot!, () => false)).toBe(false);
      expect(foot!.p.hostFlags).toBe(flags);
      expect(w.placements.foodAnchors.length).toBe(n);
      if (placeFilm(ctx, foot!)) {
        expect(foot!.p.hostFlags & HOST_BIT.aphid).toBeTruthy();
        removeFilm(ctx, w.placements.foodAnchors[w.placements.foodAnchors.length - 1]);
        expect(foot!.p.hostFlags).toBe(flags);
        expect(foot!.host).toBe(false);
      }
      expect(w.placements.foodAnchors.length).toBe(n);
    } finally {
      foot!.p.hostFlags = flags;
      foot!.p.hostPoiIds = pois;
      foot!.host = false;
      w.placements.foodAnchors.length = n;
    }
  });

  it('the start-rule check re-checks the map edge and keeps predator territories radius + 40 BU away', () => {
    const { ctx } = all()[1];
    const w = ctx.world, s = { ...w.queenStart.pos }, bu = w.bu;
    expect(checkStartRule(ctx).ok).toBe(true);
    try {
      w.queenStart.pos = { ...s, x: (VALID.startEdgeMinBu - 20) * bu };
      expect(checkStartRule(ctx).detail).toContain('edge=false');
    } finally { w.queenStart.pos = s; }
    const r = 200 * bu;
    w.placements.territories.push({ creatureKind: 'wolf-spider', center: { x: s.x + r + (START_RULE.hazardClearBu - 10) * bu, y: 0, z: s.z }, radiusMm: r, zoneMask: 0xff, cap: 1 });
    try {
      expect(checkStartRule(ctx).detail).toContain('hazardFree=false');
    } finally { w.placements.territories.pop(); }
    expect(checkStartRule(ctx).ok).toBe(true);
  });

  it('GDD 05 §1.3 site food is measured map-wide; flowers opened for poorly fed sites sit on nectar hosts within the cap', () => {
    for (const { a, ctx } of all()) {
      const r = siteFoodShare(ctx);
      console.info(`[site food] ${a}#1 good sites ${r.sites}, share with >= 2 carbohydrate sources within 400 BU ${(100 * r.share).toFixed(0)} %`);
      expect(r.carcassZones).toBe(true);
      expect(r.share).toBeGreaterThan(0);
      const fa = ctx.world.placements.foodAnchors;
      expect(fa.filter((x) => x.initialState.startsWith('flower')).length).toBeLessThanOrEqual(150);
      const byObj = new Map(ctx.world.placements.plants.map((p) => [p.objectId, p]));
      for (const f of fa.filter((x) => /site-food/.test(x.initialState))) expect(byObj.get(f.hostObjectId)!.hostFlags & HOST_BIT.nectar).toBeTruthy();
    }
  });
});
