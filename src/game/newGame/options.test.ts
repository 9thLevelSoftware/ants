import { describe, expect, it } from 'vitest';
import { resolveNewGame } from './options';

describe('new game options', () => {
  it('defaults: Lasius, seed 1, naturalist, possess view, no cheats', () => {
    const r = resolveNewGame();
    expect(r.config.species).toBe('lasius-niger');
    expect(r.config.world.seed).toBe(1);
    expect(r.config.difficulty.preset).toBe('naturalist');
    expect(r.config.cheats).toBe(false);
    expect(r.view).toBe('possess');
    expect(r.world).toBeUndefined();
  });

  it('applies valid options and ignores invalid ones', () => {
    const r = resolveNewGame({ seed: 42, size: 'compact', archetype: 'woodland-edge', difficulty: 'harsh', cheats: true, view: 'observer' });
    expect(r.config.world).toMatchObject({ seed: 42, sizeClass: 'compact', archetype: 'woodland-edge', difficulty: 'harsh' });
    expect(r.config.cheats).toBe(true);
    expect(r.view).toBe('observer');
    const bad = resolveNewGame({ size: 'huge' as never, species: 'termite' as never });
    expect(bad.config.world.sizeClass).toBe('standard');
    expect(bad.config.species).toBe('lasius-niger');
  });

  it('text seeds hash deterministically', () => {
    expect(resolveNewGame({ seed: 'meadow' }).config.world.seed).toBe(resolveNewGame({ seed: 'meadow' }).config.world.seed);
    expect(resolveNewGame({ seed: '17' }).config.world.seed).toBe(17);
  });

  it('a test world is prepared instead of generated', () => {
    const r = resolveNewGame({ testWorld: { sizeBu: 96, nest: 'small', workers: 3 } });
    expect(r.world).toBeDefined();
    expect(r.world!.size).toBe(96 * r.world!.bu);
    expect(r.testWorld?.nest).toBe('small');
  });
});
