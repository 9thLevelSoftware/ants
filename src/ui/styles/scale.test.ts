import { describe, expect, it } from 'vitest';
import { computeScale, snapUiScale } from './scale';

const at = (w: number, h: number, ui = 1, text = 1) => computeScale({ viewportW: w, viewportH: h, uiScale: ui, textScale: text });

describe('UI scale (GDD 08 2.3)', () => {
  it('root font is 16 px at the reference viewport and scales with the window', () => {
    expect(at(1280, 720).rootPx).toBeCloseTo(16, 6);
    expect(at(1920, 1080).rootPx).toBeCloseTo(24, 6);
    expect(at(640, 360).autoScale).toBe(0.75); // clamped
    expect(at(8000, 4500).autoScale).toBe(2.5); // clamped
  });

  it('UI scale 150 % at 1280 x 720 gives a 24 px root and the compact layout (Appendix E check 2)', () => {
    const s = at(1280, 720, 1.5);
    expect(s.rootPx).toBeCloseTo(24, 6);
    expect(s.dpW).toBeCloseTo(853.3, 0);
    expect(s.layout).toBe('compact');
  });

  it('standard layout needs 960 x 540 dp, too-small is below 640 x 360 dp', () => {
    expect(at(1280, 720, 1).layout).toBe('standard');
    expect(at(1280, 720, 0.8).layout).toBe('standard'); // 1600 x 900 dp
    expect(at(1920, 1080, 1).layout).toBe('standard'); // 1280 x 720 dp
    expect(at(1920, 1080, 1.5).layout).toBe('compact'); // 853 x 480 dp
    expect(at(640, 360, 1).layout).toBe('compact'); // autoScale is clamped to 0.75: 853 x 480 dp
    expect(at(400, 225, 1).layout).toBe('too-small'); // 533 x 300 dp
  });

  it('the too-small limit is measured in dp and is inclusive', () => {
    expect(at(480, 270, 1).layout).toBe('compact'); // exactly 640 x 360 dp
    expect(at(479, 270, 1).layout).toBe('too-small');
  });

  it('UI scale snaps to 0.1 steps within 0.8-1.5; text scale only takes the three values', () => {
    expect(snapUiScale(0.123)).toBe(0.8);
    expect(snapUiScale(1.04)).toBe(1);
    expect(snapUiScale(9)).toBe(1.5);
    expect(at(1280, 720, 1, 1.15).textScale).toBe(1.15);
    expect(at(1280, 720, 1, 1.2).textScale).toBe(1);
  });
});
