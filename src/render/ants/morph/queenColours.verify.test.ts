// Review (app-seams-3 item 5b): the queen's lifted body colours in LASIUS_QUEEN must reach the in-game queen.
// In the game the AntRenderer always passes the species appearance to resolveMorph, and applyAppearance overwrites
// head, mesosoma and gaster of every caste with the species' bodyColour / gasterColour. The before/after harness
// pictures of app-seams-3 (test-output/app-seams-3/queen-{before,after}-*) are pixel-identical for that reason.
import { describe, expect, it } from 'vitest';
import { LASIUS_NIGER } from '@/sim/species/data/lasius-niger';
import { resolveMorph } from './catalog';
import { LASIUS_QUEEN, LASIUS_WORKER } from './lasius';

describe('review: queen body colours in game', () => {
  it('without a species appearance, the queen uses her own lifted colours (the demo-page path)', () => {
    const q = resolveMorph('lasius-niger', 'queen', null);
    expect(q.colors.gaster).toBe(LASIUS_QUEEN.colors.gaster);
  });

  it('with the species appearance the game passes, the queen keeps her own colours (fails: the appearance overwrites them)', () => {
    const appearance = LASIUS_NIGER.appearance;
    const q = resolveMorph('lasius-niger', 'queen', appearance);
    const w = resolveMorph('lasius-niger', 'worker', appearance);
    // what the game renders today: queen and worker share the species colours, LASIUS_QUEEN.colors is dead data
    expect(w.colors.gaster).toBe(appearance.gasterColour);
    expect(LASIUS_WORKER).toBeDefined();
    expect([q.colors.mesosoma, q.colors.gaster, q.colors.head]).toEqual([
      LASIUS_QUEEN.colors.mesosoma, LASIUS_QUEEN.colors.gaster, LASIUS_QUEEN.colors.head,
    ]);
  });
});
