// Overlay catalogue: exclusivity rules, the O cycle, legends with distinct patterns in every palette (GDD 08 App. E check
// 19), scales that match the chapter (task ui-panels).
import { describe, expect, it } from 'vitest';
import { applyOverlay, cycleOverlay, EXCLUSIVE_OVERLAYS, inkFor, isActive, legendFor, OVERLAY_IDS, PATTERN_IDS, type OverlaySet } from './catalogue';

const off: OverlaySet = { scent: false, other: null };

describe('state rules', () => {
  it('scent combines with one other overlay; the others replace each other', () => {
    let s = applyOverlay(off, 'scent', true);
    s = applyOverlay(s, 'temperature', true);
    expect(s).toEqual({ scent: true, other: 'temperature' });
    s = applyOverlay(s, 'moisture', true);
    expect(s).toEqual({ scent: true, other: 'moisture' });
    s = applyOverlay(s, 'moisture', false);
    expect(s).toEqual({ scent: true, other: null });
    expect(applyOverlay(s, 'threats', false)).toEqual(s);
  });
  it('the O key cycles temperature, moisture, threats, dig plans, off, and leaves scent alone', () => {
    let s: OverlaySet = { scent: true, other: null };
    const seen: (string | null)[] = [];
    for (let i = 0; i < EXCLUSIVE_OVERLAYS.length + 1; i++) { s = cycleOverlay(s); seen.push(s.other); }
    expect(seen).toEqual(['temperature', 'moisture', 'threats', 'dig-plans', null]);
    expect(s.scent).toBe(true);
  });
  it('isActive reads both slots', () => {
    const s: OverlaySet = { scent: true, other: 'threats' };
    expect(OVERLAY_IDS.filter((id) => isActive(s, id))).toEqual(['scent', 'threats']);
  });
});

describe('legends', () => {
  it('the scent legend has trail, home, alarm and food odour, each with its own pattern (check 19)', () => {
    const L = legendFor('scent');
    const p = L.entries.map((e) => [e.id, e.pattern]);
    expect(p.slice(0, 4)).toEqual([['trail', 'chevron'], ['home', 'stipple'], ['alarm', 'zigzag'], ['food', 'rings']]);
    expect(new Set(L.entries.map((e) => e.pattern)).size).toBe(L.entries.length);
  });
  it('patterns identify entries in every palette, including pattern-only where all inks are one colour', () => {
    for (const pal of ['okabe-ito', 'high-contrast', 'pattern-only'] as const) {
      const L = legendFor('scent');
      const inks = L.entries.map((e, i) => inkFor(pal, e.hue, i));
      if (pal === 'pattern-only') expect(new Set(inks).size).toBe(1);
      if (pal === 'okabe-ito') expect(new Set(inks).size).toBe(L.entries.length);
      expect(new Set(L.entries.map((e) => e.pattern)).size).toBe(L.entries.length);
    }
  });
  it('every pattern used is one the swatches can draw', () => {
    for (const id of OVERLAY_IDS) for (const e of legendFor(id).entries) expect(PATTERN_IDS).toContain(e.pattern);
  });
  it('temperature: diverging cold to hot, ticks in degrees, the species comfort band marked', () => {
    const L = legendFor('temperature', { lo: 22, hi: 27 });
    expect(L.scale?.stops).toEqual(['#0072B2', '#F2EFE6', '#D55E00']);
    expect(L.scale?.caption).toBe('°C');
    expect(L.scale?.band?.label).toBe('Brood 22-27 °C');
    expect(L.scale!.band!.to).toBeGreaterThan(L.scale!.band!.from);
    expect(legendFor('temperature').scale?.band).toBeUndefined();
  });
  it('moisture: contours at 25, 50 and 75 %, flooded drawn with waves', () => {
    const L = legendFor('moisture');
    expect(L.scale?.ticks.map((t) => t.label)).toEqual(['25 %', '50 %', '75 %']);
    expect(L.entries[0].pattern).toBe('waves');
  });
  it('dig plans: the five statuses of GDD 08 4.3 with outline patterns', () => {
    const L = legendFor('dig-plans');
    expect(L.entries.map((e) => e.id)).toEqual(['proposed', 'queued', 'active', 'stalled', 'paused']);
    expect(L.entries.find((e) => e.id === 'stalled')?.pattern).toBe('cross-hatch');
  });
});
