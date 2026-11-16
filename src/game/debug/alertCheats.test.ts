// Review finding (int-1B-app): the alert cheats wrote sim state without the config.cheats gate every other cheat has.
import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import { activeAlerts } from '@/sim/progression';
import { cheatClearAlert, cheatRaiseAlert } from './alertCheats';

const ALERT = { kind: 'nest-crowded', level: 'notice', title: 'Nest crowded', cause: 'test', subjectId: 77 } as const;
const has = (sim: ReturnType<typeof makeTestSim>) => activeAlerts(sim).some((a) => a.kind === 'nest-crowded' && a.subjectId === 77);

describe('alert cheats', () => {
  it('are refused and change nothing when cheats are off', () => {
    const sim = makeTestSim();
    sim.state.config.cheats = false;
    const before = JSON.stringify(sim.state.progression);
    expect(cheatRaiseAlert(sim, ALERT)).toBe(-1);
    expect(cheatClearAlert(sim, 'nest-crowded', 77)).toBe(false);
    expect(JSON.stringify(sim.state.progression)).toBe(before);
  });

  it('raise and clear through progression when cheats are on', () => {
    const sim = makeTestSim();
    sim.state.config.cheats = true;
    expect(cheatRaiseAlert(sim, ALERT)).toBeGreaterThanOrEqual(0);
    expect(has(sim)).toBe(true);
    expect(cheatClearAlert(sim, 'nest-crowded', 77)).toBe(true);
    expect(has(sim)).toBe(false);
  });
});
