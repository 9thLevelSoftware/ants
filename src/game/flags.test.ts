import { describe, expect, it } from 'vitest';
import { parseGameFlags } from './flags';

describe('URL flags (architecture §5)', () => {
  it('test mode implies test quality and cheats', () => {
    const f = parseGameFlags('?test=1&autostart=1&seed=1');
    expect(f).toMatchObject({ test: true, autostart: true, quality: 'test', forceDebugRender: false });
    expect(f.newGame).toEqual({ seed: 1, cheats: true });
  });

  it('reads species, archetype, size, view and quality', () => {
    const f = parseGameFlags('?seed=abc&quality=low&species=lasius-niger&archetype=kitchen-door&size=large&view=observer&render=debug');
    expect(f.quality).toBe('low');
    expect(f.forceDebugRender).toBe(true);
    expect(f.newGame).toEqual({ seed: 'abc', species: 'lasius-niger', archetype: 'kitchen-door', size: 'large', view: 'observer' });
  });

  it('defaults without flags', () => {
    expect(parseGameFlags('')).toMatchObject({ test: false, autostart: false, quality: 'auto', post: null, newGame: {} });
  });
});
