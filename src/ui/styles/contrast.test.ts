import { describe, expect, it } from 'vitest';
import { compositeOver, contrastReport, contrastRatio, parseHex, tokenColor } from './contrast';
import { COLORS } from './tokens';

describe('contrast maths', () => {
  it('white on black is 21:1 and identical colours are 1:1', () => {
    expect(contrastRatio([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 5);
    expect(contrastRatio([10, 20, 30], [10, 20, 30])).toBeCloseTo(1, 5);
  });
  it('composites a semi-opaque panel over white (the worst case)', () => {
    const c = compositeOver(COLORS.panel, [255, 255, 255]);
    // 0.9 * #16130F + 0.1 * white
    expect(c[0]).toBeCloseTo(0.9 * 0x16 + 25.5, 5);
    expect(parseHex('#16130F')).toEqual([0x16, 0x13, 0x0f]);
  });
});

describe('WCAG AA over the token pairs (GDD 08 2.1, Appendix E check 3)', () => {
  for (const high of [false, true]) {
    it(`every pair passes in ${high ? 'high-contrast' : 'normal'} mode`, () => {
      const rows = contrastReport(high);
      const failing = rows.filter((r) => !r.pass).map((r) => `${r.pair}: ${r.ratio.toFixed(2)} < ${r.min}`);
      expect(failing).toEqual([]);
    });
  }

  it('text tokens reach 4.5 and boundaries 3 against the worst-case panel', () => {
    const rows = contrastReport(false);
    const get = (pair: string) => rows.find((r) => r.pair === pair)!;
    for (const t of ['text', 'text-2', 'text-3', 'status-ok', 'status-watch', 'status-warn', 'status-bad']) {
      expect(get(`${t} on panel`).ratio).toBeGreaterThanOrEqual(4.5);
    }
    expect(get('border-strong on panel').ratio).toBeGreaterThanOrEqual(3);
    expect(get('focus on panel').ratio).toBeGreaterThanOrEqual(3);
  });

  it('matches the chapter table for the primary text token (11.5 worst)', () => {
    const r = contrastReport(false).find((x) => x.pair === 'text on panel')!;
    expect(r.ratio).toBeGreaterThan(11);
    expect(r.ratio).toBeLessThan(12);
  });

  it('high contrast replaces panel, text and accent as GDD 08 2.1 says', () => {
    expect(tokenColor('panel', true).hex).toBe('#000000');
    expect(tokenColor('text', true).hex).toBe('#FFFFFF');
    expect(tokenColor('accent', true).hex).toBe('#FFD400');
    expect(tokenColor('status-ok', true).hex).toBe(COLORS['status-ok'].hex);
  });
});
