import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import { surfaceTemp } from '@/sim/environment/surface';
import { decodeTemp, moistureSampler, samplerFor, temperatureSampler, threatSampler, threatZones } from './samplers';

const px = () => new Float32Array(4);

describe('overlay samplers (real sim, read only)', () => {
  const sim = makeTestSim({ sizeBu: 128, seed: 2 });
  for (let i = 0; i < 20; i++) sim.tick();
  const size = sim.world.size, c = size / 2, bu = sim.world.bu;

  it('temperature: the environment surface temperature inside the locality, nothing outside', () => {
    const s = temperatureSampler(sim);
    const o = px();
    s.sample(c, c, o);
    expect(o[1]).toBe(1);
    expect(decodeTemp(o[0])).toBeCloseTo(surfaceTemp(sim, c, c), 4);
    const out = px();
    s.sample(-10, c, out);
    expect(out[1]).toBe(0);
  });

  it('moisture: topsoil moisture 0..1 from the live grid', () => {
    const o = px();
    moistureSampler(sim).sample(c, c, o);
    expect(o[1]).toBe(1);
    expect(o[0]).toBeGreaterThanOrEqual(0);
    expect(o[0]).toBeLessThanOrEqual(1);
  });

  it('threats: a predator area around a wolf spider, a forecast human event with its countdown', () => {
    sim.enqueue({ type: 'cheat.spawnCreature', kind: 'wolf-spider', variant: null, pos: { x: c - 30 * bu, y: 0, z: c }, state: null });
    sim.applyPendingCommands();
    const spider = sim.state.creatures.find((k) => k.alive && k.kind === 'wolf-spider');
    expect(spider).toBeDefined();
    // a running human event with an impact still to come (state shape of GDD 04 HumanEventRun): test fixture
    sim.state.env.human.active.push({
      instId: 999, progressS: 0, nextImpactTick: sim.state.tick + 500,
      cues: [{ kind: 'shadow', origin: { x: c + 30 * bu, y: 0, z: c }, radiusMm: 10 * bu, intensity: 1, startTick: sim.state.tick, impactTick: sim.state.tick + 500 }],
    });
    const { zones, forecasts } = threatZones(sim);
    expect(zones.some((z) => z.ch === 0)).toBe(true);
    expect(zones.some((z) => z.ch === 3)).toBe(true);
    expect(forecasts.map((f) => f.text)).toContain('in 2 h');
    const s = threatSampler(sim, zones);
    const atSpider = px(), atHuman = px(), far = px();
    s.sample(spider!.pos.x, spider!.pos.z, atSpider);
    s.sample(c + 30 * bu, c, atHuman);
    s.sample(c, c + 50 * bu, far);
    expect(atSpider[0]).toBeGreaterThan(0.5);
    expect(atHuman[3]).toBe(1);
    expect(far[0]).toBe(0);
    expect(far[3]).toBe(0);
    sim.state.env.human.active.pop();
  });

  it('samplerFor picks the overlay', () => {
    for (const m of ['temperature', 'moisture', 'threats'] as const) expect(typeof samplerFor(sim, m).sampler.sample).toBe('function');
  });
});
