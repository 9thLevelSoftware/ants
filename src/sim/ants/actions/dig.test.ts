// dig-bite, seal-entrance, unseal-entrance (GDD 01 §7.3, App. E 6; effects through a fake nest module).
import { afterEach, describe, expect, it } from 'vitest';
import type { Entrance, Sim } from '@/sim/types';
import { spawnItem } from '@/sim/entities';
import { begin, canDo } from './runner';
import { ports } from './ports';
import { capture, installFakes, makeAntSim, step, worker } from './testkit';

let restore = (): void => {};
afterEach(() => restore());

function setup() {
  const sim = makeAntSim();
  const f = installFakes(sim);
  restore = f.restore;
  return { sim, fake: f.fake };
}

function addEntrance(sim: Sim, x: number, z: number): Entrance {
  const e: Entrance = {
    id: sim.state.nextId++, kind: 'dug', status: 'open', pos: { x, y: 0, z }, dir: { x: 0, y: 1, z: 0 },
    radius: sim.world.bu, moundId: -1, rimTarget: 0, plugVoxelCount: 0, createdTick: 0, trafficIn: 0, trafficOut: 0,
  };
  sim.state.nests[0].entrances.push(e);
  return e;
}

describe('dig-bite', () => {
  it('App. E 6: held for 10 game s -> 10 bites, pellets on the floor = bites - 1, one in the mandibles', () => {
    const { sim, fake } = setup();
    const ant = worker(sim, 50, 50);
    sim.enqueue({ type: 'possess', antId: ant.id });
    sim.enqueue({ type: 'action', actionId: 'dig-bite', phase: 'start' });
    const ev = capture(sim, ['action-completed'], () => {
      step(sim, 100);
      sim.enqueue({ type: 'action', actionId: 'dig-bite', phase: 'stop' });
      step(sim, 15);
    });
    const bites = ev.filter((e) => e.action === 'dig-bite').length;
    expect(bites).toBeGreaterThanOrEqual(9);
    expect(bites).toBeLessThanOrEqual(11);
    expect(fake.bites).toBe(bites);
    const pellets = sim.stores.items.list.filter((i) => i.alive && i.kind === 'soil-pellet');
    expect(pellets.filter((p) => p.carrierIds.length === 0)).toHaveLength(bites - 1);
    expect(ant.carry.kind).toBe('item');
    expect(sim.stores.items.get(ant.carry.id)?.kind).toBe('soil-pellet');
  });

  // The dig speed comes from the nest module's substrate rule (ports.nestDigSpeedAt: material, moisture, loose
  // fill, crusts; GDD 03 §2.1-2.2) since the Stage 1A gate; these tests set it through that port.
  it('duration = DIG_BITE_S / (digSpeed x digPower x workRate): founding queen 1.3 s in loam', () => {
    const { sim } = setup();
    const q = sim.stores.ants.get(sim.state.colonies[0].queenId)!;
    ports.nestDigSpeedAt = () => 1; // loam at medium moisture
    expect(begin(sim, q, 'dig-bite', null)).toBe(true);
    expect(q.action?.durationTicks).toBe(13);
    const w = worker(sim, 50, 50);
    ports.nestDigSpeedAt = () => 1.6; // sand
    begin(sim, w, 'dig-bite', null);
    expect(w.action?.durationTicks).toBe(7);
  });

  it('failure codes: not-diggable, caste (established queen), hands-full, not-allowed-here, effect refusal', () => {
    const { sim } = setup();
    const ant = worker(sim, 50, 50);
    ports.nestDigSpeedAt = () => 0;
    expect(canDo(sim, ant, 'dig-bite', null).reason).toBe('not-diggable');
    ports.nestDigSpeedAt = () => 1;
    const q = sim.stores.ants.get(sim.state.colonies[0].queenId)!;
    q.flags = 0;
    expect(canDo(sim, q, 'dig-bite', null).reason).toBe('caste');
    const crumb = spawnItem(sim, { kind: 'food-piece', pos: ant.pos, init: { bulk: 0.2 } });
    crumb.carrierIds = [ant.id];
    ant.carry = { kind: 'item', id: crumb.id };
    expect(canDo(sim, ant, 'dig-bite', null).reason).toBe('hands-full');
    ant.carry = { kind: 'none', id: -1 };
    ports.canDigAt = () => false;
    expect(canDo(sim, ant, 'dig-bite', null).reason).toBe('not-allowed-here');
    ports.canDigAt = () => true;
    ports.digBite = () => ({ ok: false, reason: 'no-target', voxels: 0, pelletId: -1, material: null });
    begin(sim, ant, 'dig-bite', null);
    const ev = capture(sim, ['action-failed'], () => step(sim, 10));
    expect(ev[0]).toMatchObject({ action: 'dig-bite', reason: 'no-target' });
  });

  it('passes the feet, the horizontal heading and the slope (default 30°, aimed by a point target)', () => {
    const { sim } = setup();
    const ant = worker(sim, 50, 50);
    const calls: { slope: number; heading: { x: number; y: number; z: number } }[] = [];
    ports.digBite = (_s, _a, _p, heading, slopeDeg) => { calls.push({ slope: slopeDeg, heading: { ...heading } }); return { ok: true, reason: null, voxels: 1, pelletId: -1, material: 'loam' }; };
    begin(sim, ant, 'dig-bite', null);
    step(sim, 10);
    const bu = sim.world.bu;
    begin(sim, ant, 'dig-bite', { kind: 'point', id: -1, pos: { x: ant.pos.x + 2 * bu, y: -2 * bu, z: ant.pos.z } });
    step(sim, 10);
    expect(calls[0].slope).toBe(30);
    expect(calls[0].heading).toEqual({ x: 1, y: 0, z: 0 });
    expect(calls[1].slope).toBeCloseTo(45, 0);
  });

  it('auto-advance: a face beyond reach but within 1.5 L ahead is targeted and the ant steps up to it', () => {
    const { sim } = setup();
    const ant = worker(sim, 50, 50);
    const L = sim.world.bu;
    sim.field.sphereTrace = (_o, _d, max) => Math.min(max, 0.9 * L); // a face 0.9 L ahead of the mandibles
    const steps: number[] = [];
    ports.navTo = (_s, _w, dest) => { steps.push(dest.x - ant.pos.x); return true; };
    expect(begin(sim, ant, 'dig-bite', null)).toBe(true);
    expect(ant.action?.target.kind).toBe('surface');
    expect(steps).toHaveLength(1);
    expect(steps[0]).toBeCloseTo(1.4 * L, 6); // mandible point 0.5 L + 0.9 L
  });

  it('carrying a pellet: it is dropped behind the ant at the start of the next bite', () => {
    const { sim } = setup();
    const ant = worker(sim, 50, 50);
    const pellet = spawnItem(sim, { kind: 'soil-pellet', pos: ant.pos, init: { bulk: 0.5 } });
    pellet.carrierIds = [ant.id];
    ant.carry = { kind: 'item', id: pellet.id };
    begin(sim, ant, 'dig-bite', null);
    expect(pellet.carrierIds).toEqual([]);
    expect(pellet.pos.x).toBeLessThan(ant.pos.x);
  });
});

describe('seal-entrance / unseal-entrance', () => {
  it('seal: needs a pellet, in the throat; 2 s; the pellet is consumed; sealed after 3 plugs', () => {
    const { sim } = setup();
    const bu = sim.world.bu;
    const e = addEntrance(sim, 50 * bu, 50 * bu);
    const ant = worker(sim, 50, 50);
    ant.pos.y = -1.5 * bu;
    expect(canDo(sim, ant, 'seal-entrance', null).reason).toBe('no-target');
    for (let i = 0; i < 3; i++) {
      const p = spawnItem(sim, { kind: 'soil-pellet', pos: ant.pos, init: { bulk: 0.5 } });
      p.carrierIds = [ant.id];
      ant.carry = { kind: 'item', id: p.id };
      expect(begin(sim, ant, 'seal-entrance', null)).toBe(true);
      expect(ant.action?.durationTicks).toBe(20);
      step(sim, 20);
      expect(sim.stores.items.has(p.id)).toBe(false);
      expect(ant.carry.kind).toBe('none');
    }
    expect(e.status).toBe('sealed');
    const p = spawnItem(sim, { kind: 'soil-pellet', pos: ant.pos, init: { bulk: 0.5 } });
    ant.carry = { kind: 'item', id: p.id };
    p.carrierIds = [ant.id];
    expect(canDo(sim, ant, 'seal-entrance', { kind: 'entrance', id: e.id, pos: e.pos }).reason).toBe('blocked');
  });

  it('outside the throat (far, or above the opening) it is out of reach', () => {
    const { sim } = setup();
    const bu = sim.world.bu;
    const e = addEntrance(sim, 50 * bu, 50 * bu);
    const ant = worker(sim, 56, 50);
    const p = spawnItem(sim, { kind: 'soil-pellet', pos: ant.pos, init: { bulk: 0.5 } });
    ant.carry = { kind: 'item', id: p.id };
    p.carrierIds = [ant.id];
    expect(canDo(sim, ant, 'seal-entrance', { kind: 'entrance', id: e.id, pos: e.pos }).reason).toBe('out-of-reach');
  });

  it('unseal: dig-bite x 0.5, yields a pellet in the mandibles, opens when the plugs are gone', () => {
    const { sim } = setup();
    const bu = sim.world.bu;
    const e = addEntrance(sim, 50 * bu, 50 * bu);
    e.status = 'sealed';
    e.plugVoxelCount = 1;
    const ant = worker(sim, 50, 50);
    ant.pos.y = -1.5 * bu;
    expect(begin(sim, ant, 'unseal-entrance', null)).toBe(true);
    expect(ant.action?.durationTicks).toBe(5);
    step(sim, 5);
    expect(e.status).toBe('open');
    expect(sim.stores.items.get(ant.carry.id)?.kind).toBe('soil-pellet');
    expect(canDo(sim, ant, 'unseal-entrance', { kind: 'entrance', id: e.id, pos: e.pos }).reason).toBe('no-target');
  });
});
