// gate-close-app: hint-directives showed as an engine card right after the hand-over (tests/e2e/onboarding.mjs B11)
// because daysSinceFirstWorker subtracted a sim-tick milestone date from the calendar tick (the calendar starts days
// into the year). Milestone dates carry the sim tick: the days since the first worker start at 0.
import { describe, expect, it } from 'vitest';
import type { UiSnapshot } from '@/ui/api';
import { makeTestSim } from '@/sim/testing';
import { TICKS_PER_DAY } from '@/sim/time';
import { readFacts } from './facts';

const snap = { screen: 'playing', view: 'observer', possessed: null, prompt: null, alerts: [], speed: null, colony: null, markers: null, hudHidden: false } as unknown as UiSnapshot;
const ui = { drawer: null, overlayScent: false, overlayOther: false, foundingShown: [] };

describe('daysSinceFirstWorker', () => {
  it('counts sim days since the ms-first-worker milestone, whatever the calendar start', () => {
    const sim = makeTestSim({ systems: [] });
    sim.state.env.calendar.startTick = 8 * TICKS_PER_DAY; // a game that starts on day 9 of the year
    sim.state.tick = 1000;
    sim.state.progression.milestones['ms-first-worker'] = { tick: 1000, doy: 9, year: 1 };
    expect(readFacts({ snap, sim, ui, hintsOn: true }).daysSinceFirstWorker).toBe(0);
    sim.state.tick = 1000 + 2 * TICKS_PER_DAY;
    expect(readFacts({ snap, sim, ui, hintsOn: true }).daysSinceFirstWorker).toBeCloseTo(2, 9);
  });
});
