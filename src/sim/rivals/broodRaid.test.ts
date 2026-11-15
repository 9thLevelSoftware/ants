// Brood raiding among incipient conspecific colonies (GDD 05 §3.8, App. E 20; acceptance 4): a player scout at
// the rival entrance makes the nest known; at the next hourly update the player (12 workers, stance aggressive,
// S 9) raids the rival (6 workers, S 4.8) with 7 +- 1 workers; the stolen pupae are put down in the player nest
// and eclose there as player-colony workers. And the other direction: a rival incipient raids the player.
import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { TICKS_PER_HOUR } from '@/sim/time';
import { chamberFloor, placeOnFloor, syncDisplayBrood, homeNest } from './setup';
import { rmod, slotBit } from './state';
import { player, record, rivalSim, rivalsOf } from './testkit';
import { strengthOf } from './raids';
import { quietTracker } from '@/sim/ecology/creatures';

function setup(seed: number): { sim: Sim; rivalId: number } {
  const sim = rivalSim({ seed, nest: 'small', workers: 12, rivals: [{ species: 'lasius-niger', dx: 40, dz: 8, incipient: true }] });
  sim.tick(); // builds the rival nest
  const r = rivalsOf(sim)[0];
  r.rival.n = 6;
  r.rival.b = 30;
  r.rival.cS = 10;
  syncDisplayBrood(sim, r);
  for (const b of sim.state.brood) if (b.alive && b.colony === r.id) { b.stage = 'pupa'; b.progress = 0.97; }
  return { sim, rivalId: r.id };
}

describe('App. E 20: brood raid among incipients', () => {
  it('the player raids with 7 +- 1 workers; stolen pupae eclose as player workers', () => {
    // seed 2: the raiders win this fight (the outcome is combat's; seeds 1-6 succeed in 4 of 6, see the report)
    const { sim, rivalId } = setup(2);
    const r = rivalsOf(sim).find((c) => c.id === rivalId)!;
    const rivalBrood = new Set(sim.state.brood.filter((b) => b.alive && b.colony === r.id).map((b) => b.id));
    const col = player(sim);
    col.directives.stance = 'aggressive';
    const ev = record(sim, ['rival-discovered', 'rival-raid-started', 'brood-raided', 'entity-removed', 'ant-eclosed']);
    // a player scout at the rival entrance
    const e = homeNest(sim, r)!.entrances[0];
    const scout = sim.state.ants.find((a) => a.alive && a.colony === col.id && a.caste === 'worker')!;
    const at = { x: e.pos.x - e.radius - 1.5 * sim.world.bu, y: e.pos.y + sim.world.bu, z: e.pos.z };
    scout.nestId = -1; scout.chamberId = -1;
    placeOnFloor(sim, scout, at);
    sim.index.refresh();
    for (let i = 0; i < 12; i++) sim.tick();
    sim.events.flush();
    expect(rmod(sim.state).playerKnowsNest & slotBit(sim.state, r.id)).not.toBe(0);
    expect(ev.some((x) => x.type === 'rival-discovered' && (x as { colonyId: number }).colonyId === r.id)).toBe(true);
    const sP = strengthOf(sim, col), sR = strengthOf(sim, r);
    expect(sP / sR).toBeGreaterThanOrEqual(1.3);
    // the next hourly update launches it
    let launched = false;
    for (let t = 0; t < TICKS_PER_HOUR + 20 && !launched; t++) {
      sim.tick(); sim.events.flush();
      launched = ev.some((x) => x.type === 'rival-raid-started');
    }
    const start = ev.find((x) => x.type === 'rival-raid-started') as { attacker: number; target: number; partySize: number };
    expect(start).toBeDefined();
    expect(start.attacker).toBe(col.id);
    expect(start.target).toBe(r.id);
    expect(start.partySize).toBeGreaterThanOrEqual(6);
    expect(start.partySize).toBeLessThanOrEqual(8);
    let eclosed = 0;
    for (let t = 0; t < 4000 && eclosed === 0; t++) {
      sim.tick();
      if (t % 50 !== 0) continue;
      sim.events.flush();
      eclosed = ev.filter((x) => x.type === 'entity-removed' && (x as { entity: string }).entity === 'brood'
        && (x as { cause: string }).cause === 'eclosed' && rivalBrood.has((x as { id: number }).id)).length;
    }
    const stolen = ev.filter((x) => x.type === 'brood-raided' && (x as { to: number }).to === col.id).reduce((n, x) => n + (x as { count: number }).count, 0);
    // eslint-disable-next-line no-console
    console.log(`brood raid: party ${start.partySize}, stolen ${stolen}, eclosed as player workers ${eclosed}`);
    expect(stolen).toBeGreaterThan(0);
    expect(eclosed).toBeGreaterThan(0);
    expect(ev.some((x) => x.type === 'ant-eclosed' && (x as { colonyId: number }).colonyId === col.id)).toBe(true);
  }, 120_000);

  it('a rival incipient raids the player (naturalist): its raiders carry player brood home, where it is adopted', () => {
    const sim = rivalSim({ seed: 3, nest: 'small', workers: 12, rivals: [{ species: 'lasius-niger', dx: 40, dz: 8, incipient: true }] });
    sim.tick();
    const r = rivalsOf(sim)[0];
    const col = player(sim);
    r.rival.n = 50; r.rival.b = 0; r.rival.cS = 30; r.rival.pS = 20; // still incipient (N <= 60), clearly stronger
    r.rival.knowsNest |= slotBit(sim.state, col.id);
    quietTracker(sim).hours.fill(1); // a quiet past: the threat director lets a raid on the player start
    const nursery = sim.stores.nests.get(col.nestIds[0])!.chambers.find((c) => c.type === 'nursery')!;
    sim.enqueue({ type: 'cheat.spawnBrood', colonyId: col.id, n: 6, stage: 'pupa', destined: 'worker', chamberId: nursery.id, progress: 0.3 });
    const ev = record(sim, ['rival-raid-started', 'brood-raided', 'rival-raid-ended', 'entity-removed']);
    sim.applyPendingCommands();
    // cheat brood lies at the chamber centre: put it on the floor where workers can reach it
    for (const b of sim.state.brood) if (b.alive && b.colony === col.id) b.pos = chamberFloor(nursery, 0, 0);
    const playerBrood = new Set(sim.state.brood.filter((b) => b.alive && b.colony === col.id).map((b) => b.id));
    expect(playerBrood.size).toBe(6);
    let adopted = 0;
    for (let t = 0; t < 6000 && adopted === 0; t++) {
      sim.tick();
      if (t % 50 !== 0) continue;
      sim.events.flush();
      adopted = ev.filter((x) => x.type === 'entity-removed' && (x as { cause: string }).cause === 'raided' && playerBrood.has((x as { id: number }).id)).length;
    }
    sim.events.flush();
    const start = ev.find((x) => x.type === 'rival-raid-started') as { attacker: number; target: number; partySize: number } | undefined;
    // eslint-disable-next-line no-console
    console.log(`rival brood raid: party ${start?.partySize}, stolen ${ev.filter((x) => x.type === 'brood-raided').length}, adopted ${adopted}`);
    expect(start?.attacker).toBe(r.id);
    expect(start?.target).toBe(col.id);
    expect(start?.partySize).toBe(Math.round(0.6 * 50));
    expect(ev.some((x) => x.type === 'brood-raided' && (x as { from: number }).from === col.id)).toBe(true);
    expect(adopted).toBeGreaterThan(0);
  }, 120_000);

  it('gentle: rival incipients never raid the player', () => {
    const sim = rivalSim({ preset: 'gentle', seed: 3, nest: 'small', workers: 12, rivals: [{ species: 'lasius-niger', dx: 40, dz: 8, incipient: true }] });
    sim.tick();
    const r = rivalsOf(sim)[0];
    r.rival.n = 24;
    r.rival.knowsNest |= slotBit(sim.state, player(sim).id);
    const ev = record(sim, ['rival-raid-started']);
    for (let t = 0; t < 3 * TICKS_PER_HOUR; t++) sim.tick();
    sim.events.flush();
    expect(ev.length).toBe(0);
  }, 60_000);
});
