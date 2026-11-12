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

describe('fresh walls lookup structure', () => {
  it('agrees with a linear scan for many edits, negative coordinates, large boxes and out-of-order ticks', () => {
    const f = new FreshWalls(250, 2, 32);
    const boxes: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; tick: number }[] = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 600; i++) {
      const s = i % 50 === 0 ? 150 : 3 + rnd() * 6; // a few huge boxes go to the shared list
      const x = rnd() * 400 - 200, y = -rnd() * 200, z = rnd() * 400 - 200;
      const tick = i === 300 ? 10 : Math.floor(i / 3); // one tick out of order
      const e = { kind: 'carve' as const, x0: x - s, y0: y - s, z0: z - s, x1: x + s, y1: y + s, z1: z + s };
      f.add(e, tick);
      boxes.push({ x0: e.x0 - 2, y0: e.y0 - 2, z0: e.z0 - 2, x1: e.x1 + 2, y1: e.y1 + 2, z1: e.z1 + 2, tick });
    }
    const scan = (x: number, y: number, z: number, minTick: number) => {
      let t = NOT_FRESH;
      for (const b of boxes) if (b.tick >= minTick && b.tick > t && x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1 && z >= b.z0 && z <= b.z1) t = b.tick;
      return t;
    };
    for (let i = 0; i < 2000; i++) {
      const x = rnd() * 440 - 220, y = -rnd() * 220, z = rnd() * 440 - 220;
      expect(f.carvedAt(x, y, z)).toBe(scan(x, y, z, -Infinity));
    }
    f.prune(350); // drops ticks < 100
    expect(f.size).toBe(boxes.filter((b) => b.tick >= 100).length);
    for (let i = 0; i < 2000; i++) {
      const x = rnd() * 440 - 220, y = -rnd() * 220, z = rnd() * 440 - 220;
      expect(f.carvedAt(x, y, z)).toBe(scan(x, y, z, 100));
    }
  });
});
