import { describe, expect, it } from 'vitest';
import { FreshWalls } from './freshWalls';
import { NOT_FRESH } from '../mesh/chunkBuild';

describe('fresh walls (GDD 08 11.5)', () => {
  it('remembers the newest carving tick inside recent carve boxes and forgets them after the fresh period', () => {
    const f = new FreshWalls(250, 2);
    f.add({ kind: 'carve', x0: 0, y0: 0, z0: 0, x1: 10, y1: 10, z1: 10 }, 100);
    f.add({ kind: 'carve', x0: 5, y0: 5, z0: 5, x1: 20, y1: 20, z1: 20 }, 150);
    f.add({ kind: 'fill', x0: 0, y0: 0, z0: 0, x1: 100, y1: 100, z1: 100 }, 160); // fills are not fresh walls
    expect(f.carvedAt(1, 1, 1)).toBe(100);
    expect(f.carvedAt(8, 8, 8)).toBe(150);
    expect(f.carvedAt(11.5, 1, 1)).toBe(100); // within the pad
    expect(f.carvedAt(50, 50, 50)).toBe(NOT_FRESH);
    f.prune(380); // 100 is older than 250 ticks, 150 is not
    expect(f.size).toBe(1);
    expect(f.carvedAt(1, 1, 1)).toBe(NOT_FRESH);
  });
});
