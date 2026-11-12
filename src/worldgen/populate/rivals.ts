// Rival colony sites (GDD 04 §12.5, GDD 05 §3.1): established rivals drawn from the region roster with weights
// proportional to their suitable zone area (at most one Formica-type, which needs >= 20 % forest; on naturalist
// and harsh at least one conspecific), each sited uniformly among the top 20 % cells of its own nest-site
// suitability (a playable profile with its moisture window or slab-cover rule) that are >= 600 BU from other
// rivals, >= 800 BU from the start and >= 200 BU from the edge (Formica: <= 400 BU from an edge). Incipient
// conspecific colonies sit 300-800 BU from the start and >= 150 BU from any other nest. A rival that fits nowhere
// is dropped (count reduced, noted). The rival module pre-carves the nests from these sites (species -> template).

import type { RngState } from '@/core/rng';
import { rngFloat, rngInt } from '@/core/rng';
import type { RivalSite, SpeciesId, ZoneType } from '@/sim/types';
import type { RivalSpeciesId } from '@/sim/types';
import { RIVAL_SPECIES } from '@/sim/species';
import type { GenContext } from '../kit/context';
import { addRivalSite } from '../kit/records';
import { terrainAt } from '../kit/surface';
import { walkable } from '../maps/nav';
import { mapState } from '../maps/state';
import { profileQ, type SiteProfileInput } from '../maps/suitability';
import { SUIT, SUITABILITY } from '../tuning/maps';
import { VALID } from '../tuning/pipeline';
import { navCentre } from './common';
import { CONSPECIFIC_ZONES, INCIPIENT, INCIPIENT_FALLBACK_ZONES, RIVAL_SITE_PROFILES, RIVAL_TOP_SHARE, SINGLE_ROSTER } from './tuning';

type RivalId = SpeciesId | RivalSpeciesId;

interface RosterEntry { id: RivalId; zones: readonly ZoneType[]; weight: number; input: SiteProfileInput; edgeMaxBu?: number }

function inputFor(ctx: GenContext, id: RivalId): { input: SiteProfileInput; edgeMaxBu?: number; shareMin?: number } {
  const prof = RIVAL_SITE_PROFILES[id as RivalSpeciesId];
  if (!prof) {
    const sp = id as SpeciesId;
    return { input: { digSpecies: sp, profile: SUITABILITY[sp] ?? SUITABILITY[ctx.params.speciesId] } };
  }
  const base = SUITABILITY[prof.base];
  return {
    input: { digSpecies: prof.base, profile: prof.moist ? { ...base, moist: prof.moist } : base, slabCoverMult: prof.slabCoverMult },
    edgeMaxBu: prof.edgeMaxBu, shareMin: prof.zoneShareMin,
  };
}

/** Region roster with weights = map share of each species' zones (0 = absent). */
function roster(ctx: GenContext): RosterEntry[] {
  const share: Partial<Record<ZoneType, number>> = {};
  const total = ctx.dims.size * ctx.dims.size;
  for (const z of ctx.world.zones) share[z.type] = (share[z.type] ?? 0) + z.areaMm2 / total;
  const out: RosterEntry[] = [];
  const add = (id: RivalId, zones: readonly ZoneType[]) => {
    const { input, edgeMaxBu, shareMin } = inputFor(ctx, id);
    const w = zones.reduce((s, z) => s + (share[z] ?? 0), 0);
    if (w <= 0 || (shareMin !== undefined && w < shareMin)) return;
    out.push({ id, zones, weight: w, input, edgeMaxBu });
  };
  add(ctx.params.speciesId, CONSPECIFIC_ZONES[ctx.params.speciesId]);
  for (const r of RIVAL_SPECIES) if (r.regions.includes(ctx.params.region)) add(r.id, r.zones);
  return out;
}

/** Draws `n` established species (weighted, single-roster species once, a conspecific first on naturalist+). */
function draw(ctx: GenContext, rng: RngState, list: RosterEntry[], n: number): RosterEntry[] {
  const picks: RosterEntry[] = [];
  const own = list.find((e) => e.id === ctx.params.speciesId);
  if (own && n > 0 && ctx.params.difficulty !== 'gentle') picks.push(own);
  while (picks.length < n) {
    const pool = list.filter((e) => !(SINGLE_ROSTER as readonly string[]).includes(e.id) || !picks.includes(e));
    const sum = pool.reduce((s, e) => s + e.weight, 0);
    if (sum <= 0) break;
    let r = rngFloat(rng) * sum, pick = pool[pool.length - 1];
    for (const e of pool) { r -= e.weight; if (r <= 0) { pick = e; break; } }
    picks.push(pick);
  }
  // placement in order of roster weight (ties: id)
  return picks.sort((a, b) => b.weight - a.weight || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const dist2 = (a: { x: number; z: number }, b: { x: number; z: number }) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

/** Cells of the species' zones ranked by Q (desc, ties by index), Q > 0, walkable. */
function ranked(ctx: GenContext, q: Float32Array, zones: readonly ZoneType[]): number[] {
  const lay = ctx.layout, cls = ctx.world.nav.cls.data;
  const out: number[] = [];
  for (let c = 0; c < q.length; c++) if (q[c] > 0 && walkable(cls[c]) && zones.includes(lay.zones[lay.nav[c]].type)) out.push(c);
  return out.sort((a, b) => q[b] - q[a] || a - b);
}

function siteAt(ctx: GenContext, c: number): { x: number; y: number; z: number } {
  const p = navCentre(ctx, c);
  return { x: p.x, y: terrainAt(ctx, p.x, p.z), z: p.z };
}

/** Uniform pick among the top share of `order` passing `ok`, relaxing the share; -1 if none. */
function pickTop(rng: RngState, order: number[], ok: (c: number) => boolean): number {
  for (const share of RIVAL_TOP_SHARE) {
    const top = order.slice(0, Math.max(1, Math.ceil(order.length * share))).filter(ok);
    if (top.length > 0) return top[rngInt(rng, 0, top.length - 1)];
  }
  return -1;
}

export function placeRivals(ctx: GenContext): void {
  const rng = ctx.rng('wg/rivals');
  const { size: L, bu } = ctx.dims;
  const start = ctx.world.queenStart.pos;
  const placed: RivalSite[] = [];
  const qCache = new Map<string, Float32Array>();
  const lay = ctx.layout;
  const qOf = (e: { id: RivalId; input: SiteProfileInput; zones: readonly ZoneType[] }) => {
    let q = qCache.get(e.id);
    if (!q) {
      q = profileQ(ctx, e.input, undefined, undefined, (c) => e.zones.includes(lay.zones[lay.nav[c]].type));
      qCache.set(e.id, q);
      if (e.id !== ctx.params.speciesId) ctx.world.maps.suitability[e.id] = { cell: ctx.dims.navCell, nx: ctx.dims.navN, nz: ctx.dims.navN, data: Uint8Array.from(q, (v) => Math.round(v * 255)) };
    }
    return q;
  };
  const list = roster(ctx);
  for (const e of draw(ctx, rng, list, ctx.params.rivalCount)) {
    const q = qOf(e);
    const c = pickTop(rng, ranked(ctx, q, e.zones), (c) => {
      const p = navCentre(ctx, c);
      const edge = Math.min(p.x, p.z, L - p.x, L - p.z);
      if (e.edgeMaxBu !== undefined ? edge > e.edgeMaxBu * bu : edge < VALID.rivalEdgeMinBu * bu) return false;
      if (dist2(p, start) < (VALID.startRivalMinBu * bu) ** 2) return false;
      return placed.every((r) => dist2(r.origin, p) >= (VALID.rivalSpacingBu * bu) ** 2);
    });
    if (c < 0) { ctx.notes.push(`rivals: no site for ${e.id}, count reduced`); continue; }
    const site: RivalSite = { species: e.id, origin: siteAt(ctx, c), incipient: false };
    placed.push(site);
    addRivalSite(ctx, site);
  }
  // incipient conspecifics: 300-800 BU from the start (the far part of the band first), >= 150 BU from any nest
  const own = { id: ctx.params.speciesId as RivalId, input: { digSpecies: ctx.params.speciesId, profile: SUITABILITY[ctx.params.speciesId] }, zones: CONSPECIFIC_ZONES[ctx.params.speciesId] };
  const q = mapState(ctx).q[ctx.params.speciesId] ?? qOf(own);
  // the species' own zones first; any natural zone when those lie outside the band (a forest start)
  const seen = new Set<number>();
  const order = [...ranked(ctx, q, CONSPECIFIC_ZONES[ctx.params.speciesId]), ...ranked(ctx, q, INCIPIENT_FALLBACK_ZONES)]
    .filter((c) => q[c] >= SUIT.fair && !seen.has(c) && !!seen.add(c));
  for (let i = 0; i < ctx.params.incipientCount; i++) {
    const ok = (minBu: number) => (c: number) => {
      const p = navCentre(ctx, c), d2 = dist2(p, start);
      if (d2 < (minBu * bu) ** 2 || d2 > (INCIPIENT.maxBu * bu) ** 2) return false;
      return placed.every((r) => dist2(r.origin, p) >= (INCIPIENT.nestSpacingBu * bu) ** 2);
    };
    let c = pickTop(rng, order, ok(INCIPIENT.preferMinBu));
    if (c < 0) c = pickTop(rng, order, ok(INCIPIENT.minBu));
    if (c < 0) { ctx.notes.push('rivals: no incipient site'); break; }
    const site: RivalSite = { species: ctx.params.speciesId, origin: siteAt(ctx, c), incipient: true };
    placed.push(site);
    addRivalSite(ctx, site);
  }
}
