// Reproduction (GDD 06 §11-§12, App. E 22, 23, 25): the alate gate and cost, the flight-day chance, sexual egg
// designation in a running colony, the launch with its aggregate resolution and records, the possessed flight.
import { describe, expect, it } from 'vitest';
import { rngFloat, rngSeed } from '@/core/rng';
import type { PlayerIntent, SimEvent } from '@/sim/types';
import { LASIUS_NIGER } from '@/sim/species/data/lasius-niger';
import { daysToTicks, TICKS_PER_HOUR } from '@/sim/time';
import { LIN_MAX_DAUGHTERS_PER_FLIGHT } from '@/sim/balance/lifecycle';
import { alateTarget, failingGates, type GateFacts } from './gate';
import { launchChance, type FlightWeather } from './flightDay';
import { askOpen, daughterSeed } from './launch';
import { activeFlight, controlClimb } from './possessed';
import { glideStep, type GlideState } from './glide';
import { buildEpitaph } from '../succession/epitaph';
import { colonyOf, makeLifeSim, send, step } from '../succession/testLife';
import { spawnAnt } from '@/sim/entities';

const D = LASIUS_NIGER;
const facts = (o: Partial<GateFacts>): GateFacts => ({
  workers: 700, colonyAgeYears: 2.1, queenAlive: true, daysC: 4, daysP: 2, inLayWindow: true, investment: 0.5, ...o,
});

describe('alate gate and cost (App. E 22)', () => {
  it('N 650 fails gate-stage; N 700 passes all with A* 35 (14 gynes, 21 males) costing 336 loads; 2 GD of C fails stores', () => {
    expect(failingGates(D, facts({ workers: 650 }), 1)).toEqual(['gate-stage']);
    expect(failingGates(D, facts({}), 1)).toEqual([]);
    const t = alateTarget(D, 700, 0.5, 1, 0.4);
    expect(t).toMatchObject({ total: 35, gynes: 14, males: 21 });
    expect(Math.abs(t.cost - 336)).toBeLessThanOrEqual(2);
    expect(failingGates(D, facts({ daysC: 2 }), 1)).toEqual(['gate-stores']);
    expect(failingGates(D, facts({ investment: 0, inLayWindow: false, queenAlive: false, colonyAgeYears: 1 }), 1).sort())
      .toEqual(['gate-age', 'gate-player', 'gate-queen', 'gate-season']);
  });
});

describe('flight day (App. E 23)', () => {
  const w: FlightWeather = { tAir: 24, wind2m: 1, state: 'clear', rainEndedAgoGd: 3, tmaxToday: 24, tmaxYesterday: 24 };
  it('p_launch 0.78 +- 0.02 on a clear 24 C calm day; 0 in wind 7, rain or 12 C', () => {
    expect(Math.abs(launchChance(D, w).p - 0.78)).toBeLessThanOrEqual(0.02);
    expect(launchChance(D, { ...w, wind2m: 7 }).p).toBe(0);
    expect(launchChance(D, { ...w, state: 'rain' }).p).toBe(0);
    expect(launchChance(D, { ...w, tAir: 12 }).p).toBe(0);
  });
  it('over 1000 seeded days flights launch on 78 +- 3 %', () => {
    const rng = rngSeed(42);
    const p = launchChance(D, w).p;
    let n = 0;
    for (let i = 0; i < 1000; i++) if (rngFloat(rng) < p) n++;
    expect(Math.abs(n / 1000 - 0.78)).toBeLessThanOrEqual(0.03);
  });
});

describe('lineage seeds (App. E 25)', () => {
  it('daughter seed = hash32(mother seed, flight id, index), identical on repetition', () => {
    expect(daughterSeed(1234, 'f1-a-1', 0)).toBe(daughterSeed(1234, 'f1-a-1', 0));
    expect(daughterSeed(1234, 'f1-a-1', 0)).not.toBe(daughterSeed(1234, 'f1-a-1', 1));
    expect(daughterSeed(1234, 'f1-a-1', 0)).not.toBe(daughterSeed(1235, 'f1-a-1', 0));
  });
});

function addAlates(sim: ReturnType<typeof makeLifeSim>, gynes: number, males: number): void {
  const col = colonyOf(sim);
  const q = sim.stores.ants.get(col.queenId)!;
  for (let i = 0; i < gynes + males; i++) {
    spawnAnt(sim, { colony: col.id, caste: i < gynes ? 'gyne' : 'male', pos: { ...q.pos }, nestId: q.nestId, chamberId: q.chamberId });
  }
}

describe('rearing and the flight in the sim', () => {
  it('the gate opens in the lay window and the queen\'s new eggs become sexual-destined up to A*', () => {
    // spring day 3 (doy 3, inside the Lasius lay window 2-6), a mature colony in age and size, plenty of stores
    const sim = makeLifeSim({ workers: 70, larvae: 0, chamberC: 25, care: true, c: 400, p: 400 });
    const col = colonyOf(sim);
    sim.state.config.difficulty.params.matureGateMult = 0.1; // 70 workers count as mature for the test
    send(sim, { type: 'cheat.setColonyAge', colonyId: col.id, years: 2.5 });
    send(sim, { type: 'cheat.setTime', tick: daysToTicks(2) + 10 });
    step(sim, 4000);
    const book = col.lifecycle!.repro;
    expect(book.gateFails).toEqual([]);
    expect(col.repro.targetAlates).toBe(Math.round(0.5 * 0.1 * 70));
    const sexual = sim.state.brood.filter((b) => b.alive && (b.destined === 'gyne' || b.destined === 'male'));
    expect(sexual.length).toBeGreaterThan(0);
    expect(book.designatedGynes + book.designatedMales).toBe(sexual.length);
    expect(sexual.length).toBeLessThanOrEqual(col.repro.targetAlates);
  });

  it('no rearing out of the window or with investment 0', () => {
    const sim = makeLifeSim({ workers: 70, larvae: 0, chamberC: 25, care: true, c: 400, p: 400 });
    const col = colonyOf(sim);
    sim.state.config.difficulty.params.matureGateMult = 0.1;
    send(sim, { type: 'cheat.setColonyAge', colonyId: col.id, years: 2.5 });
    step(sim, 4000); // summer: outside the lay window
    expect(col.lifecycle!.repro.gateFails).toContain('gate-season');
    expect(sim.state.brood.filter((b) => b.alive && b.destined !== 'worker')).toHaveLength(0);
  });

  it('forced flight: launch, take-off after assembly, one flight record, 1..12 daughters of 20 gynes stored', () => {
    const sim = makeLifeSim({ workers: 30, chamberC: 25 });
    addAlates(sim, 20, 30);
    const ev: SimEvent[] = [];
    for (const t of ['flight.launched', 'flight.ended', 'lineage.daughter-added'] as const) sim.events.on(t, (e) => ev.push(e as SimEvent));
    send(sim, { type: 'cheat.forceFlight' });
    expect(ev.filter((e) => e.type === 'flight.launched')).toHaveLength(1);
    step(sim, daysToTicks(0.1) + 20);
    const life = colonyOf(sim).lifecycle!;
    expect(life.flights).toHaveLength(1);
    const rec = life.flights[0];
    expect(rec.nGynes).toBe(20);
    expect(rec.nMales).toBe(30);
    expect(rec.nLaunched).toBe(50);
    expect(rec.nFounded).toBeGreaterThanOrEqual(1);
    expect(life.daughters.length).toBeGreaterThanOrEqual(1);
    expect(life.daughters.length).toBeLessThanOrEqual(LIN_MAX_DAUGHTERS_PER_FLIGHT);
    expect(life.daughters[0].generation).toBe(2);
    expect(life.daughters[0].seed).toBe(daughterSeed(sim.state.config.world.seed, rec.id, 0));
    expect(ev.filter((e) => e.type === 'flight.ended')).toHaveLength(1);
    expect(ev.filter((e) => e.type === 'lineage.daughter-added')).toHaveLength(life.daughters.length);
    expect(sim.state.ants.filter((a) => a.alive && a.alate)).toHaveLength(0);
  });

  it('possessed flight: take-off, climb to the lek, mate, land; the flight closes with her', () => {
    const sim = makeLifeSim({ workers: 30, chamberC: 25, locomotion: true });
    addAlates(sim, 5, 10);
    send(sim, { type: 'cheat.forceFlight' });
    const gyne = sim.state.ants.find((a) => a.alive && a.caste === 'gyne')!;
    send(sim, { type: 'flightPossess', gyneId: gyne.id });
    expect(sim.state.player.possessedAntId).toBe(gyne.id);
    const f = activeFlight(sim)!.f;
    expect(f.phase).toBe('ascend');
    // fly toward the lek, then hover there
    for (let i = 0; i < 1200 && activeFlight(sim) && !f.mated; i++) {
      const g = sim.stores.ants.get(gyne.id)!;
      const dx = f.lek.x - g.pos.x, dz = f.lek.z - g.pos.z, dy = f.lek.y - g.pos.y;
      const L = Math.hypot(dx, dz) || 1;
      const climb = dy > 0 ? 1 : 0, descend = dy < -40 ? 1 : 0;
      sim.setPlayerIntent({ dir: { x: dx / L, y: 0, z: dz / L }, hurry: false, grip: false, held: [], flight: { thrust: 0, brake: 1, bank: 0, climb, descend } });
      step(sim, 1);
    }
    expect(f.mated).toBe(true);
    for (let i = 0; i < 3000 && activeFlight(sim); i++) {
      sim.setPlayerIntent({ dir: { x: 0, y: 0, z: 0 }, hurry: true, grip: false, held: [], flight: null });
      step(sim, 1);
    }
    expect(f.phase).toBe('ended');
    expect(['landed', 'exhausted', 'timeout', 'dispersed']).toContain(f.outcome);
    step(sim, daysToTicks(0.1) + 20);
    const rec = colonyOf(sim).lifecycle!.flights[0];
    expect(rec.possessed).toBe(true);
    expect(colonyOf(sim).lifecycle!.repro.openFlightId).toBe('');
  });

  it('land now ends the possessed flight at once', () => {
    const sim = makeLifeSim({ workers: 30, chamberC: 25, locomotion: true });
    addAlates(sim, 2, 4);
    send(sim, { type: 'cheat.forceFlight' });
    const gyne = sim.state.ants.find((a) => a.alive && a.caste === 'gyne')!;
    send(sim, { type: 'flightPossess', gyneId: gyne.id });
    step(sim, 3);
    send(sim, { type: 'flightLand', point: { x: 0, y: 0, z: 0 } });
    expect(activeFlight(sim)).toBeNull();
    expect(colonyOf(sim).lifecycle!.flight!.outcome).toBe('land-now');
  });
});

describe('the flight day as the policies meet it (GDD 06 §11.5)', () => {
  const at = (doy: number, hour: number): number => daysToTicks(doy - 1) + Math.round(hour * TICKS_PER_HOUR);
  const rejected = (sim: ReturnType<typeof makeLifeSim>): string[] => {
    const out: string[] = [];
    sim.events.on('command-rejected', (e) => out.push(e.reason));
    return out;
  };

  function askedSim(): ReturnType<typeof makeLifeSim> {
    const sim = makeLifeSim({ workers: 30, chamberC: 25 });
    colonyOf(sim).directives.alatePolicy = 'ask';
    addAlates(sim, 3, 5);
    for (const a of sim.state.ants) if (a.alate) a.alate.state = 'waiting';
    send(sim, { type: 'cheat.setTime', tick: at(10, 13.4) });
    send(sim, { type: 'cheat.setWeather', state: 'clear', intensityClass: null });
    step(sim, Math.round(0.3 * TICKS_PER_HOUR));
    return sim;
  }

  it('ask: the offer opens at the roll hour; Release then launches', () => {
    const sim = askedSim();
    const col = colonyOf(sim);
    expect(col.lifecycle!.repro.askTick).toBeGreaterThanOrEqual(0);
    expect(askOpen(sim, col, LASIUS_NIGER)).toBe(true);
    send(sim, { type: 'flightRelease' });
    expect(col.lifecycle!.flights).toHaveLength(1);
  });

  it('ask: the offer lapses when rain comes, and a late Release is refused', () => {
    const sim = askedSim();
    const col = colonyOf(sim);
    const why = rejected(sim);
    send(sim, { type: 'cheat.setWeather', state: 'rain', intensityClass: null }, 20);
    expect(col.lifecycle!.repro.askTick).toBe(-1);
    send(sim, { type: 'flightRelease' });
    expect(col.lifecycle!.flights).toHaveLength(0);
    expect(why).toContain('no-offer');
  });

  it('ask: an offer left unanswered does not carry over to the next day', () => {
    const sim = askedSim();
    const col = colonyOf(sim);
    const book = col.lifecycle!.repro;
    const offered = book.askTick;
    send(sim, { type: 'cheat.setTime', tick: at(11, 9) }, 20);
    expect(book.askTick).toBe(-1);
    send(sim, { type: 'flightRelease' });
    expect(col.lifecycle!.flights).toHaveLength(0);
    expect(offered).toBeGreaterThanOrEqual(0);
  });

  it('auto-release: the roll is at launch hour - 0.5 h, the launch at the launch hour start', () => {
    let checked = 0;
    for (const seed of [1, 2, 3]) {
      const sim = makeLifeSim({ workers: 30, chamberC: 25, seed });
      const col = colonyOf(sim);
      col.directives.alatePolicy = 'auto-release';
      addAlates(sim, 3, 5);
      for (const a of sim.state.ants) if (a.alate) a.alate.state = 'waiting';
      send(sim, { type: 'cheat.setTime', tick: at(10, 13.4) });
      send(sim, { type: 'cheat.setWeather', state: 'clear', intensityClass: null });
      step(sim, Math.round(0.5 * TICKS_PER_HOUR)); // 13:54: rolled, not launched
      const book = col.lifecycle!.repro;
      expect(book.rollDay).toBeGreaterThanOrEqual(0);
      expect(col.lifecycle!.flights).toHaveLength(0);
      if ((book.launchAtTick ?? -1) < 0) continue; // the roll failed for this seed
      const startTick = book.launchAtTick!;
      step(sim, Math.round(0.2 * TICKS_PER_HOUR));
      expect(col.lifecycle!.flights).toHaveLength(1);
      const t = col.lifecycle!.flights[0].tick;
      expect(t).toBeGreaterThanOrEqual(startTick);
      expect(t - startTick).toBeLessThanOrEqual(10);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('the possessed flight with the controls the game sends (GDD 06 §11.6)', () => {
  const intent = (o: Partial<PlayerIntent>): PlayerIntent => ({ dir: { x: 1, y: 0, z: 0 }, hurry: false, grip: false, held: [], flight: null, ...o });

  it('Space (grip) climbs, Shift (hurry) descends, nothing sinks; a flight block wins when one is sent', () => {
    expect(controlClimb(intent({ grip: true }))).toBe(1);
    expect(controlClimb(intent({ hurry: true }))).toBe(-1);
    expect(controlClimb(intent({}))).toBe(0);
    expect(controlClimb(intent({ grip: true, flight: { thrust: 1, brake: 0, bank: 0, climb: 0, descend: 1 } }))).toBe(-1);
  });

  it('holding Space a cruising gyne climbs 40 BU/s and can reach a lek 1500 BU away above her cruise height', () => {
    const bu = 4;
    const s: GlideState = { x: 0, y: 60 * bu, z: 0, yaw: 0 };
    const flat = (): number => 0;
    const climb = controlClimb(intent({ grip: true }));
    let t = 0;
    // fly level toward a lek 1500 BU away at 120 BU, holding Space while below it and letting go above
    while (s.x < 1500 * bu && t < 60) {
      glideStep(s, { steerX: 1, steerZ: 0, climb: s.y < 120 * bu ? climb : 0, thrust: 1, windMs: 0, windX: 0, windZ: 0, bu }, 0.1, flat);
      t += 0.1;
    }
    expect(s.x).toBeGreaterThanOrEqual(1500 * bu);
    expect(s.y / bu).toBeGreaterThan(60); // without the climb she would have sunk to the ground on the way
  });
});

describe('flight losses in the records (GDD 06 §11.6)', () => {
  it('flown alates stay out of the colony causes of death; the flight keeps its losses by cause', () => {
    const sim = makeLifeSim({ workers: 30, chamberC: 25 });
    addAlates(sim, 6, 10);
    send(sim, { type: 'cheat.forceFlight' });
    step(sim, daysToTicks(0.1) + 20);
    const rec = colonyOf(sim).lifecycle!.flights[0];
    const by = rec.flightDeathsByCause!;
    expect(by['old-age']).toBe(10);
    expect(by.predation ?? 0).toBe(rec.flightDeaths);
    const ep = buildEpitaph(sim);
    expect(ep.causes.find((c) => c.cause === 'dispersed')).toBeUndefined();
    expect(ep.causes.find((c) => c.cause === 'old-age')).toBeUndefined();
    expect(Object.values(ep.bySeason).reduce((a, b) => a + b, 0)).toBe(0);
    expect(ep.figures.alatesFlown).toBe(16);
  });
});
