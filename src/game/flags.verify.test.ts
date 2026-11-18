// app-seams-2 review, item 7: `&species=<id>` only in test mode.
import { describe, expect, it } from 'vitest';
import { parseGameFlags } from './flags';

describe('species flag (review)', () => {
  it('ignored without test=1, honoured with it', () => {
    expect(parseGameFlags('?species=atta-texana&autostart=1').newGame.species).toBeUndefined();
    expect(parseGameFlags('?test=0&species=atta-texana').newGame.species).toBeUndefined();
    expect(parseGameFlags('?test=1&species=atta-texana').newGame.species).toBe('atta-texana');
  });
  it('other new-game flags still work without test mode', () => {
    const f = parseGameFlags('?seed=12&archetype=kitchen-door&species=messor-barbarus');
    expect(f.newGame.seed).toBe(12);
    expect(f.newGame.archetype).toBe('kitchen-door');
    expect(f.newGame.species).toBeUndefined();
    expect(f.newGame.cheats).toBeUndefined();
  });
});
