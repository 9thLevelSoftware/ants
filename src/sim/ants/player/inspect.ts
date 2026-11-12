// Inspect read-outs (GDD 01 §10) as plain data: a header, a "senses" block (what an ant perceives) and a
// "colony" block (game abstraction) for every target kind. Words and numbers; the UI decides what to show.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Brood, Chamber, Creature, FoodSource, Item, Sim, TargetRef } from '@/sim/types';
import { AntFlag, REASON_CODES } from '@/sim/types';
import { ageBandOf } from '@/sim/entities';
import { digPower } from '../actions/defs';
import { findEntrance } from '../actions/geometry';
import { ports } from '../actions/ports';
import { isLiquidSource } from '../actions/sourceKinds';

export type InspectKind = 'ground' | 'food' | 'ant' | 'foreign-ant' | 'brood' | 'creature' | 'chamber' | 'entrance';

/** One read-out line: a stable key, a word, and the number behind it (null when there is none). */
export interface InspectRow {
  key: string;
  word: string;
  value: number | null;
  unit: string;
}

export interface InspectCard {
  kind: InspectKind;
  /** What it is ("larva", "soil", "nestmate" ...). */
  title: string;
  senses: InspectRow[];
  colony: InspectRow[];
}

const row = (key: string, word: string, value: number | null = null, unit = ''): InspectRow => ({ key, word, value, unit });

function band(v: number, words: readonly string[], cuts: readonly number[]): string {
  for (let i = 0; i < cuts.length; i++) if (v < cuts[i]) return words[i];
  return words[words.length - 1];
}

const AGE_WORD = { callow: 'callow', young: 'young', mid: 'mature', old: 'old' } as const;

function scentRows(sim: Sim, colony: number, p: Vec3): InspectRow[] {
  let foreignTrail = 0;
  for (const c of sim.stores.colonies.list) if (c.alive && c.id !== colony) foreignTrail = Math.max(foreignTrail, ports.sample(sim, c.id, 'trail', p));
  const trail = ports.sample(sim, colony, 'trail', p);
  const home = ports.sample(sim, colony, 'home', p);
  const alarm = ports.sample(sim, colony, 'alarm', p);
  return [
    row('trail', trail > 0.3 ? 'ours' : foreignTrail > 0.3 ? 'foreign' : 'none', Math.max(trail, foreignTrail), 'ph'),
    row('home', home > 0.1 ? 'ours' : 'none', home, 'ph'),
    row('alarm', alarm > 0.5 ? 'alarm' : 'calm', alarm, 'ph'),
  ];
}

function moistureAt(sim: Sim, p: Vec3): number | null {
  const m = sim.state.env.moisture;
  if (!m || m.nx === 0) return null;
  const ix = Math.floor(p.x / m.cell), iz = Math.floor(p.z / m.cell);
  if (ix < 0 || iz < 0 || ix >= m.nx || iz >= m.nz) return null;
  return m.theta0[iz * m.nx + ix] / 255;
}

function groundCard(sim: Sim, viewer: Ant | null, p: Vec3): InspectCard {
  const material = sim.field.materialAt(p);
  const species = viewer ? (sim.getSpecies(sim.stores.colonies.get(viewer.colony)?.species ?? sim.species.id)?.id ?? sim.species.id) : sim.species.id;
  const speed = sim.field.diggability(p, species) * (viewer ? Math.max(digPower(viewer), 0) || 1 : 1);
  const moist = moistureAt(sim, p);
  const deep = { x: p.x, y: p.y - 10 * sim.world.bu, z: p.z };
  const senses = [
    row('material', material),
    row('diggability', speed <= 0 ? 'cannot be dug' : band(speed, ['very hard', 'hard', 'normal', 'easy'], [0.3, 0.7, 1.2]), speed > 0 ? 1 / speed : null, 'x bite time'),
    row('moisture', moist === null ? 'unknown' : band(moist, ['dry', 'damp', 'wet', 'waterlogged'], [0.25, 0.5, 0.8]), moist === null ? null : moist * 100, '%'),
    row('temperature', 'surface', ports.surfaceTemp(sim, p), '°C'),
    row('temperature-deep', '10 BU down', ports.soilTemp(sim, deep), '°C'),
    ...scentRows(sim, viewer?.colony ?? sim.state.player.colonyId, p),
  ];
  return { kind: 'ground', title: 'ground', senses, colony: [] };
}

function taste(c: number, p: number): string {
  return c > 2 * p ? 'sweet' : p > 2 * c ? 'protein-rich' : 'mixed';
}

function carryWord(bulk: number, cap: number): InspectRow {
  if (bulk <= cap) return row('carry', 'one ant', 1);
  const n = Math.ceil(bulk / Math.max(cap, 1e-6));
  return n > 12 ? row('carry', 'too large: tear pieces', n) : row('carry', `needs about ${n}`, n);
}

function antsUsing(sim: Sim, colony: number, t: TargetRef): number {
  let n = 0;
  for (const a of sim.stores.ants.list) if (a.alive && a.colony === colony && a.action?.target.kind === t.kind && a.action.target.id === t.id) n++;
  return n;
}

function rivalsNear(sim: Sim, colony: number, p: Vec3): number {
  const ids: number[] = [];
  sim.index.queryAnts(p, 5 * sim.world.bu, ids);
  return ids.filter((id) => { const a = sim.stores.ants.get(id); return a !== undefined && a.colony !== colony; }).length;
}

function foodCard(sim: Sim, viewer: Ant | null, t: TargetRef, s: FoodSource | null, it: Item | null): InspectCard {
  const colony = viewer?.colony ?? sim.state.player.colonyId;
  const cap = viewer?.carryCap ?? 1;
  const c = s ? s.c : it ? it.c : 0;
  const p = s ? s.p : it ? it.p : 0;
  const amount = s ? (isLiquidSource(sim, s) && s.pool >= 0 ? s.pool : s.units * (s.c + s.p)) : c + p;
  const decay = it ? it.decay : 0;
  const kind = s ? s.kind : it?.foodKind ?? it?.kind ?? 'food';
  const pos = s ? s.pos : it ? it.pos : t.pos;
  const slot = sim.stores.colonies.get(colony)?.rival?.territorySlot ?? 0;
  const senses = [
    row('kind', kind),
    row('taste', taste(c, p)),
    row('amount', 'left', amount, 'loads'),
    row('state', band(decay, ['fresh', 'drying', 'rotting'], [0.3, 0.7]), decay),
    s ? carryWord(s.unitBulk, cap) : carryWord(it?.bulk ?? 0, cap),
  ];
  const known = s ? (s.discoveredBy & (1 << slot)) !== 0 : true;
  const col = [
    row('users', 'ours using it', antsUsing(sim, colony, t)),
    row('rivals', 'rival ants present', rivalsNear(sim, colony, pos)),
    row('known', known ? 'yes' : 'no', known ? 1 : 0),
  ];
  return { kind: 'food', title: kind, senses, colony: col };
}

function carryingWord(sim: Sim, a: Ant): string {
  if (a.carry.kind === 'brood') return sim.stores.brood.get(a.carry.id)?.stage ?? 'brood';
  if (a.carry.kind === 'item') return sim.stores.items.get(a.carry.id)?.kind ?? 'item';
  return 'nothing';
}

function antCard(sim: Sim, viewer: Ant | null, a: Ant): InspectCard {
  const ours = viewer ? viewer.colony === a.colony : a.colony === sim.state.player.colonyId;
  if (!ours) {
    const species = sim.stores.colonies.get(a.colony)?.species ?? 'unknown';
    const rel = viewer ? a.lengthBu / Math.max(viewer.lengthBu, 1e-6) : a.lengthBu;
    const doing = a.combat ? 'fighting' : a.carry.kind !== 'none' ? 'carrying' : a.task === 'forage' ? 'foraging' : 'walking';
    const idx = sim.stores.colonies.list.findIndex((c) => c.id === a.colony);
    return {
      kind: 'foreign-ant', title: 'stranger',
      senses: [row('species', species), row('size', 'relative to us', rel, 'x L'), row('behaviour', doing)],
      colony: [row('colony', `Neighbouring colony ${idx}`, a.colony), row('hostility', 'unknown')],
    };
  }
  const age = ageBandOf(a.physioAgeGd);
  const health = a.maxHp > 0 ? a.hp / a.maxHp : 0;
  const last = [...a.mem.decisions].filter((d) => d.tick >= 0).sort((x, y) => y.tick - x.tick)[0];
  const col = [
    row('task', a.task), row('state', a.state), row('target', a.target.kind, a.target.id),
    row('reason', last ? (REASON_CODES[last.code] ?? 'unknown') : 'none', last ? last.detail : null),
    row('possessed', (a.flags & AntFlag.POSSESSED) !== 0 ? 'yes' : 'no'),
  ];
  if (a.caste === 'queen') col.push(row('colony-orders', 'Colony orders'));
  return {
    kind: 'ant', title: a.caste === 'queen' ? 'queen' : 'nestmate',
    senses: [
      row('odour', 'nestmate'), row('caste', a.caste), row('age', AGE_WORD[age], a.physioAgeGd, 'game days'),
      row('health', band(health, ['dying', 'injured', 'hurt', 'healthy'], [0.15, 0.4, 0.8]), health * 100, '%'),
      row('crop-c', 'carbohydrate', a.cropC, 'loads'), row('crop-p', 'protein', a.cropP, 'loads'),
      row('carrying', carryingWord(sim, a)),
    ],
    colony: col,
  };
}

function broodCard(sim: Sim, b: Brood): InspectCard {
  const def = sim.getSpecies(sim.stores.colonies.get(b.colony)?.species ?? sim.species.id) ?? sim.species;
  const climate = def.nestTemplate.broodClimate.find((c) => c.stage === b.stage);
  const temp = b.chamberId >= 0 ? ports.chamberTemp(sim, b.chamberId) : ports.surfaceTemp(sim, b.pos);
  const rh = ports.relHumidity(sim, b.pos);
  return {
    kind: 'brood', title: b.stage,
    senses: [
      row('stage', b.stage),
      row('hunger', band(b.hunger, ['fed', 'hungry', 'starving'], [0.3, 0.7]), b.hunger),
      row('temperature', climate ? (temp < climate.tOpt[0] ? 'too cool' : temp > climate.tOpt[1] ? 'too warm' : 'comfortable') : 'unknown', temp, '°C'),
      row('humidity', climate ? (rh < climate.rh[0] ? 'too dry' : rh > climate.rh[1] ? 'too damp' : 'comfortable') : 'unknown', rh * 100, '%'),
    ],
    colony: [row('progress', 'of stage', b.progress * 100, '%'), row('eta', 'unknown'), row('destined', b.destined)],
  };
}

const DANGER: Partial<Record<Creature['kind'], string>> = {
  'jumping-spider': 'dangerous to a lone ant', 'wolf-spider': 'dangerous to a lone ant', 'ant-spider': 'dangerous to a lone ant',
  antlion: 'dangerous to a lone ant', centipede: 'dangerous to many', bird: 'dangerous to many', 'rove-beetle': 'dangerous to a lone ant',
};

function creatureCard(sim: Sim, viewer: Ant | null, c: Creature): InspectCard {
  const l = viewer ? viewer.lengthBu * sim.world.bu : sim.world.bu;
  return {
    kind: 'creature', title: c.kind,
    senses: [row('kind', c.kind), row('activity', c.state), row('size', 'relative to us', (2 * c.radius) / l, 'x L'), row('danger', DANGER[c.kind] ?? 'harmless')],
    colony: [],
  };
}

function chamberCard(sim: Sim, ch: Chamber, entrances: number): InspectCard {
  const crowd = ch.capacity.adults > 0 ? ch.occupancy.adults / ch.capacity.adults : 0;
  return {
    kind: 'chamber', title: `${ch.type} chamber`,
    senses: [
      row('temperature', 'air', ch.temp, '°C'), row('humidity', 'air', ch.humidity * 100, '%'), row('depth', 'below ground', ch.depthBu, 'BU'),
      row('crowding', crowd > 1 ? 'crowded' : 'roomy', crowd),
    ],
    colony: [
      row('type', ch.type), row('volume', 'open', ch.volume, 'BU³'),
      row('adults', 'occupancy / capacity', ch.occupancy.adults, `/ ${ch.capacity.adults}`),
      row('brood', 'occupancy / capacity', ch.occupancy.brood, `/ ${ch.capacity.brood}`),
      row('food', 'occupancy / capacity', ch.occupancy.food, `/ ${ch.capacity.food}`),
      row('entrances', 'connections', entrances), row('flood-risk', band(ch.floodRisk, ['low', 'some', 'high'], [0.2, 0.6]), ch.floodRisk),
    ],
  };
}

function findChamber(sim: Sim, id: number): { chamber: Chamber; entrances: number } | null {
  for (const n of sim.stores.nests.list) {
    if (!n.alive) continue;
    const ch = n.chambers.find((c) => c.id === id);
    if (ch) return { chamber: ch, entrances: n.entrances.length };
  }
  return null;
}

/** Inspect card for any target (viewer: the possessed / selected ant, null in observer view); null if gone. */
export function inspectTarget(sim: Sim, viewer: Ant | null, t: TargetRef): InspectCard | null {
  switch (t.kind) {
    case 'surface': case 'point': return groundCard(sim, viewer, t.pos);
    case 'none': return viewer ? antCard(sim, viewer, viewer) : null;
    case 'source': { const s = sim.stores.sources.get(t.id); return s ? foodCard(sim, viewer, t, s, null) : null; }
    case 'item': { const it = sim.stores.items.get(t.id); return it ? foodCard(sim, viewer, t, null, it) : null; }
    case 'ant': { const a = sim.stores.ants.get(t.id); return a ? antCard(sim, viewer, a) : null; }
    case 'brood': { const b = sim.stores.brood.get(t.id); return b ? broodCard(sim, b) : null; }
    case 'creature': { const c = sim.stores.creatures.get(t.id); return c ? creatureCard(sim, viewer, c) : null; }
    case 'chamber': { const f = findChamber(sim, t.id); return f ? chamberCard(sim, f.chamber, f.entrances) : null; }
    case 'entrance': {
      const f = findEntrance(sim, t.id);
      if (!f) return null;
      const e = f.entrance;
      return {
        kind: 'entrance', title: 'entrance',
        senses: [row('status', e.status === 'open' ? 'open' : e.status === 'sealed' ? 'sealed' : 'plugged'), row('traffic', 'per game hour', e.trafficIn + e.trafficOut)],
        colony: [row('mound', e.moundId >= 0 ? 'mound' : 'none', e.moundId), row('chambers', 'linked', f.nest.chambers.length)],
      };
    }
    default: return null;
  }
}
