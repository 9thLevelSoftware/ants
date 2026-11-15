// Synthetic triggers for every milestone row (tests only): each fixture makes its row fire through the real
// trigger path (an event delivered at flush, or state the poll reads). Followed by pollOnce(sim).

import type { MilestoneId, Sim, SimEvent } from '@/sim/types';
import { spawnAnt, spawnBrood, spawnHerd, spawnPlant } from '@/sim/entities';
import { daysToTicks, secondsToTicks, ticksPerYear } from '@/sim/time';
import { MS_HERD_TEND_GD, MS_POSSESSION_S, MS_TRUNK_TRAIL_GD, MS_WINTERS } from '@/sim/balance';
import { aWorker } from './testkit';

const ORIGIN = { x: 0, y: 0, z: 0 };

function playerNest(sim: Sim) {
  const col = sim.state.colonies[0];
  return sim.stores.nests.list.find((n) => n.colony === col.id)!;
}

function deliveryOf(sim: Sim, kind: string): SimEvent {
  return { type: 'delivery', antId: aWorker(sim).id, colonyId: sim.state.colonies[0].id, sourceId: -1, kind, c: 0.5, p: 0.5, toxin: 0 };
}

function eclosed(sim: Sim, caste: 'worker' | 'gyne' | 'major'): SimEvent {
  return { type: 'ant-eclosed', antId: aWorker(sim).id, colonyId: sim.state.colonies[0].id, caste, nanitic: false, minim: false };
}

function brood(sim: Sim, stage: 'egg' | 'larva' | 'pupa', chamberId = -1) {
  return spawnBrood(sim, { colony: sim.state.colonies[0].id, stage, destined: 'worker', pos: { ...aWorker(sim).pos }, nestId: playerNest(sim).id, chamberId });
}

function tickFor(sim: Sim, ticks: number): void {
  for (let i = 0; i < ticks; i++) sim.tick();
}

/** Tops the player colony up to n adult workers (placed at a worker's spot; positions do not matter here). */
export function addWorkers(sim: Sim, n: number): void {
  const col = sim.state.colonies[0];
  const at = aWorker(sim);
  let have = sim.stores.ants.list.filter((a) => a.alive && a.colony === col.id && a.caste === 'worker').length;
  for (; have < n; have++) spawnAnt(sim, { colony: col.id, caste: 'worker', pos: { ...at.pos }, nestId: at.nestId, chamberId: at.chamberId });
}

/** Frass ejected from a wood site of the player colony (the site and the wood module are made when missing). */
export function frassFromPlayerSite(sim: Sim): void {
  const col = sim.state.colonies[0];
  col.wood ??= { sites: [], frassVisibility: 0, queenMove: null };
  if (col.wood.sites.length === 0) {
    col.wood.sites.push({ id: 1, role: 'parent', state: 'active', nestId: playerNest(sim).id, primId: -1, moisture: 20, decay: 0 });
  }
  sim.emit({ type: 'frass-ejected', siteId: col.wood.sites[0].id, pos: ORIGIN });
}

/** Winters survived: one spring per winter. */
function springs(sim: Sim, n: number): void {
  for (let y = 2; y <= n + 1; y++) sim.emit({ type: 'time.season', season: 'spring', year: y });
}

export const MILESTONE_FIXTURES: Record<MilestoneId, (sim: Sim) => void> = {
  'ms-first-shaft': (sim) => { sim.state.player.opening!.shaftDepthBu = 8; sim.emit({ type: 'founding-readiness', nestId: playerNest(sim).id, readiness: 0.5, parts: { depth: 1, volume: 0.2 } }); },
  'ms-founding-chamber': (sim) => sim.emit({ type: 'founding-readiness', nestId: playerNest(sim).id, readiness: 1, parts: { depth: 1, volume: 1 } }),
  'ms-sealed-in': (sim) => sim.emit({ type: 'founding-sealed', nestId: playerNest(sim).id, entranceId: playerNest(sim).entrances[0].id }),
  'ms-first-eggs': (sim) => sim.emit({ type: 'egg-laid', broodId: 1, queenId: sim.state.colonies[0].queenId, destined: 'worker' }),
  'ms-first-larva': (sim) => sim.emit({ type: 'brood-stage', broodId: brood(sim, 'larva').id, from: 'egg', to: 'larva' }),
  'ms-first-pupa': (sim) => sim.emit({ type: 'brood-stage', broodId: brood(sim, 'pupa').id, from: 'larva', to: 'pupa' }),
  'ms-first-worker': (sim) => sim.emit(eclosed(sim, 'worker')),
  'ms-nest-reopened': (sim) => sim.emit({ type: 'founding-reopened', nestId: playerNest(sim).id }),
  'ms-first-food': (sim) => sim.emit(deliveryOf(sim, 'crumb')),
  'ms-first-honeydew': (sim) => sim.emit(deliveryOf(sim, 'honeydew')),
  'ms-first-prey': (sim) => sim.emit(deliveryOf(sim, 'carrion')),
  'ms-first-trail': (sim) => sim.emit({ type: 'trail-established', colonyId: sim.state.colonies[0].id, sourceId: 7, lengthBu: 40 }),
  'ms-second-chamber': () => {}, // the small test nest has three chambers
  'ms-nursery': (sim) => { const ch = playerNest(sim).chambers[0]; ch.type = 'nursery'; brood(sim, 'egg', ch.id); },
  'ms-first-midden': (sim) => sim.emit({ type: 'corpse-removed', antId: aWorker(sim).id, itemId: 1, to: 'midden' }),
  'ms-second-entrance': (sim) => { const n = playerNest(sim); n.entrances.push({ ...n.entrances[0], id: 99_001 }); },
  'ms-depth-50': (sim) => sim.emit({ type: 'nest-milestone', kind: 'depth-50', value: 50 }),
  'ms-depth-100': (sim) => sim.emit({ type: 'nest-milestone', kind: 'depth-100', value: 100 }),
  'ms-chambers-10': (sim) => sim.emit({ type: 'nest-milestone', kind: 'chambers-10', value: 10 }),
  'ms-volume-1000': (sim) => sim.emit({ type: 'nest-milestone', kind: 'volume-1000', value: 1000 }),
  'ms-first-aphid-herd': (sim) => {
    const plant = spawnPlant(sim, -1, 'herb', 0);
    const h = spawnHerd(sim, plant.id, 'aphid', 40);
    h.tenderColony = sim.state.colonies[0].id;
    h.tend = 0.8;
    tickFor(sim, daysToTicks(MS_HERD_TEND_GD) + 20);
  },
  'ms-first-possession': (sim) => {
    const a = aWorker(sim);
    sim.state.player.possessedAntId = a.id;
    sim.emit({ type: 'possession-started', antId: a.id, caste: a.caste, via: 'roster' });
    tickFor(sim, secondsToTicks(MS_POSSESSION_S) + 20);
  },
  'ms-first-trophallaxis': (sim) => {
    const a = aWorker(sim);
    sim.state.player.possessedAntId = a.id;
    sim.emit({ type: 'trophallaxis', donorId: a.id, receiverId: a.id + 1, amount: 0.1, ambient: false });
  },
  'ms-zone-crossed': (sim) => {
    const n = playerNest(sim);
    sim.emit({ type: 'world.zone-first-entry', zoneType: n.origin.x >= 0 ? 'interior' : 'lawn', antId: aWorker(sim).id });
  },
  'ms-micro-connection': (sim) => sim.emit({ type: 'world.micro-discovered', microId: 1, kind: 'paving-joint', antId: aWorker(sim).id, pos: ORIGIN }),
  'ms-workers-25': (sim) => addWorkers(sim, 25),
  'ms-workers-100': (sim) => addWorkers(sim, 100),
  'ms-workers-500': (sim) => addWorkers(sim, 500),
  'ms-workers-1000': (sim) => addWorkers(sim, 1000),
  'ms-stage-growing': (sim) => sim.emit({ type: 'stage.changed', from: 'first-workers', to: 'growing' }),
  'ms-stage-mature': (sim) => sim.emit({ type: 'stage.changed', from: 'growing', to: 'mature' }),
  'ms-first-rain': (sim) => {
    const w = sim.state.env.weather;
    w.state = 'rain';
    w.intensityClass = 'shower';
    const a = aWorker(sim);
    a.nestId = -1;
    a.medium = 'surface';
  },
  'ms-first-flood-rescue': (sim) => sim.emit({ type: 'nest-milestone', kind: 'survived-flood', value: 1 }),
  'ms-first-heat-wave': (sim) => sim.emit({ type: 'weather.changed', from: 'heat', to: 'clear', intensityClass: null, reason: 'test' }),
  'ms-first-frost': (sim) => sim.emit({ type: 'weather.changed', from: 'clear', to: 'frost', intensityClass: null, reason: 'test' }),
  'ms-first-storm': (sim) => sim.emit({ type: 'weather.changed', from: 'storm', to: 'rain', intensityClass: 'shower', reason: 'test' }),
  'ms-first-footfall': (sim) => sim.emit({ type: 'human.impact', instId: 1, kind: 'footsteps', contact: 'sole', footprint: { ...aWorker(sim).pos }, radiusMm: 100 }),
  'ms-first-fight': (sim) => sim.emit({ type: 'combat-hit', attackerId: aWorker(sim).id, targetId: -1, dmg: 1, kind: 'bite' }),
  'ms-first-rival-defeated': (sim) => sim.emit({ type: 'rival-destroyed', colonyId: 9_999, species: 'tetramorium-immigrans', pos: ORIGIN }),
  'ms-first-winter-survived': (sim) => springs(sim, 1),
  'ms-winter-3': (sim) => springs(sim, MS_WINTERS[0]),
  'ms-winter-10': (sim) => springs(sim, MS_WINTERS[1]),
  'ms-year-1': (sim) => { sim.state.env.calendar.foundingTick = 0; sim.state.tick = ticksPerYear(sim.state.config); },
  'ms-year-5': (sim) => { sim.state.env.calendar.foundingTick = 0; sim.state.tick = 5 * ticksPerYear(sim.state.config); },
  'ms-first-alate': (sim) => sim.emit(eclosed(sim, 'gyne')),
  'ms-first-flight': (sim) => sim.emit({ type: 'flight.launched', id: 1, nGynes: 10, nMales: 20, weather: 'clear' }),
  'ms-first-daughter': (sim) => sim.emit({ type: 'lineage.daughter-added', daughterId: 'd1' }),
  'ms-flight-flown': (sim) => sim.emit({ type: 'flight.possessed-end', gyneId: 1, outcome: 'mated' }),
  'ms-queen-lost': (sim) => sim.emit({ type: 'queen.died', queenId: sim.state.colonies[0].queenId, colonyId: sim.state.colonies[0].id, cause: 'old-age' }),
  'ms-first-gallery': frassFromPlayerSite,
  'ms-satellite-nest': (sim) => sim.emit({ type: 'brood-shuttled', broodId: brood(sim, 'pupa').id, fromSite: 1, toSite: 2 }),
  'ms-night-trail': (sim) => {
    // move the clock to midnight, then a trail
    const t = sim.state.tick + sim.state.env.calendar.startTick;
    sim.state.env.calendar.startTick += daysToTicks(1) - (t % daysToTicks(1));
    sim.emit({ type: 'trail-established', colonyId: sim.state.colonies[0].id, sourceId: 3, lengthBu: 30 });
  },
  'ms-first-seed': (sim) => sim.emit(deliveryOf(sim, 'seed')),
  'ms-first-granary': (sim) => sim.emit({ type: 'granary-state', granaryId: 1, damp: 0, germinating: 0, sprouted: 0, rotting: 0 }),
  'ms-trunk-trail': (sim) => {
    sim.emit({ type: 'trail-established', colonyId: sim.state.colonies[0].id, sourceId: 5, lengthBu: 200 });
    tickFor(sim, daysToTicks(MS_TRUNK_TRAIL_GD) + 20);
  },
  'ms-fungus-planted': (sim) => sim.emit({ type: 'action-completed', antId: sim.state.colonies[0].queenId, action: 'plant', target: null, result: 1 }),
  'ms-first-leaf': (sim) => sim.emit(deliveryOf(sim, 'leaf')),
  'ms-garden-chamber': (sim) => { const ch = playerNest(sim).chambers; ch[0].type = 'fungus'; ch[1].type = 'fungus'; },
  'ms-first-major': (sim) => sim.emit(eclosed(sim, 'major')),
};
