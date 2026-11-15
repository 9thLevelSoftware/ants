// Synthetic triggers for every codex rule (tests only), through the real trigger path. Followed by pollOnce(sim).
// Rules that follow a milestone use that milestone's fixture.

import type { FoodSource, Sim, SimEvent } from '@/sim/types';
import { MATERIALS, SPECIES_IDS, ZONE_TYPES } from '@/sim/types';
import { createColony, placeMarker, spawnBrood, spawnSource } from '@/sim/entities';
import { CX_BROOD_COLD_C, CX_MOUND_VOLUME_BU3 } from '@/sim/balance';
import { CODEX_RULES } from './codexRules';
import { MILESTONE_RULES } from './milestoneRules';
import { frassFromPlayerSite, MILESTONE_FIXTURES } from './fixtures';
import { aWorker } from './testkit';

const ORIGIN = { x: 0, y: 0, z: 0 };

const nestOf = (sim: Sim) => sim.stores.nests.list.find((n) => n.colony === sim.state.colonies[0].id)!;
const colId = (sim: Sim): number => sim.state.colonies[0].id;
const emit = (ev: SimEvent) => (sim: Sim): void => sim.emit(ev);

function rival(sim: Sim, species: 'formica-rufa' | 'tetramorium-immigrans'): void {
  const c = createColony(sim, { species, isPlayer: false, fidelity: 'abstract' });
  sim.emit({ type: 'rival-encounter', a: colId(sim), b: c.id, pos: ORIGIN, outcome: 'fight' });
}

function deliveryFromVariant(sim: Sim, variant: string): void {
  const s = spawnSource(sim, { kind: 'nectar', pos: { ...aWorker(sim).pos }, units: 5, init: { variant: variant as FoodSource['variant'] } });
  sim.emit({ type: 'delivery', antId: aWorker(sim).id, colonyId: colId(sim), sourceId: s.id, kind: 'nectar', c: 0.5, p: 0, toxin: 0 });
}

const FIXED: Record<string, (sim: Sim) => void> = {
  'cx-dealation': emit({ type: 'opening.phase', from: 'intro-card', to: 'dealation' }),
  'cx-queen-reserves': (sim) => {
    const q = sim.stores.ants.get(sim.state.colonies[0].queenId)!;
    q.queen!.founding = { reserveLoads: 1, R0: 56, desiccation: 0, wings: false, eggsLaid: 0 };
  },
  'cx-egg-eating': (sim) => sim.emit({ type: 'queen.egg-eaten', queenId: sim.state.colonies[0].queenId }),
  'cx-brood-warmth': (sim) => {
    const ch = nestOf(sim).chambers[0];
    spawnBrood(sim, { colony: colId(sim), stage: 'larva', destined: 'worker', pos: { ...ch.center }, nestId: nestOf(sim).id, chamberId: ch.id });
    ch.temp = CX_BROOD_COLD_C - 5;
  },
  'cx-trophallaxis': (sim) => sim.emit({ type: 'trophallaxis', donorId: aWorker(sim).id, receiverId: -1, amount: 0.1, ambient: true }),
  'cx-route-memory': (sim) => sim.emit({ type: 'route-learned', antId: aWorker(sim).id, sourceId: 1 }),
  'cx-home-range': (sim) => sim.emit({ type: 'forager-departed', antId: aWorker(sim).id, reason: 'spontaneous' }),
  'cx-polyethism': (sim) => sim.emit({ type: 'task-changed', antId: aWorker(sim).id, from: 'nurse', to: 'forage', reason: 'deficit:forage' }),
  'cx-necrophoresis': (sim) => sim.emit({ type: 'corpse-removed', antId: aWorker(sim).id, itemId: 1, to: 'midden' }),
  'cx-nestmate-recognition': (sim) => rival(sim, 'tetramorium-immigrans'),
  'cx-formic-acid': (sim) => sim.emit({ type: 'combat-spray', antId: aWorker(sim).id, pos: ORIGIN, dir: { x: 1, y: 0, z: 0 }, hitIds: [] }),
  'cx-elaiosome': (sim) => deliveryFromVariant(sim, 'elaiosome-seed'),
  'cx-extrafloral-nectar': (sim) => deliveryFromVariant(sim, 'extrafloral-nectary'),
  'cx-cofounding': emit({ type: 'opening.phase', from: 'intro-card', to: 'dealation' }),
  'cx-nuptial-flight': emit({ type: 'flight.eligible', p: 0.8, factors: [] }),
  'cx-males': (sim) => sim.emit({ type: 'ant-died', antId: 1, colonyId: colId(sim), cause: 'old-age', pos: ORIGIN, task: 'idle', caste: 'male' }),
  'cx-hibernation': emit({ type: 'overwinter.report', report: {} }),
  'cx-overwinter-larvae': emit({ type: 'overwinter.report', report: {} }),
  'cx-stone-nests': (sim) => {
    sim.state.player.opening!.siteFactors[3] = 1;
    sim.emit({ type: 'founding-sealed', nestId: nestOf(sim).id, entranceId: nestOf(sim).entrances[0].id });
  },
  'cx-mound-structure': (sim) => { nestOf(sim).volumeOpen = CX_MOUND_VOLUME_BU3 + 1; },
  'cx-frass': frassFromPlayerSite,
  'cx-hybridogenesis': emit({ type: 'flight.ended', id: 1, nFounded: 2 }),
  'cx-hitchhikers': (sim) => sim.emit({ type: 'hitchhiker-mounted', antId: aWorker(sim).id, carrier: -1 }),
  'cx-garden-waste': (sim) => sim.emit({ type: 'waste-dumped', antId: aWorker(sim).id, itemId: 1, to: 'mound' }),
  'cx-fungus-pellet': emit({ type: 'opening.phase', from: 'search', to: 'dig' }),
  'cx-raindrops': emit({ type: 'cue', cue: 'raindrop-hit', pos: null, strength: 1 }),
  'cx-hot-surfaces': (sim) => sim.emit({ type: 'env.heat-stupor', antId: aWorker(sim).id }),
  'cx-dew': emit({ type: 'weather.dew', state: 'formed' }),
  'cx-wind': emit({ type: 'weather.gust', windMs: 6 }),
  'cx-paving-joints': (sim) => sim.emit({ type: 'world.micro-discovered', microId: 1, kind: 'paving-joint', antId: aWorker(sim).id, pos: ORIGIN }),
  'cx-jumping-spider': emit({ type: 'creature-spawned', id: 1, kind: 'jumping-spider', variant: null }),
  'cx-wolf-spider': emit({ type: 'creature-spawned', id: 1, kind: 'wolf-spider', variant: null }),
  'cx-antlion': emit({ type: 'antlion-flick', hazardId: 1, antId: 1 }),
  'cx-ant-spiders': emit({ type: 'creature-spawned', id: 1, kind: 'ant-spider', variant: null }),
  'cx-phorid-flies': emit({ type: 'phorid-strike', antId: 1, carrier: -1 }),
  'cx-formica': (sim) => rival(sim, 'formica-rufa'),
  'cx-pavement-wars': (sim) => rival(sim, 'tetramorium-immigrans'),
  'cx-fungal-threads': (sim) => sim.emit({ type: 'ant-died', antId: 1, colonyId: colId(sim), cause: 'disease', pos: ORIGIN, task: 'idle', caste: 'worker' }),
  'cx-interface-orders': (sim) => { placeMarker(sim, { kind: 'forage', colony: colId(sim), pos: { ...aWorker(sim).pos }, radius: 100 }); },
  'cx-antennation': (sim) => sim.emit({ type: 'action-completed', antId: aWorker(sim).id, action: 'antennate', target: null, result: 1 }),
  'cx-nursing': (sim) => sim.emit({ type: 'feed', giverId: aWorker(sim).id, receiverId: -1, broodId: 5, c: 0.01, p: 0.01 }),
  'cx-springtail': emit({ type: 'creature-spawned', id: 1, kind: 'springtail', variant: null }),
  'cx-interface-why': () => {},
  'cx-interface-markers': () => {},
  'cx-interface-time': () => {},
};

/** Fixture for a codex id; species / material / habitat families are generated. */
export function codexFixture(id: string): (sim: Sim) => void {
  const rule = CODEX_RULES.find((r) => r.id === id);
  if (rule?.afterMilestone) return MILESTONE_FIXTURES[rule.afterMilestone];
  if (FIXED[id]) return FIXED[id];
  for (const sp of SPECIES_IDS) if (id === `cx-species-${sp}`) return () => {};
  for (const m of MATERIALS) if (id === `cx-material-${m}`) return (sim) => sim.emit({ type: 'pellet-created', antId: aWorker(sim).id, itemId: 1, volume: 1, material: m, pos: ORIGIN });
  for (const z of ZONE_TYPES) if (id === `cx-habitat-${z}`) return (sim) => sim.emit({ type: 'world.zone-first-entry', zoneType: z, antId: aWorker(sim).id });
  throw new Error(`no codex fixture for ${id}`);
}

/** Species a codex rule needs (its species gate, or the species of a `cx-species-*` entry). */
export function codexSpecies(id: string): (typeof SPECIES_IDS)[number] {
  for (const sp of SPECIES_IDS) if (id === `cx-species-${sp}`) return sp;
  const rule = CODEX_RULES.find((r) => r.id === id);
  const after = rule?.afterMilestone ? MILESTONE_RULES.find((m) => m.id === rule.afterMilestone) : undefined;
  return rule?.species?.[0] ?? after?.species?.[0] ?? 'lasius-niger';
}
