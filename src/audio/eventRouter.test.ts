// The event router (eventRouter.ts) against a real small simulation and a recording sink: every event the audio maps
// to a sound reaches the sink, the rules around sim cues hold (bite hardness and whiffs, one sound per dig bite,
// the alarm setting), and the rain onset, gusts and flood rate limits behave.
import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing/testWorld';
import { spawnCreature, spawnItem } from '@/sim/entities';
import type { Sim, SimEvent } from '@/sim/types';
import { EVENT_DISPOSITION } from './eventMap';
import { EventRouter, type AudioSink, type CueExtra } from './eventRouter';

interface Call { kind: string; id: string; pos?: { x: number; y: number; z: number } | null; strength?: number; extra?: CueExtra }

function recorder(surfaceDb = 0) {
  const calls: Call[] = [];
  const sink: AudioSink = {
    cue: (cue, pos, strength, _m, extra) => { calls.push({ kind: 'cue', id: cue, pos, strength, extra }); },
    ui: (id) => { calls.push({ kind: 'ui', id }); },
    giantTelegraph: (i, kind) => { calls.push({ kind: 'giant', id: `telegraph:${kind}` }); },
    giantStart: (i, kind) => { calls.push({ kind: 'giant', id: `start:${kind}` }); },
    giantImpact: (i, kind, _fp, contact) => { calls.push({ kind: 'giant', id: `impact:${kind}:${contact}` }); },
    giantEnd: () => { calls.push({ kind: 'giant', id: 'end' }); },
    thunder: (d, i) => { calls.push({ kind: 'thunder', id: 'thunder', strength: i, extra: { delayS: d } }); },
    musicTrigger: (k) => { calls.push({ kind: 'music', id: k }); },
    surfaceDb: () => surfaceDb,
  };
  return { calls, sink };
}

const sim = makeTestSim({ nest: 'small', workers: 12 });
const worker = sim.state.ants.find((a) => a.alive && a.caste === 'worker')!;
const queen = sim.state.ants.find((a) => a.alive && a.caste === 'queen') ?? worker;
const nest = sim.state.nests[0];
const chamber = nest.chambers[0];
const entrance = nest.entrances[0];
const P = { ...worker.pos };
// bodies the fixtures refer to (an event about a body that is not in the sim is not played: it has no place)
const pellet = spawnItem(sim, { kind: 'soil-pellet', pos: { ...P, x: P.x + 3 } });
const deadCreature = spawnCreature(sim, { kind: 'ladybird', pos: { ...P, x: P.x + 9 }, radiusMm: 3, maxHp: 10, init: {} });

function creature(kind: 'ladybird' | 'wolf-spider' | 'aphid') {
  return spawnCreature(sim, { kind, pos: { ...P, x: P.x + 8 }, radiusMm: 3, maxHp: 10, init: {} });
}

const T = 100;
const run = (events: SimEvent[], router?: EventRouter, tick = T) => {
  const r = recorder();
  const rt = router ?? new EventRouter(r.sink);
  for (const e of events) rt.handle(sim, e, tick);
  return r.calls;
};

/** One representative event per router-handled sound type (system-handled ones are tested through AudioSystem). */
const SYSTEM_HANDLED = new Set(['alert', 'milestone.reached', 'stage.changed', 'lineage.daughter-added', 'opening.handover']);
const FIXTURES: Record<string, () => SimEvent> = {
  'cue': () => ({ type: 'cue', cue: 'dig-bite.loam', pos: P, strength: 1 }),
  'opening.timelapse': () => ({ type: 'opening.timelapse', kind: 'start', p: 0, spanGd: 1, hazard: null }),
  'overwinter.begin': () => ({ type: 'overwinter.begin' }),
  'overwinter.end': () => ({ type: 'overwinter.end' }),
  'aim.completed': () => ({ type: 'aim.completed', id: 'aim-x' as never }),
  'codex.unlocked': () => ({ type: 'codex.unlocked', id: 'cx-x' }),
  'time.phase': () => ({ type: 'time.phase', phase: 'dawn' }),
  'human.telegraph': () => ({ type: 'human.telegraph', instId: 1, kind: 'footsteps', cue: 'tremor', origin: P, radiusMm: 500, intensity: 1, impactTick: T + 30 }),
  'human.start': () => ({ type: 'human.start', instId: 1, kind: 'mowing', variant: 'motor', region: 0 }),
  'human.impact': () => ({ type: 'human.impact', instId: 1, kind: 'footsteps', contact: 'adult-shoe', footprint: P, radiusMm: 100 }),
  'human.end': () => ({ type: 'human.end', instId: 1, kind: 'mowing', variant: 'motor', region: 0 }),
  'human.cancelled': () => ({ type: 'human.cancelled', instId: 1, kind: 'mowing' }),
  'human.bait-placed': () => ({ type: 'human.bait-placed', id: 1, pos: P }),
  'human.bait-removed': () => ({ type: 'human.bait-removed', id: 1, pos: P }),
  'weather.thunder': () => ({ type: 'weather.thunder', delayS: 2, intensity: 0.8 }),
  'weather.gust': () => ({ type: 'weather.gust', windMs: 8 }),
  'weather.changed': () => ({ type: 'weather.changed', from: 'clear', to: 'rain', intensityClass: 'shower', reason: 'transition' }),
  'weather.puddle': () => ({ type: 'weather.puddle', cellsAdded: 3, cellsRemoved: 0 }),
  'predator-telegraph': () => ({ type: 'predator-telegraph', creatureId: -1, targetId: worker.id, strikeAtTick: T + 5, aimPoint: P, kind: 'wolf-spider' }),
  'predator-strike': () => ({ type: 'predator-strike', creatureId: -1, targetId: worker.id, hit: true, damage: 3 }),
  'ant-seized': () => ({ type: 'ant-seized', antId: worker.id, by: -1 }),
  'antlion-grab': () => ({ type: 'antlion-grab', hazardId: 1, antId: worker.id }),
  'bird-approach': () => ({ type: 'bird-approach', variant: 'sparrow' as never, pos: P }),
  'bird-left': () => ({ type: 'bird-left', variant: 'sparrow' as never, pos: P, kills: 0 }),
  'creature-died': () => ({ type: 'creature-died', id: deadCreature.id, kind: 'ladybird', cause: 'combat' }),
  'phorid-strike': () => ({ type: 'phorid-strike', antId: worker.id, carrier: worker.id }),
  'combat-lock': () => ({ type: 'combat-lock', holderId: worker.id, targetId: -1 }),
  'combat-pin': () => ({ type: 'combat-pin', holderId: worker.id, targetId: -1 }),
  'combat-spray': () => ({ type: 'combat-spray', antId: worker.id, pos: P, dir: { x: 1, y: 0, z: 0 }, hitIds: [] }),
  'rival-encounter': () => ({ type: 'rival-encounter', a: 1, b: 2, pos: P, outcome: 'fight' }),
  'rival-discovered': () => ({ type: 'rival-discovered', colonyId: 2, by: 1, species: 'lasius-niger' as never, pos: P }),
  'rival-raid-started': () => ({ type: 'rival-raid-started', attacker: 2, target: nest.colony, partySize: 5 }),
  'brood-raided': () => ({ type: 'brood-raided', from: nest.colony, to: 2, count: 2, stage: 'larva' }),
  'flood-started': () => ({ type: 'flood-started', nestId: nest.id, water: 1, level: 0.1, chambers: [chamber.id] }),
  'flood-level': () => ({ type: 'flood-level', nestId: nest.id, water: 1, level: 0.2, chambers: [chamber.id] }),
  'ant-submerged': () => ({ type: 'ant-submerged', id: worker.id, pos: P }),
  'world.cave-in': () => ({ type: 'world.cave-in', center: P, radiusBu: 3, cause: 'rain' }),
  'founding-sealed': () => ({ type: 'founding-sealed', nestId: nest.id, entranceId: entrance.id }),
  'egg-laid': () => ({ type: 'egg-laid', broodId: 1, queenId: queen.id, destined: 'worker' as never }),
  'queen.egg-eaten': () => ({ type: 'queen.egg-eaten', queenId: queen.id }),
  'pellet-expelled': () => ({ type: 'pellet-expelled', antId: worker.id, itemId: 1, volume: 1, material: 'loam' as never, pos: P, moundId: 1 }),
  'pellet-dumped': () => ({ type: 'pellet-dumped', itemId: pellet.id, into: 'midden' as never }),
  'waste-dumped': () => ({ type: 'waste-dumped', antId: worker.id, itemId: 1, to: 'midden' }),
  'corpse-removed': () => ({ type: 'corpse-removed', antId: worker.id, itemId: 1, to: 'midden' }),
  'frass-ejected': () => ({ type: 'frass-ejected', siteId: 1, pos: P }),
  'drum': () => ({ type: 'drum', antId: worker.id, pos: P, wood: true }),
  'seed-milled': () => ({ type: 'seed-milled', antId: worker.id, loads: 1, pasteOut: 0 }),
  'radicle-gnawed': () => ({ type: 'radicle-gnawed', antId: worker.id, loads: 1 }),
  'honeydew-relay': () => ({ type: 'honeydew-relay', fromAnt: worker.id, toAnt: queen.id, loads: 1 }),
  'flight.launched': () => ({ type: 'flight.launched', id: 1, nGynes: 3, nMales: 3, weather: 'clear' }),
};

describe('every router-handled sound event reaches the sink', () => {
  const soundTypes = Object.entries(EVENT_DISPOSITION).filter(([, d]) => d.mode === 'sound').map(([t]) => t).filter((t) => !SYSTEM_HANDLED.has(t));

  it('has a fixture for each sound event type (a new sound row without a fixture fails here)', () => {
    expect(soundTypes.filter((t) => !FIXTURES[t])).toEqual([]);
    expect(Object.keys(FIXTURES).filter((t) => !soundTypes.includes(t))).toEqual([]);
  });

  for (const type of soundTypes) {
    it(type, () => {
      const calls = run([FIXTURES[type]()]);
      expect(calls.length, `${type} produced nothing`).toBeGreaterThan(0);
    });
  }
});

describe('sim cues', () => {
  it('a dig bite emitted twice (the runner\'s plain cue and the material cue) sounds once', () => {
    const calls = run([
      { type: 'cue', cue: 'dig-bite.loam', pos: { ...P, x: P.x + 6 }, strength: 0.4 },
      { type: 'cue', cue: 'dig-bite', pos: P, strength: 1 },
    ]);
    expect(calls.filter((c) => c.id.startsWith('dig-bite')).map((c) => c.id)).toEqual(['dig-bite.loam']);
  });

  it('a plain dig bite pairs with the material cue before it however far apart they are, once', () => {
    const r = recorder();
    const rt = new EventRouter(r.sink);
    const far = { ...P, x: P.x + 40 * sim.world.bu };
    rt.handle(sim, { type: 'cue', cue: 'dig-bite.loam', pos: far, strength: 0.4 }, 30);
    rt.handle(sim, { type: 'cue', cue: 'dig-bite', pos: P, strength: 1 }, 30);
    rt.handle(sim, { type: 'cue', cue: 'dig-bite', pos: P, strength: 1 }, 30); // another ant's, with no material cue: sounds
    expect(r.calls.map((c) => c.id)).toEqual(['dig-bite.loam', 'dig-bite']);
  });

  it('a failed action forgets the material cue it was paired with', () => {
    const r = recorder();
    const rt = new EventRouter(r.sink);
    rt.handle(sim, { type: 'cue', cue: 'dig-bite.loam', pos: P, strength: 0.4 }, 31);
    rt.handle(sim, { type: 'action-failed', antId: worker.id, action: 'dig-bite', reason: 'blocked' }, 31);
    rt.handle(sim, { type: 'cue', cue: 'dig-bite', pos: { ...P, x: P.x + 20 * sim.world.bu }, strength: 1 }, 31);
    expect(r.calls.length).toBe(2);
  });

  it('bodies gone from the sim: a sound with no place is dropped, a creature seen by track() keeps its place', () => {
    const r = recorder();
    const rt = new EventRouter(r.sink);
    const gone = { type: 'creature-died', id: 987654, kind: 'ladybird', cause: 'combat' } as SimEvent;
    rt.handle(sim, gone, 40);
    expect(r.calls.length).toBe(0);
    const c = creature('ladybird');
    const dies = { type: 'creature-died', id: c.id, kind: 'ladybird', cause: 'combat' } as SimEvent;
    rt.track(sim);
    const where = { ...c.pos };
    c.alive = false; // flagged dead, then swept by the end of the tick
    sim.stores.creatures.sweep();
    rt.track(sim);
    rt.handle(sim, dies, 41);
    expect(r.calls.length).toBe(1);
    expect(r.calls[0].pos).toEqual(where);
  });

  it('a creature that died long ago is forgotten: a late death event is dropped, not placed at its last known spot', () => {
    const r = recorder();
    const rt = new EventRouter(r.sink);
    const c = creature('aphid');
    rt.track(sim);
    c.alive = false;
    sim.stores.creatures.sweep();
    rt.track(sim); rt.track(sim); rt.track(sim);
    rt.handle(sim, { type: 'creature-died', id: c.id, kind: 'aphid', cause: 'combat' } as SimEvent, 50);
    expect(r.calls.length).toBe(0);
  });

  it('two bites in different ticks, or far apart, both sound', () => {
    const r = recorder();
    const rt = new EventRouter(r.sink);
    rt.handle(sim, { type: 'cue', cue: 'dig-bite', pos: P, strength: 1 }, 10);
    rt.handle(sim, { type: 'cue', cue: 'dig-bite', pos: P, strength: 1 }, 11);
    rt.handle(sim, { type: 'cue', cue: 'dig-bite', pos: { ...P, x: P.x + 4 * sim.world.bu * 5 }, strength: 1 }, 11);
    expect(r.calls.length).toBe(3);
  });

  it('other doubled cues (a lay-egg cue and the egg-laid event of the same tick and place) sound once', () => {
    const calls = run([
      { type: 'cue', cue: 'lay-egg', pos: queen.pos, strength: 1 },
      { type: 'egg-laid', broodId: 1, queenId: queen.id, destined: 'worker' as never },
    ]);
    expect(calls.filter((c) => c.id === 'lay-egg').length).toBe(1);
  });

  it('bite on a ladybird (armour 0.6) is hard prey; on an aphid (armour 0) it is soft; the sim\'s strength 1 no longer decides', () => {
    const lady = creature('ladybird'), aphid = creature('aphid');
    const hard = run([
      { type: 'combat-hit', attackerId: worker.id, targetId: lady.id, dmg: 1, kind: 'bite' },
      { type: 'cue', cue: 'bite', pos: P, strength: 1 }, // legacy: every bite emitted strength 1
    ]);
    const soft = run([
      { type: 'combat-hit', attackerId: worker.id, targetId: aphid.id, dmg: 1, kind: 'bite' },
      { type: 'cue', cue: 'bite', pos: P, strength: 1 },
    ], undefined, T + 1);
    expect(hard.find((c) => c.id === 'bite')!.strength).toBeGreaterThan(0.5);
    expect(soft.find((c) => c.id === 'bite')!.strength).toBeLessThanOrEqual(0.5);
  });

  it('a bite cue with no combat-hit that tick and strength 0 is a quiet whiff', () => {
    const calls = run([{ type: 'cue', cue: 'bite', pos: P, strength: 0 }], undefined, T + 2);
    const b = calls.find((c) => c.id === 'bite')!;
    expect(b.strength).toBe(0);
    expect(b.extra?.gainDb).toBeLessThan(0);
  });

  it('a combat-hit of one tick does not decide the bite of a later tick', () => {
    const lady = creature('ladybird');
    const r = recorder();
    const rt = new EventRouter(r.sink);
    rt.handle(sim, { type: 'combat-hit', attackerId: worker.id, targetId: lady.id, dmg: 1, kind: 'bite' }, 50);
    rt.handle(sim, { type: 'cue', cue: 'bite', pos: P, strength: 0 }, 51);
    expect(r.calls.find((c) => c.id === 'bite')!.extra?.gainDb).toBeLessThan(0);
  });

  it('the alarm shimmer follows its setting', () => {
    const e: SimEvent = { type: 'cue', cue: 'alarm-burst', pos: P, strength: 1 };
    const on = recorder(), off = recorder();
    new EventRouter(on.sink, { alarmShimmer: () => true }).handle(sim, e, T);
    new EventRouter(off.sink, { alarmShimmer: () => false }).handle(sim, e, T);
    expect(on.calls.length).toBe(1);
    expect(off.calls.length).toBe(0);
  });
});

describe('creatures, weather and water', () => {
  it('a strike misses quieter than it hits; a predator telegraph taps at the predator', () => {
    const c = creature('wolf-spider');
    const hit = run([{ type: 'predator-strike', creatureId: c.id, targetId: worker.id, hit: true, damage: 3 }]);
    const miss = run([{ type: 'predator-strike', creatureId: c.id, targetId: worker.id, hit: false, damage: 0 }], undefined, T + 1);
    expect(hit[0].id).toBe('ev.strike');
    expect(hit[0].strength!).toBeGreaterThan(miss[0].strength!);
    expect(hit[0].pos).toEqual(c.pos);
    const tap = run([{ type: 'predator-telegraph', creatureId: c.id, targetId: worker.id, strikeAtTick: T, aimPoint: P, kind: 'wolf-spider' }], undefined, T + 2);
    expect(tap[0]).toMatchObject({ id: 'creature-step', pos: c.pos });
  });

  it('rain setting in gives a volley of first drops, scaled by class; rain to rain and clearing give none', () => {
    const shower = run([{ type: 'weather.changed', from: 'clear', to: 'rain', intensityClass: 'shower', reason: 'x' }]);
    const storm = run([{ type: 'weather.changed', from: 'overcast', to: 'storm', intensityClass: null, reason: 'x' }], undefined, T + 1);
    expect(shower.filter((c) => c.id === 'raindrop-hit').length).toBe(6);
    expect(storm[0].strength!).toBeGreaterThan(shower[0].strength!);
    expect(shower.map((c) => c.extra?.delayS!)).toEqual([...shower.map((c) => c.extra?.delayS!)].sort((a, b) => a - b));
    expect(run([{ type: 'weather.changed', from: 'rain', to: 'storm', intensityClass: null, reason: 'x' }], undefined, T + 2)).toEqual([]);
    expect(run([{ type: 'weather.changed', from: 'rain', to: 'clear', intensityClass: null, reason: 'x' }], undefined, T + 3)).toEqual([]);
  });

  it('gusts scale with wind and are damped underground', () => {
    const calm = recorder(), deep = recorder(-18);
    new EventRouter(calm.sink).handle(sim, { type: 'weather.gust', windMs: 4 }, T);
    new EventRouter(calm.sink).handle(sim, { type: 'weather.gust', windMs: 14 }, T + 1);
    new EventRouter(deep.sink).handle(sim, { type: 'weather.gust', windMs: 14 }, T);
    expect(calm.calls[1].strength!).toBeGreaterThan(calm.calls[0].strength!);
    expect(deep.calls[0].extra?.gainDb).toBe(-18);
  });

  it('flood level changes trickle at most once per 3 s per nest; the start gurgles at the chamber', () => {
    const r = recorder();
    const rt = new EventRouter(r.sink);
    const lvl = (t: number) => rt.handle(sim, { type: 'flood-level', nestId: nest.id, water: 1, level: 0.3, chambers: [chamber.id] }, t);
    lvl(1000); lvl(1010); lvl(1029); lvl(1031);
    expect(r.calls.filter((c) => c.id === 'water-trickle').length).toBe(2);
    const g = run([{ type: 'flood-started', nestId: nest.id, water: 1, level: 0.1, chambers: [chamber.id] }]);
    expect(g[0]).toMatchObject({ id: 'flood', pos: chamber.center });
  });

  it('a flooded nest does not gurgle once per drowning ant: at most one gurgle per 2 s', () => {
    const r = recorder();
    const rt = new EventRouter(r.sink);
    for (let i = 0; i < 12; i++) rt.handle(sim, { type: 'ant-submerged', id: worker.id, pos: { ...P, x: P.x + i * 50 } }, 2000 + i);
    rt.handle(sim, { type: 'ant-submerged', id: worker.id, pos: P }, 2040);
    expect(r.calls.filter((c) => c.id === 'flood').length).toBe(2);
  });

  it('human events: the warning, the start, the impact (by contact) and the end all reach the giant director', () => {
    const calls = run([
      { type: 'human.telegraph', instId: 3, kind: 'car', cue: 'sound', origin: P, radiusMm: 500, intensity: 1, impactTick: T + 20 },
      { type: 'human.start', instId: 3, kind: 'car', variant: null, region: 0 },
      { type: 'human.impact', instId: 3, kind: 'car', contact: 'tyre', footprint: P, radiusMm: 100 },
      { type: 'human.end', instId: 3, kind: 'car', variant: null, region: 0 },
    ]);
    expect(calls.map((c) => c.id)).toEqual(['telegraph:car', 'start:car', 'impact:car:tyre', 'end']);
  });

  it('a raid scuffles three times at the raided nest entrance, a brood raid clicks mandibles', () => {
    const raid = run([{ type: 'rival-raid-started', attacker: 2, target: nest.colony, partySize: 4 }]);
    expect(raid.length).toBe(3);
    expect(raid.every((c) => c.id === 'grapple')).toBe(true);
    expect(raid[2].extra?.delayS).toBeGreaterThan(raid[0].extra?.delayS!);
    expect(raid[0].pos).toEqual(entrance.pos);
  });
});
