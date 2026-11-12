import { describe, expect, it } from 'vitest';
import { ICON_PATHS, REQUIRED_ICON_IDS } from './paths';

describe('icon set (GDD 08 2.5)', () => {
  it('covers every required icon', () => {
    const missing = REQUIRED_ICON_IDS.filter((id) => !ICON_PATHS[id]);
    expect(missing).toEqual([]);
  });
  it('has no duplicates in the required list and every entry is drawn markup', () => {
    expect(new Set(REQUIRED_ICON_IDS).size).toBe(REQUIRED_ICON_IDS.length);
    for (const [id, body] of Object.entries(ICON_PATHS)) {
      expect(body.length, id).toBeGreaterThan(10);
      expect(body.trim().startsWith('<'), id).toBe(true);
      // balanced tags: every <path .../> / <circle ... /> is self-closed or paired
      const opens = (body.match(/<(path|circle|ellipse|rect|g)\b/g) ?? []).length;
      const closes = (body.match(/\/>|<\/g>/g) ?? []).length;
      expect(closes, id).toBeGreaterThanOrEqual(opens - (body.match(/<g\b/g) ?? []).length);
    }
  });
  it('uses no remote references (icons are bundled)', () => {
    for (const body of Object.values(ICON_PATHS)) expect(body).not.toMatch(/https?:|xlink:href|<image/);
  });
  it('has the helper icons the components use', () => {
    for (const id of ['chevron-down', 'chevron-right', 'check', 'plus', 'minus', 'dice', 'reset', 'fullscreen']) expect(ICON_PATHS[id], id).toBeTruthy();
  });
});
