// gate-close-app seam: "Founding chamber flooding" repeated x10 long after the hand-over. The founding card belongs
// to the opening; once the nest is reopening it goes, and the flood diagnostic's card names the chamber. While the
// opening is on, the periodic refresh of a card that is up updates it in place without counting a repeat.
// Cross-edit by gate-close-app (logged in test-output/gate-close/cross-edits.md).
import { describe, expect, it } from 'vitest';
import type { Nest, Sim } from '@/sim/types';
import { makeTestSim } from '@/sim/testing';
import { commandsSystem } from '@/sim/systems';
import { playerNest, setMoisture } from '../nestTestKit';
import { floodCheats } from './cheats';
import { neutralSite } from './floodTestKit';
import { floodSystem } from './index';
import { floodDiagnostic } from './diagnostics';

const run = (sim: Sim, n: number): void => { for (let i = 0; i < n; i++) sim.tick(); };
const nestOf = (sim: Sim): Nest => sim.stores.nests.get(sim.state.colonies[0].nestIds[0])!;
const card = (sim: Sim) => sim.state.progression.alerts.find((a) => a.kind === 'founding-flooding');

function sealedFounding(): Sim {
  const sim = makeTestSim({ nest: 'small', systems: [commandsSystem, floodSystem] });
  setMoisture(sim, 0.5);
  const nest = playerNest(sim);
  nest.founding = { state: 'sealed', readiness: 1, cavitySeed: { ...nest.chambers[2].center }, abandoned: [], readyTick: 0, sealedTick: 0 };
  nest.entrances[0].status = 'sealed';
  floodCheats(sim.state).drainScale = 0;
  return sim;
}

describe('founding-flooding after the opening', () => {
  it('during the opening one card that updates; no repeat count from the periodic refresh', () => {
    const sim = sealedFounding();
    nestOf(sim).flood.water = 3;
    run(sim, 2000); // eight ALERT_EVERY periods
    expect(card(sim)).toBeDefined();
    expect(card(sim)!.count).toBe(1);
  });

  it('is cleared once the nest is reopening (hand-over) and not raised again', () => {
    const sim = sealedFounding();
    const nest = nestOf(sim);
    nest.flood.water = 3;
    run(sim, 30);
    expect(card(sim)).toBeDefined();
    nest.founding!.state = 'reopening';
    run(sim, 600);
    expect(nest.chambers.some((c) => c.flooded > 0)).toBe(true);
    expect(card(sim)).toBeUndefined();
  });

  it('the flood diagnostic names the flooded brood chamber', () => {
    const sim = makeTestSim({ nest: 'small', systems: [commandsSystem, floodSystem] });
    neutralSite(sim);
    const nest = playerNest(sim);
    const royal = nest.chambers.find((c) => c.type === 'royal') ?? nest.chambers[2];
    royal.flooded = 0.4;
    const d = floodDiagnostic(sim, nest, null);
    expect(d.status).toBe('bad');
    const words: Record<string, string> = { royal: 'Royal chamber', nursery: 'Nursery', founding: "Queen's chamber" };
    expect(d.label).toBe(`${words[royal.type]} flooding`);
  });
});
