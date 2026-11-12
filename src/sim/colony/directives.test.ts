import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '@/sim/time';
import { addChamber, addWorkers, colonyOf, makeColonySim, step } from './testkit';
import { curfew } from './activation';

describe('directives (GDD 02 §12.1)', () => {
  it('validates and applies every Tier 1 / Tier 2 key, ignoring species extras the species lacks', () => {
    const sim = makeColonySim();
    const rejected: string[] = [];
    sim.events.on('command-rejected', (e) => rejected.push(e.detail ?? e.reason));
    sim.enqueue({
      type: 'setDirectives', allocation: { forage: 2, nurse: 1, dig: 1, defend: 0 }, diet: 250, stockTarget: 'high',
      alateInvestment: 3, gyneShare: 0.9, alatePolicy: 'hold', stance: 'aggressive', sealInCold: false, granaryHygiene: 0.5,
    });
    step(sim, 1);
    const d = colonyOf(sim).directives;
    expect(d.allocation).toEqual({ forage: 50, nurse: 25, dig: 25, defend: 0 });
    expect(d.diet).toBe(100);
    expect(d.stockTarget).toBe('high');
    expect(d.alateInvestment).toBe(1);
    expect(d.gyneShare).toBe(0.6);
    expect(d.alatePolicy).toBe('hold');
    expect(d.stance).toBe('aggressive');
    expect(d.sealInCold).toBe(false);
    expect(rejected).toContain('granaryHygiene');
    sim.enqueue({ type: 'setDirectives', allocation: 'auto', diet: 'auto' });
    step(sim, 1);
    expect(colonyOf(sim).directives.allocation).toBe('auto');
    expect(colonyOf(sim).directives.diet).toBe('auto');
  });

  it('stayIn imposes the curfew and clears itself after 1 gd', () => {
    const sim = makeColonySim();
    const ch = addChamber(sim, 'general', { x: 100, y: -40, z: 100 });
    addWorkers(sim, 5, { chamber: ch });
    sim.enqueue({ type: 'setDirectives', stayIn: true });
    step(sim, 20);
    expect(curfew(sim, colonyOf(sim))).toBe(true);
    step(sim, TICKS_PER_DAY);
    expect(colonyOf(sim).directives.stayIn).toBe(false);
    expect(curfew(sim, colonyOf(sim))).toBe(false);
  });
});

describe('markers (GDD 02 §12.2)', () => {
  it('enforces caps, radius ranges and rally expiry', () => {
    const sim = makeColonySim();
    const bu = sim.world.bu;
    for (let i = 0; i < 5; i++) sim.enqueue({ type: 'placeMarker', kind: 'forage', pos: { x: 10 * i, y: 0, z: 0 }, radius: 500 * bu });
    sim.enqueue({ type: 'placeMarker', kind: 'rally', pos: { x: 0, y: 0, z: 0 } });
    step(sim, 1);
    const forage = sim.state.markers.filter((m) => m.alive && m.kind === 'forage');
    expect(forage.length).toBe(4);
    expect(forage[0].radius).toBe(80 * bu);
    expect(sim.state.markers.some((m) => m.alive && m.kind === 'rally')).toBe(true);
    step(sim, TICKS_PER_DAY + 20);
    expect(sim.state.markers.some((m) => m.alive && m.kind === 'rally')).toBe(false);
  });

  it('move-brood needs a brood-capable target chamber', () => {
    const sim = makeColonySim();
    const food = addChamber(sim, 'food', { x: 0, y: -40, z: 0 });
    const nursery = addChamber(sim, 'nursery', { x: 50, y: -40, z: 0 });
    sim.enqueue({ type: 'placeMarker', kind: 'move-brood', pos: food.center, chamberIds: [food.id] });
    step(sim, 1);
    expect(sim.state.markers.some((m) => m.alive && m.kind === 'move-brood')).toBe(false);
    sim.enqueue({ type: 'placeMarker', kind: 'move-brood', pos: nursery.center, chamberIds: [nursery.id] });
    step(sim, 1);
    expect(sim.state.markers.some((m) => m.alive && m.kind === 'move-brood')).toBe(true);
  });
});
