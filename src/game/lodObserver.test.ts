// LOD observer feed (int-1A review finding 5): sampled at tick boundaries through SimDriver.beforeTick, so drawing
// frames does not change the simulation; sent on the first tick of every session and after moves of more than 1 BU.
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/math/vec3';
import type { Sim } from '@/sim/types';
import { makeTestSim } from '@/sim/testing';
import { SimDriver } from './loop/simDriver';
import { LodObserverFeed } from './lodObserver';

function recorder() {
  const sent: (Vec3 | null)[] = [];
  return { sent, set: (_sim: Sim, p: Vec3 | null) => { sent.push(p ? { ...p } : null); } };
}

describe('LodObserverFeed', () => {
  const sim = { world: { bu: 4 } } as unknown as Sim;

  it('sends the first focus, then only moves of more than 1 BU', () => {
    const r = recorder(), feed = new LodObserverFeed(r.set);
    let f = { x: 10, y: 0, z: 10 };
    const focus = (out: Vec3) => { out.x = f.x; out.y = f.y; out.z = f.z; return out; };
    feed.sample(sim, focus);
    feed.sample(sim, focus);
    f = { x: 13, y: 0, z: 10 }; // 3 mm < 1 BU
    feed.sample(sim, focus);
    f = { x: 15, y: 0, z: 10 }; // 5 mm from the last sent point
    feed.sample(sim, focus);
    expect(r.sent).toEqual([{ x: 10, y: 0, z: 10 }, { x: 15, y: 0, z: 10 }]);
  });

  it('a new session (reset) always sends, even at the same focus; non-finite foci are ignored', () => {
    const r = recorder(), feed = new LodObserverFeed(r.set);
    const at = (x: number) => (out: Vec3) => { out.x = x; out.y = 0; out.z = 0; return out; };
    feed.sample(sim, at(Number.NaN));
    expect(r.sent).toEqual([]);
    feed.sample(sim, at(1));
    feed.reset();
    feed.sample(sim, at(1));
    expect(r.sent.length).toBe(2);
  });

  it('is fed by SimDriver.beforeTick: once per tick in step(), never outside a tick', () => {
    const r = recorder(), feed = new LodObserverFeed(r.set);
    const d = new SimDriver(makeTestSim());
    let x = 0;
    const focus = (out: Vec3) => { out.x = x; out.y = 0; out.z = 0; return out; };
    d.beforeTick = () => { x += 10; feed.sample(d.sim, focus); };
    d.step(5);
    expect(r.sent.map((p) => p!.x)).toEqual([10, 20, 30, 40, 50]);
  });
});
