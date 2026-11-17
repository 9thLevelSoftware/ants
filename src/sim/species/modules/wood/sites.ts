// Nest sites of a wood-nesting colony (GDD 07 §6.2.5): one record per nest of the colony, the parent (`main` nest)
// and satellites (`satellite` nests), with the wood each lies in and its brood-chamber moisture.

import type { Chamber, Colony, Nest, NestSite, Sim } from '@/sim/types';
import { woodAt, woodClimateAt } from './woodState';

/** The chamber whose moisture speaks for the site: young-brood chamber of a parent, late-brood one of a satellite. */
export function broodChamberOf(nest: Nest): Chamber | undefined {
  const order = nest.kind === 'main' ? ['nursery', 'royal', 'founding', 'general', 'rest'] : ['nursery', 'rest', 'general'];
  for (const t of order) {
    const c = nest.chambers.find((x) => x.type === t);
    if (c) return c;
  }
  return nest.chambers[0];
}

/** A point inside the site's wood: its brood chamber, else the founding cavity seed, else the origin. */
export function sitePoint(nest: Nest): { x: number; y: number; z: number } {
  return broodChamberOf(nest)?.center ?? nest.founding?.cavitySeed ?? nest.origin;
}

function woodPrimOf(sim: Sim, nest: Nest): number {
  const bu = sim.world.bu;
  for (const p of [sitePoint(nest), nest.founding?.cavitySeed, nest.origin]) {
    if (!p) continue;
    const hit = woodAt(sim, p, 2 * bu);
    if (hit) return hit.prim.id;
  }
  return -1;
}

/** Makes sure every living nest of the colony has a site record; refreshes wood, moisture and decay. */
export function refreshSites(sim: Sim, col: Colony): NestSite[] {
  const wood = col.wood;
  if (!wood) return [];
  for (const id of col.nestIds) {
    const nest = sim.stores.nests.get(id);
    if (!nest || !nest.alive) continue;
    let site = wood.sites.find((s) => s.nestId === nest.id);
    if (!site) {
      site = {
        id: sim.state.nextId++, role: nest.kind === 'satellite' ? 'satellite' : 'parent',
        state: nest.founding ? 'founding' : 'active', nestId: nest.id, primId: -1, moisture: -1, decay: -1,
        stateTick: sim.state.tick, isolatedSinceTick: -1, hazardEma: 0, waitingSinceTick: -1,
      };
      wood.sites.push(site);
    }
    if (site.state === 'founding' && !nest.founding) setSiteState(sim, site, 'active');
    if (site.primId < 0) site.primId = woodPrimOf(sim, nest);
    const climate = woodClimateAt(sim, sitePoint(nest), 2 * sim.world.bu);
    if (climate) { site.moisture = climate.mc; site.decay = climate.decay; }
  }
  for (const s of wood.sites) {
    if (s.state !== 'abandoned' && !sim.stores.nests.get(s.nestId)) setSiteState(sim, s, 'abandoned');
  }
  return wood.sites;
}

export function setSiteState(sim: Sim, site: NestSite, state: NestSite['state']): void {
  if (site.state === state) return;
  site.state = state;
  site.stateTick = sim.state.tick;
  sim.emit({ type: 'satellite-state', siteId: site.id, state });
}

export function parentSite(col: Colony): NestSite | undefined {
  return col.wood?.sites.find((s) => s.role === 'parent' && s.state !== 'abandoned');
}

export function satelliteSites(col: Colony): NestSite[] {
  return col.wood?.sites.filter((s) => s.role === 'satellite' && s.state !== 'abandoned') ?? [];
}
