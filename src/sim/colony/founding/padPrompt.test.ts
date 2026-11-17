// The founding opening played by pad (gate-close-app S3, S6): the E/A line must offer the act the phase asks for.
// S6: in phase `seal` the line read "Put down soil pellet" until the queen stood in the throat (the press is the seal
// guide's, wherever she stands), and "Open entrance" came up right after sealing. S3: in phase `lay` the line turned to
// "Pick up egg" after the first batch (brood class 7 above the queen's lay, class 9), so the time-lapse could not be
// reached by pad. Flat loam throat of sealKit.ts.
import { describe, expect, it } from 'vitest';
import { currentPrompt, promptView } from '@/sim/ants/player/prompt';
import { promptCandidates } from '@/sim/ants/player/targeting';
import { phase, pinTemperature, queen, stepUntil } from './testkit';
import { throatCase } from './sealKit';

describe('founding prompts by pad', () => {
  it('seal phase: "Seal entrance" from the cell floor; after sealing no "Open entrance" first; lay phase: "Lay egg" over the eggs', () => {
    const c = throatCase({ pitchDeg: 55, widthBu: 2.1, soil: 'loam' });
    const sim = c.sim, q = queen(sim);
    pinTemperature(sim, 22);
    sim.enqueue({ type: 'possess', antId: q.id });
    sim.tick(); sim.tick(); sim.tick();
    expect(phase(sim)).toBe('seal');
    expect(currentPrompt(sim, q)?.actionId, JSON.stringify(promptView(sim, q).primary)).toBe('seal-entrance');
    expect(promptView(sim, q).primary?.text).toBe('Seal entrance');
    // press once: the guide seals
    sim.enqueue({ type: 'action', actionId: 'seal-entrance', phase: 'start' });
    stepUntil(sim, () => phase(sim) !== 'seal', 4000);
    expect(phase(sim)).toBe('lay');
    // wherever the guide left her (often in the throat), the first line is not the reopening
    for (let i = 0; i < 5; i++) sim.tick();
    expect(currentPrompt(sim, q)?.actionId).not.toBe('unseal-entrance');
    // back on the cell floor: lay a batch, then the line stays "Lay egg" with the eggs in reach while she can lay
    sim.enqueue({ type: 'cheat.teleport', antId: q.id, pos: c.floor });
    for (let i = 0; i < 5; i++) sim.tick();
    let laid = 0;
    for (let n = 0; n < 6 && laid < 2; n++) {
      if (currentPrompt(sim, q)?.actionId !== 'lay-egg' || !currentPrompt(sim, q)?.ok) { for (let i = 0; i < 50; i++) sim.tick(); continue; }
      const eggs0 = sim.state.brood.filter((b) => b.alive && b.stage === 'egg').length;
      sim.enqueue({ type: 'action', actionId: 'lay-egg', phase: 'start' });
      stepUntil(sim, () => sim.state.brood.filter((b) => b.alive && b.stage === 'egg').length > eggs0, 600);
      for (let i = 0; i < 5; i++) sim.tick();
      if (sim.state.brood.filter((b) => b.alive && b.stage === 'egg').length > eggs0) laid++;
    }
    expect(laid).toBe(2);
    // right after a batch, with her eggs in reach: still "Lay egg" (greyed while she cannot lay yet), never "Pick up egg"
    const eggsInReach = promptCandidates(sim, q).filter((x) => x.target.kind === 'brood').length;
    expect(eggsInReach).toBeGreaterThan(0);
    for (let i = 0; i < 300; i++) {
      sim.tick();
      expect(currentPrompt(sim, q)?.actionId, `tick ${i}`).toBe('lay-egg');
    }
  }, 120_000);
});
