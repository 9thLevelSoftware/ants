// The pure parts of the gamepad route to the tool UI (the DOM part is exercised by tests/e2e/panels.mjs on the real game).
import { describe, expect, it } from 'vitest';
import { isViewTap, stickDir, VIEW_TAP_MS } from './toolsPad';

describe('View tap', () => {
  it('a short press is a tap, a hold of the input layer (500 ms) is not', () => {
    expect(isViewTap(120, false)).toBe(true);
    expect(isViewTap(VIEW_TAP_MS - 1, false)).toBe(true);
    expect(isViewTap(500, false)).toBe(false);
    expect(isViewTap(2000, false)).toBe(false);
  });
  it('LB + View belongs to the alert feed', () => {
    expect(isViewTap(100, true)).toBe(false);
  });
  it('a press with no known start is not a tap', () => {
    expect(isViewTap(-5, false)).toBe(false);
  });
});

describe('stick direction', () => {
  it('has a dead zone and picks the dominant axis', () => {
    expect(stickDir(0.3, 0.3)).toBeNull();
    expect(stickDir(0.9, 0.2)).toBe('right');
    expect(stickDir(-0.9, 0.2)).toBe('left');
    expect(stickDir(0.1, -0.8)).toBe('up');
    expect(stickDir(0.1, 0.8)).toBe('down');
  });
});
