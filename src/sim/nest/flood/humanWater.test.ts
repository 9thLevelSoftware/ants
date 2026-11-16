// nest-fix3 item 7: a sprinkler or hose wets the ground and feeds nest inflow at GDD 03 §11.1's intensity 0.5, through
// the human-events rate function. The rate function and the watering plan are stubbed here (a real watering event
// needs a lawn with sprinkler heads; human-events' own tests cover where the water falls): water falls on a disc of
// 300 mm around WATER_AT while a watering run is active.
import { describe, expect, it, vi } from 'vitest';
import type { Sim } from '@/sim/types';
import { FLOOD_HUMAN_WATER_INTENSITY, FLOOD_Q_BASE } from '@/sim/balance/weather';
import { makeTestSim } from '@/sim/testing';
import { stepWatering } from '@/sim/environment/effectsWatering';
import { playerNest, setMoisture } from '../nestTestKit';
import { entranceInflow } from './inflow';

const WATER_AT = { x: 0, z: 0 };
const R = 60;

vi.mock('@/sim/environment/human/waterRate', () => ({
  humanRainRateAt: (sim: Sim, x: number, z: number) =>
    sim.state.env.human.active.length > 0 && Math.hypot(x - WATER_AT.x, z - WATER_AT.z) <= R ? 15 : 0,
}));
vi.mock('@/sim/environment/human/plans', async (orig) => ({
  ...(await orig<object>()),
  humanPlan: () => ({ endT: 1e9, impacts: [{ t: 0, fp: { x: WATER_AT.x, y: 0, z: WATER_AT.z, yaw: 0, hx: R, hz: R, disc: true } }] }),
}));

/** A watering run as human-events keeps it (only the fields the readers use). */
function startWatering(sim: Sim): void {
  const inst = { id: 9001, kind: 'watering', variant: 'sprinkler', startTick: sim.state.tick, regionId: 0, cancelled: false };
  sim.state.env.human.active.push({ instId: inst.id, inst, started: true, cues: [] } as unknown as (typeof sim.state.env.human.active)[number]);
}

describe('sprinkler and hose (nest-fix3 item 7)', () => {
  it('an entrance under the sprinkler takes inflow at intensity 0.5 in dry weather; one beside it none', () => {
    const sim = makeTestSim({ nest: 'small', systems: [] });
    const e = playerNest(sim).entrances[0];
    WATER_AT.x = e.pos.x; WATER_AT.z = e.pos.z;
    expect(entranceInflow(sim, e).intensity).toBe(0);
    startWatering(sim);
    const f = entranceInflow(sim, e);
    expect(f.intensity).toBe(FLOOD_HUMAN_WATER_INTENSITY);
    const mult = sim.state.config.difficulty.params.floodInflowMult;
    expect(f.q).toBeCloseTo(FLOOD_Q_BASE * 0.5 * f.catchment * f.cover * f.rim * f.state * mult, 9);
    WATER_AT.x = e.pos.x + 10 * R;
    expect(entranceInflow(sim, e).intensity).toBe(0);
  });

  it('wets the soil (and fills puddles where they form) only on the watered footprint', () => {
    const sim = makeTestSim({ nest: 'none', systems: [] });
    setMoisture(sim, 0.2);
    const m = sim.state.env.moisture;
    WATER_AT.x = sim.world.size / 2; WATER_AT.z = sim.world.size / 2;
    const cell = (x: number, z: number) => Math.floor(z / m.cell) * m.nx + Math.floor(x / m.cell);
    const under = cell(WATER_AT.x, WATER_AT.z), beside = cell(WATER_AT.x + 4 * R, WATER_AT.z);
    const t0 = m.theta0[under], t1 = m.theta0[beside];
    expect(stepWatering(sim)).toBe(0); // no watering running
    startWatering(sim);
    expect(stepWatering(sim)).toBeGreaterThan(0);
    expect(m.theta0[under]).toBeGreaterThan(t0);
    expect(m.theta0[beside]).toBe(t1);
  });
});
