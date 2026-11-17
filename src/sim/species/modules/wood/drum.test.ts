// Drumming (GDD 07 §6.2.6): nestmates inside the same wood within 30 BU are alarmed, others only within 10 BU;
// 1 s action, 5 s cooldown; the primitive is in the catalogue and only a wood nester may use it.

import { describe, expect, it } from 'vitest';
import { ACTION_DEFS } from '@/sim/ants/actions/defs';
import { TICKS_PER_SECOND } from '@/sim/time';
import { makeTestSim } from '@/sim/testing/testWorld';
import { spawnAnt } from '@/sim/entities';
import './index';
import { drumDef } from './drum';
import { BU, carveLogChamber, LOG_CENTRE, woodSim, worker } from './testkit';

const NONE = { kind: 'none', id: -1, pos: { x: 0, y: 0, z: 0 } } as const;

describe('drum (GDD 07 §6.2.6)', () => {
  it('is registered in the action catalogue with the 1 s duration of the species', () => {
    expect(ACTION_DEFS.drum).toBe(drumDef);
    const sim = woodSim();
    const c = carveLogChamber(sim);
    const a = worker(sim, 'major', c);
    expect(drumDef.durationS(sim, a, NONE)).toBeCloseTo(1, 6);
  });

  it('alarms nestmates inside the same log within 30 BU; outside the wood only within 10 BU; then cools down 5 s', () => {
    const sim = woodSim();
    const c = carveLogChamber(sim);
    const drummer = worker(sim, 'major', c);
    // inside the log, 20 BU along it (the log runs along +X, 60 BU each way from its centre)
    const inLog = worker(sim, 'minor', { x: LOG_CENTRE.x + 20 * BU, y: LOG_CENTRE.y, z: LOG_CENTRE.z });
    // on the ground beside the log, 14 BU from the drummer: not in the wood, beyond 10 BU
    const outside = worker(sim, 'minor', { x: c.x, y: 0.5 * BU, z: c.z + 11.5 * BU });
    sim.index.refresh();
    expect(drumDef.check(sim, drummer, NONE)).toBeNull();
    expect(drumDef.effect!(sim, drummer, NONE)).toBe(1);
    expect(inLog.alarmLevel).toBeGreaterThan(0);
    expect(outside.alarmLevel).toBe(0);
    expect(drumDef.check(sim, drummer, NONE)).toBe('cooldown');
    for (let i = 0; i < 5 * TICKS_PER_SECOND; i++) sim.state.tick++;
    expect(drumDef.check(sim, drummer, NONE)).toBeNull();
  });

  it('a drummer outside wood reaches nestmates within 10 BU only', () => {
    const sim = woodSim();
    const g = { x: 20 * BU, y: 0.5 * BU, z: 100 * BU };
    const drummer = worker(sim, 'major', g);
    const near = worker(sim, 'minor', { x: g.x + 8 * BU, y: g.y, z: g.z });
    const far = worker(sim, 'minor', { x: g.x + 14 * BU, y: g.y, z: g.z });
    sim.index.refresh();
    expect(drumDef.effect!(sim, drummer, NONE)).toBe(1);
    expect(near.alarmLevel).toBeGreaterThan(0);
    expect(far.alarmLevel).toBe(0);
  });

  it('a species that does not nest in wood cannot drum', () => {
    const sim = makeTestSim({ species: 'lasius-niger' });
    const a = spawnAnt(sim, { colony: sim.state.colonies[0].id, caste: 'worker', pos: { x: 0, y: 0, z: 0 }, ageGd: 5 });
    expect(drumDef.check(sim, a, NONE)).toBe('caste');
  });
});
