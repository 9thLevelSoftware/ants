// The opening's overlay is not rendered in photo view (it used to be hidden by a CSS rule only).
import { describe, expect, it } from 'vitest';
import { foundingShown } from './FoundingOverlay';

describe('foundingShown', () => {
  it('draws in play, paused and epitaph, never in photo view', () => {
    for (const screen of ['playing', 'paused', 'epitaph']) {
      expect(foundingShown(screen, 'possess')).toBe(true);
      expect(foundingShown(screen, 'observer')).toBe(true);
      expect(foundingShown(screen, 'photo')).toBe(false);
    }
    expect(foundingShown('title', 'observer')).toBe(false);
  });
});
