// The queen's danger card is one sim kind with three causes; its title must be true for each (GDD 08 deviation D-APP3-1).
import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import { raiseAlert } from '@/sim/progression';
import { alertText } from '@/content/text';
import { alertsOf } from '../uiBridge';

const raise = (title: string, cause: string, tokens: Record<string, string | number>) => {
  const sim = makeTestSim({ nest: 'small', workers: 6 });
  const op = sim.state.player.opening;
  if (op) { op.done = true; op.phase = 'done'; }
  raiseAlert(sim, { kind: 'queen-in-danger', level: 'critical', title, cause, subjectId: 1, focus: null, diagnosticId: null, tokens });
  return alertsOf(sim).find((x) => x.kind === 'queen-in-danger')!;
};

describe('queen-in-danger wording', () => {
  it('rising water is not an attack', () => {
    const c = raise('', '', { attacker: 'rising water', where: 'royal chamber' });
    expect(c.title).toBe('Queen in danger');
    expect(c.cause).toBe('rising water, royal chamber');
  });
  it('a creature is an attack', () => {
    const c = raise('', '', { attacker: 'wolf spider', where: 'royal chamber' });
    expect(c.title).toBe('Queen under attack');
    expect(c.cause).toBe('wolf spider, royal chamber');
  });
  it("the combat module's card (title and cause words from the sim) is worded from its cause token", () => {
    const hurt = raise('The queen is in danger', 'damage', { cause: 'damage' });
    expect([hurt.title, hurt.cause]).toEqual(['Queen under attack', 'she has been hurt']);
    const near = raise('The queen is in danger', 'hostile-near', { cause: 'hostile-near' });
    expect([near.title, near.cause]).toEqual(['Queen in danger', 'an enemy is close to her']);
  });
  it('the journal line uses the same words', () => {
    expect(alertText('queen-in-danger', { attacker: 'rising water', where: 'the nest' }).title).toBe('Queen in danger');
  });
});
