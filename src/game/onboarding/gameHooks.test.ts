import { describe, expect, it } from 'vitest';
import { hookMethod } from './gameHooks';

describe('hookMethod', () => {
  it('wraps a prototype method, calls it with the original this, and takes the instance override away on unhook', () => {
    class G { n = 3; add(x: number): number { return this.n + x; } }
    const g = new G();
    const calls: number[] = [];
    const off = hookMethod(g, 'add', (raw) => ((x: number) => { calls.push(x); return (raw as (x: number) => number).call(g, x); }) as never);
    expect(g.add(4)).toBe(7);
    expect(calls).toEqual([4]);
    off();
    expect(Object.prototype.hasOwnProperty.call(g, 'add')).toBe(false);
    expect(g.add(1)).toBe(4);
    expect(calls).toEqual([4]);
  });

  it('keeps wrapping a method that is assigned later (the persistence module adds resetHints after boot) and restores it', () => {
    const g: { resetHints?: () => void } = {};
    const seen: string[] = [];
    const off = hookMethod(g, 'resetHints', (raw) => (() => { (raw as (() => void) | undefined)?.(); seen.push('hook'); }) as never);
    g.resetHints!(); // nothing assigned yet: the hook still runs
    Object.assign(g, { resetHints: () => { seen.push('original'); } });
    g.resetHints!();
    expect(seen).toEqual(['hook', 'original', 'hook']);
    off();
    seen.length = 0;
    g.resetHints!();
    expect(seen).toEqual(['original']); // the later-assigned method is back as a plain property
  });

  it('removes itself completely when nothing was ever assigned', () => {
    const g: { f?: () => void } = {};
    const off = hookMethod(g, 'f', () => (() => {}) as never);
    off();
    expect('f' in g).toBe(false);
  });
});
