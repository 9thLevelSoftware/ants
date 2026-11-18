// Codex unlock triggers (GDD 06 §10, registry B6): one rule per concrete codex id (`allCodexIds()`), including the
// species, material and habitat families. GDD 06 asks for "observed by the player's view"; the sim cannot see the
// screen, so a rule fires when the underlying sim event happens to the player colony (or, for materials and
// habitats, to the possessed ant). The interface entries that are the manual are unlocked at game start.

import type { CodexId, Sim } from '@/sim/types';
import { MATERIALS, SPECIES_IDS, ZONE_TYPES } from '@/sim/types';
import {
  CX_BROOD_COLD_C, CX_MOUND_VOLUME_BU3, CX_QUEEN_RESERVE_FRAC, CX_STONE_COVER,
} from '@/sim/balance';
import { zoneAt } from '@/sim/world';
import { isPlayerColonyId, memGet, memSet, playerColony } from './engine';
import {
  colonySpecies, isPlayerAntId, isPlayerWoodSite, playerNests, possessedAnt, sourceVariant, type TriggerRule, when, yes,
} from './triggers';

const LN = ['lasius-niger'] as const;
const MB = ['messor-barbarus'] as const;
const AT = ['atta-texana'] as const;

/** Cover factor index in `opening.siteFactors` (SITE_FACTORS order). */
const COVER_FACTOR = 3;

function creatureSeen(kind: string): TriggerRule<CodexId>['on'] {
  return { 'creature-spawned': (_s, e) => when(e.kind === kind) };
}

function deliveredVariant(sim: Sim, colonyId: number, sourceId: number, variant: string): boolean {
  return isPlayerColonyId(sim, colonyId) && sourceVariant(sim, sourceId) === variant;
}

function queenReservesLow(sim: Sim): boolean {
  const col = playerColony(sim);
  const q = col ? sim.stores.ants.get(col.queenId) : undefined;
  const f = q?.queen?.founding;
  return !!f && f.R0 > 0 && f.reserveLoads < CX_QUEEN_RESERVE_FRAC * f.R0;
}

function broodInCold(sim: Sim): boolean {
  const col = playerColony(sim);
  if (!col) return false;
  const withBrood = new Set<number>();
  for (const b of sim.stores.brood.list) if (b.alive && b.colony === col.id && b.chamberId >= 0) withBrood.add(b.chamberId);
  for (const n of playerNests(sim)) {
    // chamber temperatures are kept by the nest module's chamber upkeep
    for (const ch of n.chambers) if (withBrood.has(ch.id) && ch.temp < CX_BROOD_COLD_C) return true;
  }
  return false;
}

/** First sight of a rival species: the colony discovers its nest or meets one of its workers (GDD 06 §10 "seen"). */
function rivalSeen(prefix: string): TriggerRule<CodexId>['on'] {
  return {
    'rival-discovered': (sim, e) => when(isPlayerColonyId(sim, e.by) && e.species.startsWith(prefix)),
    'rival-encounter': (sim, e) => {
      const other = isPlayerColonyId(sim, e.a) ? e.b : isPlayerColonyId(sim, e.b) ? e.a : -1;
      return when(other >= 0 && colonySpecies(sim, other).startsWith(prefix));
    },
  };
}

/** 32-bit FNV-1a hash of a string (a number that fits the trigger memory). */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/** True once the player-set directives differ from the first values seen (stay-in timers excluded: set by the sim). */
function directivesChanged(sim: Sim): boolean {
  const col = playerColony(sim);
  if (!col) return false;
  const { stayIn: _a, stayInUntil: _b, ...set } = col.directives;
  const h = hash32(JSON.stringify(set));
  const base = memGet(sim, 'directivesHash', -1);
  if (base < 0) memSet(sim, 'directivesHash', h);
  return base >= 0 && h !== base;
}

const FIXED: readonly TriggerRule<CodexId>[] = [
  { id: 'cx-dealation', on: { 'opening.phase': (_s, e) => when(e.to === 'dealation') } },
  { id: 'cx-claustral-founding', afterMilestone: 'ms-sealed-in' },
  { id: 'cx-queen-reserves', poll: (sim) => when(queenReservesLow(sim)) },
  { id: 'cx-egg-eating', on: { 'queen.egg-eaten': () => yes(), cannibalism: (sim, e) => when(isPlayerColonyId(sim, e.colonyId)) } },
  { id: 'cx-brood-stages', afterMilestone: 'ms-first-pupa' },
  { id: 'cx-callow', afterMilestone: 'ms-first-worker' },
  { id: 'cx-nanitics', afterMilestone: 'ms-first-worker' },
  { id: 'cx-brood-warmth', poll: (sim) => when(broodInCold(sim)) },
  { id: 'cx-trophallaxis', on: { trophallaxis: (sim, e) => when(isPlayerAntId(sim, e.donorId) || isPlayerAntId(sim, e.receiverId)) } },
  { id: 'cx-trail-pheromone', afterMilestone: 'ms-first-trail' },
  { id: 'cx-route-memory', on: { 'route-learned': (sim, e) => when(isPlayerAntId(sim, e.antId)) } },
  // GDD 06: "crossing a home-range gradient"; nearest emitter: a forager of the colony setting out over its range.
  { id: 'cx-home-range', on: { 'forager-departed': (sim, e) => when(isPlayerAntId(sim, e.antId)) } },
  { id: 'cx-polyethism', on: { 'task-changed': (sim, e) => when(e.from === 'nurse' && e.to === 'forage' && isPlayerAntId(sim, e.antId)) } },
  { id: 'cx-necrophoresis', on: { 'corpse-removed': (sim, e) => when(isPlayerAntId(sim, e.antId)) } },
  {
    id: 'cx-nestmate-recognition',
    on: { 'rival-encounter': (sim, e) => when(isPlayerColonyId(sim, e.a) || isPlayerColonyId(sim, e.b)) },
  },
  { id: 'cx-formic-acid', on: { 'combat-spray': (sim, e) => when(isPlayerAntId(sim, e.antId)) } },
  { id: 'cx-honeydew', afterMilestone: 'ms-first-honeydew' },
  { id: 'cx-aphid-tending', afterMilestone: 'ms-first-aphid-herd' },
  { id: 'cx-protein-larvae', afterMilestone: 'ms-first-prey' },
  { id: 'cx-elaiosome', on: { delivery: (sim, e) => when(deliveredVariant(sim, e.colonyId, e.sourceId, 'elaiosome-seed')) } },
  { id: 'cx-extrafloral-nectar', on: { delivery: (sim, e) => when(deliveredVariant(sim, e.colonyId, e.sourceId, 'extrafloral-nectary')) } },
  { id: 'cx-cofounding', species: LN, on: { 'opening.phase': (_s, e) => when(e.from === 'intro-card') } },
  // flight.* and lineage.* events concern the player colony only (GDD 06 §11: the FlightRecord and the Lineage are
  // the player's; rivals reproduce through `rival-founded`), so those rows need no colony check
  { id: 'cx-nuptial-flight', on: { 'flight.eligible': () => yes() } },
  { id: 'cx-males', on: { 'ant-died': (sim, e) => when(e.caste === 'male' && isPlayerColonyId(sim, e.colonyId)) } },
  { id: 'cx-hibernation', on: { 'overwinter.report': () => yes() } },
  { id: 'cx-overwinter-larvae', on: { 'overwinter.report': () => yes() } },
  {
    id: 'cx-stone-nests',
    on: { 'founding-sealed': (sim) => when((sim.state.player.opening?.siteFactors[COVER_FACTOR] ?? 0) >= CX_STONE_COVER) },
  },
  { id: 'cx-mound-structure', poll: (sim) => when(playerNests(sim).some((n) => n.volumeOpen > CX_MOUND_VOLUME_BU3)) },
  { id: 'cx-wood-moisture', afterMilestone: 'ms-first-gallery' },
  // "frass pile exists": a pile grows only from an ejection, and only the ejection names its (ownable) site
  { id: 'cx-frass', on: { 'frass-ejected': (sim, e) => when(isPlayerWoodSite(sim, e.siteId)) } },
  { id: 'cx-satellite-nests', afterMilestone: 'ms-satellite-nest' },
  { id: 'cx-night-foraging', afterMilestone: 'ms-night-trail' },
  // "first seed of each size class": one entry, unlocked by the first seed delivered.
  { id: 'cx-seed-classes', afterMilestone: 'ms-first-seed' },
  { id: 'cx-trunk-trail', afterMilestone: 'ms-trunk-trail' },
  { id: 'cx-granary-chaff', afterMilestone: 'ms-first-granary' },
  { id: 'cx-hybridogenesis', species: MB, on: { 'flight.ended': () => yes() } },
  { id: 'cx-fungus-garden', afterMilestone: 'ms-fungus-planted' },
  { id: 'cx-leaf-cutting', afterMilestone: 'ms-first-leaf' },
  { id: 'cx-hitchhikers', on: { 'hitchhiker-mounted': (sim, e) => when(isPlayerAntId(sim, e.antId)) } },
  { id: 'cx-garden-waste', species: AT, on: { 'waste-dumped': (sim, e) => when(isPlayerAntId(sim, e.antId)) } },
  {
    id: 'cx-fungus-pellet', species: AT,
    on: { 'opening.phase': (_s, e) => when(e.to === 'dig'), 'action-started': (_s, e) => when(e.action === 'plant') },
  },
  { id: 'cx-raindrops', on: { cue: (_s, e) => when(e.cue === 'raindrop-hit') } },
  { id: 'cx-hot-surfaces', on: { 'env.heat-stupor': (sim, e) => when(isPlayerAntId(sim, e.antId)) } },
  { id: 'cx-dew', on: { 'weather.dew': (_s, e) => when(e.state === 'formed') } },
  { id: 'cx-frost', afterMilestone: 'ms-first-frost' },
  { id: 'cx-wind', on: { 'weather.gust': () => yes() } },
  { id: 'cx-paving-joints', on: { 'world.micro-discovered': (sim, e) => when(e.kind === 'paving-joint' && isPlayerAntId(sim, e.antId)) } },
  { id: 'cx-footfall', afterMilestone: 'ms-first-footfall' },
  { id: 'cx-jumping-spider', on: creatureSeen('jumping-spider') },
  { id: 'cx-wolf-spider', on: creatureSeen('wolf-spider') },
  { id: 'cx-antlion', on: { ...creatureSeen('antlion'), 'antlion-flick': () => yes(), 'antlion-grab': () => yes() } },
  { id: 'cx-ant-spiders', on: creatureSeen('ant-spider') },
  { id: 'cx-phorid-flies', on: { 'phorid-strike': () => yes(), ...creatureSeen('phorid-fly') } },
  { id: 'cx-formica', on: rivalSeen('formica-') },
  { id: 'cx-pavement-wars', on: rivalSeen('tetramorium-') },
  { id: 'cx-fungal-threads', on: { 'ant-died': (sim, e) => when(e.cause === 'disease' && isPlayerColonyId(sim, e.colonyId)) } },
  // First `setDirectives` or `placeMarker`: neither emits an event, so a marker of the colony or a change of the
  // player-set directives (against the values seen at the first check) unlocks it.
  {
    id: 'cx-interface-orders',
    on: { 'marker-response': () => yes() },
    poll: (sim) => {
      const col = playerColony(sim);
      return when(!!col && (sim.stores.markers.list.some((m) => m.alive && m.colony === col.id) || directivesChanged(sim)));
    },
  },
  { id: 'cx-antennation', on: { 'action-completed': (sim, e) => when(e.action === 'antennate' && isPlayerAntId(sim, e.antId)) } },
  { id: 'cx-nursing', on: { feed: (sim, e) => when(e.broodId >= 0 && isPlayerAntId(sim, e.giverId)) } },
  { id: 'cx-springtail', on: creatureSeen('springtail') },
  { id: 'cx-interface-why', poll: () => yes() },
  { id: 'cx-interface-markers', poll: () => yes() },
  { id: 'cx-interface-time', poll: () => yes() },
];

/** `cx-species-<id>`: the played species at game start. */
const SPECIES_RULES: TriggerRule<CodexId>[] = SPECIES_IDS.map((sp) => ({
  id: `cx-species-${sp}` as CodexId, poll: (sim: Sim) => when(sim.state.config.species === sp),
}));

/** Material under the possessed ant's feet, computed once per tick for all material rules (null: none). */
const groundCache = new WeakMap<Sim, { tick: number; material: string | null }>();
function possessedGround(sim: Sim): string | null {
  const hit = groundCache.get(sim);
  if (hit && hit.tick === sim.state.tick) return hit.material;
  const a = possessedAnt(sim);
  let material: string | null = null;
  if (a && a.medium !== 'air') {
    const d = a.footOffset * 2;
    material = sim.field.materialAt({ x: a.pos.x - a.up.x * d, y: a.pos.y - a.up.y * d, z: a.pos.z - a.up.z * d });
  }
  groundCache.set(sim, { tick: sim.state.tick, material });
  return material;
}

/** `cx-material-<id>`: the first dig in it, or the possessed ant standing on it. */
const MATERIAL_RULES: TriggerRule<CodexId>[] = MATERIALS.map((m) => ({
  id: `cx-material-${m}` as CodexId,
  on: { 'pellet-created': (sim: Sim, e) => when(e.material === m && isPlayerAntId(sim, e.antId)) },
  poll: (sim: Sim) => when(possessedGround(sim) === m),
}));

/** `cx-habitat-<zone>`: a first entry of the colony into the zone, or the possessed ant / the nest in it. */
const HABITAT_RULES: TriggerRule<CodexId>[] = ZONE_TYPES.map((z) => ({
  id: `cx-habitat-${z}` as CodexId,
  on: { 'world.zone-first-entry': (sim: Sim, e) => when(e.zoneType === z && isPlayerAntId(sim, e.antId)) },
  poll: (sim: Sim) => {
    const a = possessedAnt(sim);
    if (a && a.nestId < 0 && zoneAt(sim.world, a.pos.x, a.pos.z) === z) return yes();
    const n = playerNests(sim)[0];
    return when(!!n && zoneAt(sim.world, n.origin.x, n.origin.z) === z);
  },
}));

export const CODEX_RULES: readonly TriggerRule<CodexId>[] = [...FIXED, ...SPECIES_RULES, ...MATERIAL_RULES, ...HABITAT_RULES];
