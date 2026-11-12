import { describe, expect, it } from 'vitest';
import { frameAround, partition, type Span2 } from './partition';

const area = (s: Span2) => (s.a1 - s.a0) * (s.y1 - s.y0);
const overlap = (p: Span2, q: Span2) => Math.max(0, Math.min(p.a1, q.a1) - Math.max(p.a0, q.a0)) * Math.max(0, Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0));

describe('wall partition', () => {
  it('covers the rect minus the holes exactly, without overlaps', () => {
    const rect = { a0: 0, a1: 10000, y0: -100, y1: 2370 };
    const holes = [
      { a0: 2000, a1: 3040, y0: -100, y1: 2250 }, // door
      { a0: 5000, a1: 6100, y0: 1050, y1: 2250 }, // window
      { a0: 5300, a1: 5370, y0: 185, y1: 255 }, // pipe
      ...[...Array(8).keys()].map((i) => ({ a0: 6500 + i * 900, a1: 6510 + i * 900, y0: 150, y1: 215 })), // vents
    ];
    const boxes = partition(rect, holes);
    const want = area(rect) - holes.reduce((s, h) => s + area({ ...h, a1: Math.min(h.a1, rect.a1) }), 0);
    expect(boxes.reduce((s, b) => s + area(b), 0)).toBeCloseTo(want, 3);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i], boxes[j])).toBe(0);
    for (const b of boxes) for (const h of holes) expect(overlap(b, h)).toBe(0);
    // vertical merging keeps the box count small (bands: below vents, vent course, up to window, window, above)
    expect(boxes.length).toBeLessThan(40);
  });

  it('frames a hole with a closer band', () => {
    const rect = { a0: 0, a1: 1000, y0: 0, y1: 1000 };
    const hole = { a0: 400, a1: 500, y0: 400, y1: 500 };
    const ring = frameAround(rect, hole, 50);
    expect(ring.reduce((s, b) => s + area(b), 0)).toBeCloseTo(200 * 200 - 100 * 100, 6);
    for (const b of ring) expect(overlap(b, hole)).toBe(0);
  });
});
