// Review note (int-1B-app): the continued game's feed showed "+1 more" where the frame before the save did not,
// with the same state hash. The toasts are real-time presentation (GDD 08 §6.3: lifetimes in real seconds, snooze
// "session only (not saved)"): in the live session a notice had already left after its 12 s, while the continued
// session sees every active alert once. This pins that behaviour down: same alerts, two sessions, two honest feeds.
import { describe, expect, it } from 'vitest';
import type { UiAlert } from '../../api';
import { ALERT_BALANCE, AlertFeed } from './feed';

const A = (id: number, kind: string, level: UiAlert['level']): UiAlert =>
  ({ id, kind, level, title: `${kind} title`, cause: 'cause', count: 1, subjectId: 0, raisedTick: id });
const ACTIVE = [A(1, 'source-found', 'notice'), A(2, 'food-p-low', 'warning'), A(3, 'brood-stalled', 'warning'), A(4, 'colony-starving', 'critical')];

describe('alert feed across a save and continue', () => {
  it('live: the notice has left after its lifetime; continued: the same active alerts all show once', () => {
    const live = new AlertFeed();
    live.update(ACTIVE.slice(0, 1), { nowS: 0, tick: 7000, hudHidden: false });
    const t = ALERT_BALANCE.noticeRealS + 1;
    const before = live.update(ACTIVE, { nowS: t, tick: 7100, hudHidden: false });
    expect(before.cards.map((c) => c.kind)).not.toContain('source-found');
    expect(before.more).toBe(0);

    const continued = new AlertFeed(); // a new page session after Continue, same simulation tick and alerts
    const after = continued.update(ACTIVE, { nowS: 500, tick: 7100, hudHidden: false });
    expect(after.cards).toHaveLength(ALERT_BALANCE.maxVisible);
    expect(after.more).toBe(1); // the notice is the fourth card, behind the chip
  });
});
