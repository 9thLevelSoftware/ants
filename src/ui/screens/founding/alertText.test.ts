// No empty alert cards in the opening (task founding-close §4): every alert kind the simulation can raise has words,
// and an alert that arrives without a title (the sim's `last-ants` today) never becomes an empty card or toast.
import { describe, expect, it } from 'vitest';
import { ALERT_KINDS } from '@/sim/types';
import { ALERT_TEXT } from '@/content/text/alerts';
import { AlertFeed } from '@/ui/hud/alerts/feed';

describe('alert words (GDD 08 §6.5)', () => {
  it('every alert kind the sim can raise has a title and a cause line in the text table', () => {
    const missing = ALERT_KINDS.filter((k) => !ALERT_TEXT[k] || !ALERT_TEXT[k].title.trim() || ALERT_TEXT[k].cause === undefined);
    expect(missing).toEqual([]);
  });

  it('an alert raised with no title is kept in the log: no card, no toast', () => {
    const f = new AlertFeed();
    const v = f.update([{ id: 1, kind: 'last-ants', level: 'critical', title: '', cause: '', count: 1, subjectId: -1, raisedTick: 4 }],
      { nowS: 0, tick: 4, hudHidden: false });
    expect(v.cards).toHaveLength(0);
    expect(f.toastLog).toHaveLength(0);
    const w = f.update([{ id: 2, kind: 'food-c-low', level: 'warning', title: 'Carbohydrate stores low', cause: '1 day', count: 1, subjectId: 0, raisedTick: 5 }],
      { nowS: 1, tick: 5, hudHidden: false });
    expect(w.cards.map((c) => c.title)).toEqual(['Carbohydrate stores low']);
  });
});
