import { describe, expect, it } from 'vitest';
import { placeAvoiding, type Rect } from './promptPlacement';

const bounds = { w: 853, h: 480 };
const size = { w: 280, h: 40 };

const overlap = (p: { x: number; y: number }, r: Rect): boolean => p.x < r.x + r.w && r.x < p.x + size.w && p.y < r.y + r.h && r.y < p.y + size.h;

describe('prompt placement', () => {
  it('keeps the wanted spot when nothing is in the way', () => {
    expect(placeAvoiding({ x: 300, y: 200 }, size, bounds, 16, [])).toEqual({ x: 300, y: 200 });
  });

  it('clamps into the viewport', () => {
    expect(placeAvoiding({ x: -50, y: 900 }, size, bounds, 16, [])).toEqual({ x: 16, y: 480 - 40 - 16 });
  });

  it('slides off an alert card (the case in the review screenshot: a prompt over the second card)', () => {
    const card: Rect = { x: 501, y: 140, w: 336, h: 64 };
    const p = placeAvoiding({ x: 460, y: 150 }, size, bounds, 16, [card]);
    expect(overlap(p, card)).toBe(false);
    expect(p.x).toBeLessThan(461); // it moved left, the nearer way out
  });

  it('chooses the nearest clear spot among several regions', () => {
    const regions: Rect[] = [{ x: 16, y: 80, w: 448, h: 240 }, { x: 501, y: 84, w: 336, h: 140 }];
    const p = placeAvoiding({ x: 300, y: 150 }, size, bounds, 16, regions);
    for (const r of regions) expect(overlap(p, r)).toBe(false);
  });

  it('never leaves the viewport, even when no clear place exists', () => {
    const wall: Rect = { x: 0, y: 0, w: 853, h: 480 };
    const p = placeAvoiding({ x: 100, y: 100 }, size, bounds, 16, [wall]);
    expect(p.x).toBeGreaterThanOrEqual(16);
    expect(p.y).toBeGreaterThanOrEqual(16);
    expect(p.x + size.w).toBeLessThanOrEqual(853 - 16);
    expect(p.y + size.h).toBeLessThanOrEqual(480 - 16);
  });

  it('leaves a gap beside the region it avoids', () => {
    const card: Rect = { x: 400, y: 100, w: 200, h: 100 };
    const p = placeAvoiding({ x: 380, y: 110 }, size, bounds, 16, [card], 8);
    const clearLeft = p.x + size.w <= card.x - 8;
    const clearRight = p.x >= card.x + card.w + 8;
    const clearAbove = p.y + size.h <= card.y - 8;
    const clearBelow = p.y >= card.y + card.h + 8;
    expect(clearLeft || clearRight || clearAbove || clearBelow).toBe(true);
  });

  it('finds a place in the crowded compact layout (card, alerts, time cluster and possessed panel all up)', () => {
    const tall = { w: 240, h: 112 };
    const regions: Rect[] = [
      { x: 16, y: 16, w: 304, h: 56 }, { x: 16, y: 108, w: 464, h: 214 }, { x: 501, y: 16, w: 336, h: 56 },
      { x: 501, y: 84, w: 336, h: 140 }, { x: 16, y: 337, w: 304, h: 127 },
    ];
    const p = placeAvoiding({ x: 300, y: 130 }, tall, bounds, 16, regions);
    for (const r of regions) {
      const clear = p.x + tall.w <= r.x || p.x >= r.x + r.w || p.y + tall.h <= r.y || p.y >= r.y + r.h;
      expect(clear).toBe(true);
    }
  });

  it('with no clear place it picks the spot that covers least rather than the wanted one', () => {
    const big: Rect = { x: 0, y: 0, w: 853, h: 300 }; // the top is all taken; the bottom is free only partly
    const p = placeAvoiding({ x: 100, y: 100 }, size, bounds, 16, [big]);
    expect(p.y).toBeGreaterThanOrEqual(300); // moved below it
  });
});
