// Rival-only species (ruling 5; GDD 05 §3.1 roster). The temperate-eu rows are copied from the GDD table; the T3
// rows are the GDD's abbreviated notes plus estimates marked [E] (mass from length, hp/bite from the GDD 05 §4.1
// formulas, abstract-model numbers like comparable species), for the rivals task to refine.
// Cruise speed is not given by the GDD: 6 body lengths per second for every species [E].

import type { RivalSpeciesDef } from '@/sim/types';

const LENGTHS_PER_S = 6;
const RETREAT = 0.35; // GDD 05 RETREAT_HEALTH outside the nest

function def(d: Omit<RivalSpeciesDef, 'cruiseMmS' | 'retreatHealth'> & { retreatHealth?: number }): RivalSpeciesDef {
  return { ...d, cruiseMmS: LENGTHS_PER_S * d.workerMm, retreatHealth: d.retreatHealth ?? RETREAT };
}

export const RIVAL_SPECIES: readonly RivalSpeciesDef[] = [
  def({
    id: 'tetramorium-immigrans', binomial: 'Tetramorium immigrans', commonName: 'Pavement ant',
    regions: ['temperate-eu', 'ne-america'], zones: ['pavement', 'asphalt', 'garden-bed', 'sand'],
    workerMm: 3.2, workerMassMg: 0.6, maxHp: 7, bite: 0.7, armour: 0.15, special: 'sting', specialPower: 1.4,
    cp: 0.8, aggression: 0.75, n0: 600, kMax: 1800, growthPerGd: 0.3, fieldShare: 0.05, fieldCap: { normal: 60, war: 250 },
    activityC: [12, 38], nocturnal: false, queens: 1, queenHp: 30, queenBite: 1.0, profile: 'mass-grappler',
    nestTemplate: 'pavement-joint', bodyColour: '#3a2a1e', gasterColour: '#2a1e16', tier: 'T2',
  }),
  def({
    id: 'myrmica-rubra', binomial: 'Myrmica rubra', commonName: 'European fire ant',
    regions: ['temperate-eu'], zones: ['garden-bed', 'lawn', 'forest'],
    workerMm: 4.5, workerMassMg: 1.2, maxHp: 11, bite: 1.1, armour: 0.1, special: 'sting', specialPower: 3.2,
    cp: 1.4, aggression: 0.85, n0: 300, kMax: 1000, growthPerGd: 0.25, fieldShare: 0.05, fieldCap: { normal: 40, war: 150 },
    activityC: [8, 30], nocturnal: false, queens: 3, queenHp: 25, queenBite: 1.0, retreatHealth: 0.2,
    profile: 'aggressive-stinger', nestTemplate: 'under-stone', bodyColour: '#8a3a1e', gasterColour: '#7a3018', tier: 'T2',
  }),
  def({
    id: 'formica-rufa', binomial: 'Formica rufa', commonName: 'Red wood ant',
    regions: ['temperate-eu'], zones: ['forest'],
    workerMm: 7, workerMassMg: 6, maxHp: 33, bite: 3.3, armour: 0, special: 'spray-acid', specialPower: 1.5,
    cp: 6.0, aggression: 0.95, n0: 250, kMax: 400, growthPerGd: 0.12, fieldShare: 0.08, fieldCap: { normal: 60, war: 200 },
    activityC: [10, 32], nocturnal: false, queens: 1, queenHp: 61, queenBite: 2.0, profile: 'predatory-raider',
    nestTemplate: 'thatch-mound', bodyColour: '#9a3f22', gasterColour: '#241a14', tier: 'T2',
  }),
  def({
    id: 'solenopsis-fugax', binomial: 'Solenopsis fugax', commonName: 'Thief ant',
    regions: ['temperate-eu'], zones: ['lawn', 'garden-bed'],
    workerMm: 1.8, workerMassMg: 0.1, maxHp: 2, bite: 0.2, armour: 0, special: 'sting', specialPower: 1.0,
    cp: 0.15, aggression: 0.4, n0: 400, kMax: 1500, growthPerGd: 0.3, fieldShare: 0.01, fieldCap: { normal: 10, war: 30 },
    activityC: [12, 32], nocturnal: true, queens: 1, queenHp: 25, queenBite: 0.5, profile: 'thief',
    nestTemplate: 'under-stone', bodyColour: '#c89a3a', gasterColour: '#b88a30', tier: 'T2',
  }),
  def({
    id: 'lasius-flavus', binomial: 'Lasius flavus', commonName: 'Yellow meadow ant',
    regions: ['temperate-eu'], zones: ['lawn'],
    workerMm: 3, workerMassMg: 0.6, maxHp: 7, bite: 0.6, armour: 0, special: 'spray-acid', specialPower: 0.5,
    cp: 0.6, aggression: 0.3, n0: 800, kMax: 2000, growthPerGd: 0.15, fieldShare: 0.005, fieldCap: { normal: 5, war: 40 },
    activityC: [8, 30], nocturnal: false, queens: 1, queenHp: 61, queenBite: 1.0, profile: 'subterranean',
    nestTemplate: 'turf-mound', bodyColour: '#c8a040', gasterColour: '#b89038', tier: 'T2',
  }),
  // ---- T3 rosters (GDD 05 §3.1 abbreviated rows; [E] = estimate) ----
  def({
    id: 'formica-subsericea', binomial: 'Formica subsericea', commonName: 'Silky field ant',
    regions: ['ne-america'], zones: ['lawn', 'forest', 'garden-bed'],
    workerMm: 5.5, workerMassMg: 4, maxHp: 25, bite: 2.5, armour: 0, special: 'spray-acid', specialPower: 1.0,
    cp: 3, aggression: 0.8, n0: 300 /* [E] */, kMax: 900 /* [E] */, growthPerGd: 0.15 /* [E] */, fieldShare: 0.06,
    fieldCap: { normal: 50, war: 180 }, activityC: [10, 34], nocturnal: false, queens: 1, queenHp: 50, queenBite: 2.0,
    profile: 'generalist', nestTemplate: 'soil-galleries', bodyColour: '#2e2e30', gasterColour: '#3a3a3e', tier: 'T3',
  }),
  def({
    id: 'tapinoma-sessile', binomial: 'Tapinoma sessile', commonName: 'Odorous house ant',
    regions: ['ne-america'], zones: ['garden-bed', 'interior', 'lawn'],
    workerMm: 2.5, workerMassMg: 0.3, maxHp: 4.5, bite: 0.45, armour: 0, special: 'spray-acid', specialPower: 0.8,
    cp: 0.4, aggression: 0.3, n0: 500 /* [E] */, kMax: 2000 /* [E] */, growthPerGd: 0.3 /* [E] */, fieldShare: 0.03,
    fieldCap: { normal: 40, war: 120 }, activityC: [10, 35], nocturnal: false, queens: 4 /* [E] polygynous */,
    queenHp: 20, queenBite: 0.5, profile: 'repellent', nestTemplate: 'under-stone',
    bodyColour: '#3b2a20', gasterColour: '#2e221a', tier: 'T3',
  }),
  def({
    id: 'linepithema-humile', binomial: 'Linepithema humile', commonName: 'Argentine ant',
    regions: ['mediterranean', 'southern-us'], zones: ['garden-bed', 'pavement', 'interior', 'lawn'],
    workerMm: 2.4, workerMassMg: 0.25, maxHp: 4, bite: 0.4, armour: 0, special: 'spray-acid', specialPower: 0.8,
    cp: 0.5, aggression: 0.9, n0: 800 /* [E] */, kMax: 3000, growthPerGd: 0.35 /* [E] */, fieldShare: 0.05,
    fieldCap: { normal: 80, war: 300 }, activityC: [10, 35], nocturnal: false, queens: 8 /* [E] polygynous */,
    queenHp: 15, queenBite: 0.5, profile: 'supercolony', nestTemplate: 'soil-galleries',
    bodyColour: '#8a6a48', gasterColour: '#6e5238', tier: 'T3',
  }),
  def({
    id: 'tapinoma-nigerrimum', binomial: 'Tapinoma nigerrimum', commonName: 'Black odorous ant',
    regions: ['mediterranean'], zones: ['garden-bed', 'sand', 'lawn'],
    workerMm: 3.5 /* [E] */, workerMassMg: 0.6 /* [E] */, maxHp: 7, bite: 0.7, armour: 0, special: 'spray-acid',
    specialPower: 0.8, cp: 0.6 /* [E] */, aggression: 0.6 /* [E] */, n0: 500, kMax: 2000, growthPerGd: 0.25,
    fieldShare: 0.04, fieldCap: { normal: 50, war: 150 }, activityC: [12, 38], nocturnal: false, queens: 4,
    queenHp: 25, queenBite: 0.7, profile: 'repellent', nestTemplate: 'soil-galleries',
    bodyColour: '#1c1a1a', gasterColour: '#161414', tier: 'T3',
  }),
  def({
    id: 'pheidole-pallidula', binomial: 'Pheidole pallidula', commonName: 'Big-headed ant',
    regions: ['mediterranean'], zones: ['pavement', 'garden-bed', 'sand'],
    workerMm: 2.2 /* [E] minor */, workerMassMg: 0.2, maxHp: 3.4, bite: 0.35, armour: 0, special: null, specialPower: 0,
    cp: 0.5 /* [E] incl. majors */, aggression: 0.6 /* [E] */, n0: 600, kMax: 2500, growthPerGd: 0.3,
    fieldShare: 0.04, fieldCap: { normal: 60, war: 200 }, activityC: [14, 38], nocturnal: false, queens: 1,
    queenHp: 20, queenBite: 0.6, profile: 'dimorphic', nestTemplate: 'pavement-joint',
    bodyColour: '#a8784a', gasterColour: '#8a6038', tier: 'T3',
  }),
  def({
    id: 'solenopsis-invicta', binomial: 'Solenopsis invicta', commonName: 'Red imported fire ant',
    regions: ['southern-us'], zones: ['lawn', 'garden-bed', 'sand'],
    workerMm: 4 /* [E] mean of 2-6 mm */, workerMassMg: 1.0 /* [E] */, maxHp: 10, bite: 1.0, armour: 0, special: 'sting',
    specialPower: 2.8, cp: 1.5, aggression: 0.95, n0: 600 /* [E] */, kMax: 2500 /* [E] */, growthPerGd: 0.3 /* [E] */,
    fieldShare: 0.06, fieldCap: { normal: 80, war: 300 }, activityC: [15, 38], nocturnal: false, queens: 1,
    queenHp: 35, queenBite: 1.0, profile: 'aggressive-stinger', nestTemplate: 'soil-galleries',
    bodyColour: '#8a3a20', gasterColour: '#3a2018', tier: 'T3',
  }),
  def({
    id: 'solenopsis-molesta', binomial: 'Solenopsis molesta', commonName: 'Thief ant',
    regions: ['southern-us', 'ne-america'], zones: ['lawn', 'garden-bed', 'interior'],
    workerMm: 1.5, workerMassMg: 0.08 /* [E] */, maxHp: 2, bite: 0.2, armour: 0, special: 'sting', specialPower: 1.0,
    cp: 0.15, aggression: 0.4, n0: 400, kMax: 1500, growthPerGd: 0.3, fieldShare: 0.01, fieldCap: { normal: 10, war: 30 },
    activityC: [12, 34], nocturnal: true, queens: 2, queenHp: 20, queenBite: 0.4, profile: 'thief',
    nestTemplate: 'under-stone', bodyColour: '#c8a050', gasterColour: '#b89040', tier: 'T3',
  }),
];
