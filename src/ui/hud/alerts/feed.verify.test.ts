// Reviewer tests for the alert feed (GDD 08 3.4, 6.1, 6.3). Tests that FAIL here document a real defect for the fixer;
// the rest are regression tests of rules the implementation already meets.
import { describe, expect, it } from 'vitest';
import type { UiAlert } from '../../api';
import { ALERT_BALANCE, AlertFeed, type FeedContext } from './feed';

let nextId = 1;
const alert = (kind: string, level: UiAlert['level'], subjectId = -1, over: Partial<UiAlert> = {}): UiAlert =>
  ({ id: nextId++, kind, level, title: `${kind} title`, cause: 'cause', count: 1, subjectId, raisedTick: 0, ...over });
const ctx = (nowS: number, tick = 7000, hudHidden = false): FeedContext => ({ nowS, tick, hudHidden });

describe('AlertFeed: lifetimes and the Resolved state', () => {
  it('a notice that already left the screen (12 s) does not come back as "Resolved" when it clears', () => {
    const f = new AlertFeed();
    const a = alert('source-found', 'notice', 1);
    f.update([a], ctx(0));
    expect(f.update([a], ctx(ALERT_BALANCE.noticeRealS + 1)).cards).toHaveLength(0); // gone after its lifetime
    // the simulation clears it a minute later: the player must not see a card pop back in
    const v = f.update([], ctx(60));
    expect(v.cards).toHaveLength(0);
  });

  it('a warning that collapsed into the "+n" chip after 30 s does not reappear as a Resolved card', () => {
    const f = new AlertFeed();
    const a = alert('food-p-low', 'warning', 2);
    f.update([a], ctx(0));
    const collapsed = f.update([a], ctx(ALERT_BALANCE.warningRealS + 1));
    expect(collapsed.cards).toHaveLength(0);
    expect(collapsed.more).toBe(1);
    expect(f.update([], ctx(90)).cards).toHaveLength(0);
  });

  it('a visible card shows Resolved for 4 s (regression)', () => {
    const f = new AlertFeed();
    const a = alert('food-c-low', 'warning', 3);
    f.update([a], ctx(0));
    expect(f.update([], ctx(2)).cards[0]?.resolved).toBe(true);
    expect(f.update([], ctx(2 + ALERT_BALANCE.resolvedRealS + 0.01)).cards).toHaveLength(0);
  });
});

describe('AlertFeed: a second game in the same page', () => {
  it('a key that cleared late in an earlier game still toasts early in the next game (the tick restarts)', () => {
    // The feed is one module-level instance for the page (alerts/store.ts) and is never reset. A clear at tick 50,000
    // must not put the same kind:subject on cooldown for the first 50,000 ticks of the next colony.
    const f = new AlertFeed();
    const a = alert('food-c-low', 'warning', 7);
    f.update([a], ctx(0, 50_000));
    f.update([], ctx(1, 50_010)); // cleared
    f.update([], ctx(10, 50_020)); // Resolved card gone
    // quit to title, new game: tick starts again near 0, much later in real time
    const b = alert('food-c-low', 'warning', 7);
    const v = f.update([b], ctx(600, 300));
    expect(v.cards.map((c) => c.kind)).toContain('food-c-low');
  });

  it('a snooze set late in an earlier game does not mute the kind in the next game', () => {
    const f = new AlertFeed();
    f.snooze('source-found', 50_000);
    const v = f.update([alert('source-found', 'notice', 1)], ctx(600, 300));
    expect(v.cards).toHaveLength(1);
  });
});

describe('AlertFeed: HUD hidden (GDD 08 3.4, 6.3)', () => {
  it('only critical alerts show, as a single pinned card', () => {
    const f = new AlertFeed();
    const v = f.update([alert('queen-in-danger', 'critical', 1), alert('nest-flooding', 'critical', 2), alert('food-c-low', 'warning', 3)], ctx(0, 7000, true));
    expect(v.cards.every((c) => c.level === 'critical')).toBe(true);
    expect(v.cards).toHaveLength(1);
  });

  it('a warning raised while hidden goes to the log silently (no toast) and stays off-screen when the HUD returns', () => {
    const f = new AlertFeed();
    const a = alert('food-c-low', 'warning', 4);
    f.update([a], ctx(0, 7000, true));
    expect(f.toastLog).toHaveLength(0);
    expect(f.update([a], ctx(1, 7001, false)).cards).toHaveLength(0);
  });
});

describe('AlertFeed: escalation, snooze, critical cap (regression)', () => {
  it('an escalation of an active key re-toasts once; a plain repeat does not', () => {
    const f = new AlertFeed();
    const a = alert('garden-failing', 'warning', 5);
    f.update([a], ctx(0));
    f.update([{ ...a, count: 2 }], ctx(1));
    f.update([{ ...a, level: 'critical', count: 3 }], ctx(2));
    expect(f.toastLog.map((t) => t.why)).toEqual(['raise', 'escalate']);
  });

  it('critical kinds ignore a snooze', () => {
    const f = new AlertFeed();
    f.snooze('queen-in-danger', 7000);
    expect(f.update([alert('queen-in-danger', 'critical', 1)], ctx(0)).cards).toHaveLength(1);
  });

  it('five critical alerts: three pinned cards and "+2 more" (GDD 08 14)', () => {
    const f = new AlertFeed();
    const list = [1, 2, 3, 4, 5].map((i) => alert('nest-attacked', 'critical', i, { raisedTick: i }));
    const v = f.update(list, ctx(0));
    expect(v.cards).toHaveLength(3);
    expect(v.cards.every((c) => c.pinned)).toBe(true);
    expect(v.more).toBe(2);
    expect(v.cards.map((c) => c.key)).toEqual(['nest-attacked:5', 'nest-attacked:4', 'nest-attacked:3']); // newest first
  });

  it('the same key may not toast twice within 20 real s even at 8x (cooldown in game time already passed)', () => {
    const f = new AlertFeed();
    const a = alert('source-found', 'notice', 9);
    f.update([a], ctx(0, 10_000));
    f.update([], ctx(1, 10_001));
    f.update([], ctx(6, 10_002));
    // 3 game h later in game time (8x) but only 10 real s later
    f.update([alert('source-found', 'notice', 9)], ctx(10, 10_002 + 3 * ALERT_BALANCE.ticksPerGameHour + 1));
    expect(f.toastLog).toHaveLength(1);
  });
});
