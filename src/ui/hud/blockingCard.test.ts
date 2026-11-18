import { describe, expect, it } from 'vitest';
import type { FoundingUi } from '../screens/founding/store';
import type { WinterUi } from '../screens/overwinter/store';
import { isBlockingCardUp } from './blockingCard';

const founding = (o: Partial<FoundingUi>): FoundingUi => ({ phase: 'search', outcome: null, failure: null, ...o } as FoundingUi);

describe('isBlockingCardUp (context prompts stay hidden under a card)', () => {
  it('the opening: the intro card and the time-lapse block, the free phases do not', () => {
    expect(isBlockingCardUp(founding({ phase: 'intro-card' }), null, null)).toBe(true);
    expect(isBlockingCardUp(founding({ phase: 'timelapse' }), null, null)).toBe(true);
    for (const phase of ['dealation', 'search', 'dig', 'seal', 'lay', 'handover']) expect(isBlockingCardUp(founding({ phase }), null, null)).toBe(false);
  });
  it('the hand-over banner blocks while it is up (the hint and prompt cards share its band)', () => {
    expect(isBlockingCardUp(founding({ phase: 'handover', handover: { aims: ['x'] } }), null, null)).toBe(true);
    expect(isBlockingCardUp(founding({ phase: 'handover', handover: null }), null, null)).toBe(false);
  });
  it('the result and failure cards block', () => {
    expect(isBlockingCardUp(founding({ outcome: { workers: 3, reserves: 0.2 } }), null, null)).toBe(true);
    expect(isBlockingCardUp(founding({ failure: { cause: 'x', text: 'y', retriesLeft: 1 } }), null, null)).toBe(true);
  });
  it('winter screens and the flight prompts block; the possessed flight read-out does not', () => {
    expect(isBlockingCardUp(null, { phase: 'banner' } as WinterUi, null)).toBe(true);
    expect(isBlockingCardUp(null, null, { ask: { p: 0.5 }, launch: null, flying: null, ended: null })).toBe(true);
    expect(isBlockingCardUp(null, null, { ask: null, launch: null, flying: { phase: 'x' } as never, ended: null })).toBe(false);
    expect(isBlockingCardUp(null, null, null)).toBe(false);
  });
});
