import { describe, expect, it } from 'vitest';
import type { UiAlert } from '../../api';
import { ALERT_BALANCE, AlertFeed, type FeedContext } from './feed';

let nextId = 1;
const alert = (kind: string, level: UiAlert['level'], subjectId = -1, over: Partial<UiAlert> = {}): UiAlert =>
  ({ id: nextId++, kind, level, title: `${kind} title`, cause: 'cause', count: 1, subjectId, raisedTick: 0, ...over });
const ctx = (nowS: number, tick = 7000, hudHidden = false): FeedContext => ({ nowS, tick, hudHidden });

describe('AlertFeed (GDD 08 6.3)', () => {
  it('shows a new alert as a card and records one toast', () => {
    const f = new AlertFeed();
    const v = f.update([alert('food-c-low', 'warning')], ctx(0));
    expect(v.cards).toHaveLength(1);
    expect(f.toastLog).toHaveLength(1);
  });

  it('E4: five repeats of one key give one card with the latest count and one toast', () => {
    const f = new AlertFeed();
    const a = alert('food-c-low', 'warning', 3);
    for (let i = 1; i <= 5; i++) f.update([{ ...a, count: i }], ctx(i));
    const v = f.update([{ ...a, count: 5 }], ctx(6));
    expect(v.cards).toHaveLength(1);
    expect(v.cards[0].count).toBe(5);
    expect(f.toastLog).toHaveLength(1);
  });

  it('E5: six distinct notices in 10 s give 3 cards, +3 more, and at most 4 toasts', () => {
    const f = new AlertFeed();
    let v = f.update([], ctx(0));
    const active: UiAlert[] = [];
    for (let i = 0; i < 6; i++) { active.push(alert('source-found', 'notice', 100 + i)); v = f.update(active, ctx(i * 1.5)); }
    expect(v.cards).toHaveLength(3);
    expect(v.more).toBe(3); // one collapsed card and two toasts the rate limit sent to the log
    expect(f.toastLog.length).toBeLessThanOrEqual(4);
    expect(f.toastLog).toHaveLength(4);
  });

  it('critical alerts are exempt from the rate limit and sort first', () => {
    const f = new AlertFeed();
    const active: UiAlert[] = [];
    for (let i = 0; i < 5; i++) active.push(alert('source-found', 'notice', i));
    f.update(active, ctx(0));
    active.push(alert('queen-in-danger', 'critical', 9));
    const v = f.update(active, ctx(1));
    expect(v.cards[0].kind).toBe('queen-in-danger');
    expect(v.cards[0].pinned).toBe(true);
  });

  it('shows Resolved for 4 s after a clear, then drops the card', () => {
    const f = new AlertFeed();
    const a = alert('food-p-low', 'warning', 1);
    f.update([a], ctx(0));
    const during = f.update([], ctx(1));
    expect(during.cards[0].resolved).toBe(true);
    const after = f.update([], ctx(1 + ALERT_BALANCE.resolvedRealS + 0.1));
    expect(after.cards).toHaveLength(0);
  });

  it('a raise within the game-time cooldown after a clear goes to the log only', () => {
    const f = new AlertFeed();
    f.update([alert('nest-crowded', 'notice', 2)], ctx(0, 7000));
    f.update([], ctx(1, 7000));
    f.update([], ctx(6, 7050)); // card gone
    const v = f.update([alert('nest-crowded', 'notice', 2)], ctx(60, 7050 + 100)); // 100 ticks = 0.4 game h < 3 h
    expect(v.cards).toHaveLength(0);
    expect(f.toastLog).toHaveLength(1);
  });

  it('the same key may not toast twice within 20 real seconds', () => {
    const f = new AlertFeed();
    f.update([alert('food-c-low', 'warning', 1)], ctx(0, 7000));
    f.update([], ctx(1, 7000));
    f.update([], ctx(6, 8000));
    // cooldown for warning is 1 game h = 250 ticks: passed. The real-time rule still holds at 10 s.
    f.update([alert('food-c-low', 'warning', 1)], ctx(10, 8000));
    expect(f.toastLog).toHaveLength(1);
    f.update([], ctx(11, 8000));
    f.update([], ctx(16, 8500));
    f.update([alert('food-c-low', 'warning', 1)], ctx(25, 9000));
    expect(f.toastLog).toHaveLength(2);
  });

  it('an escalation re-toasts; a notice card leaves after 12 s; a warning collapses into the chip after 30 s', () => {
    const f = new AlertFeed();
    const n = alert('trail-lost', 'notice', 5);
    const w = alert('food-c-low', 'warning', 6);
    f.update([n, w], ctx(0));
    expect(f.update([n, w], ctx(11)).cards).toHaveLength(2);
    const at13 = f.update([n, w], ctx(13));
    expect(at13.cards.map((c) => c.kind)).toEqual(['food-c-low']);
    const at31 = f.update([n, w], ctx(31));
    expect(at31.cards).toHaveLength(0);
    expect(at31.more).toBe(1);
    // escalation of the warning to critical toasts again with a pinned card
    const w2 = { ...w, level: 'critical' };
    const v = f.update([w2], ctx(40));
    expect(v.cards[0].pinned).toBe(true);
    expect(f.toastLog.at(-1)?.why).toBe('escalate');
  });

  it('acknowledging unpins a critical card', () => {
    const f = new AlertFeed();
    const a = alert('queen-in-danger', 'critical', 1);
    f.update([a], ctx(0));
    f.acknowledge('queen-in-danger:1');
    expect(f.update([a], ctx(1)).cards).toHaveLength(0);
  });

  it('snoozing a kind keeps it out of the feed for a game day, except critical', () => {
    const f = new AlertFeed();
    f.snooze('source-found', 7000);
    expect(f.update([alert('source-found', 'notice', 1)], ctx(0, 7000)).cards).toHaveLength(0);
    expect(f.update([alert('queen-in-danger', 'critical', 1)], ctx(1, 7000)).cards).toHaveLength(1);
  });

  it('with the HUD hidden only critical alerts show, and others make no toast', () => {
    const f = new AlertFeed();
    const v = f.update([alert('food-c-low', 'warning', 1), alert('queen-in-danger', 'critical', 2)], ctx(0, 7000, true));
    expect(v.cards.map((c) => c.kind)).toEqual(['queen-in-danger']);
    expect(f.toastLog.map((t) => t.level)).toEqual(['critical']);
  });

  it('info alerts toast only during the first game day, for 6 s', () => {
    const f = new AlertFeed();
    const early = f.update([alert('chamber-done', 'info', 1)], ctx(0, 100));
    expect(early.cards).toHaveLength(1);
    expect(f.update([alert('chamber-done', 'info', 1)], ctx(7, 100)).cards).toHaveLength(0);
    const late = new AlertFeed().update([alert('chamber-done', 'info', 1)], ctx(0, 7000));
    expect(late.cards).toHaveLength(0);
  });

  it('keeps the same view object while nothing visible changes', () => {
    const f = new AlertFeed();
    const a = alert('food-c-low', 'warning', 1);
    const v1 = f.update([a], ctx(0));
    expect(f.update([a], ctx(1))).toBe(v1);
  });

  it('shows unknown kinds with the strings the simulation gave', () => {
    const f = new AlertFeed();
    const v = f.update([alert('future-kind', 'notice', 1, { title: 'Something new', cause: 'because' })], ctx(0));
    expect(v.cards[0].title).toBe('Something new');
    expect(v.cards[0].cause).toBe('because');
  });
});

describe('AlertFeed: another game in the same page', () => {
  const a = (kind: string, level: UiAlert['level'], subjectId = 1): UiAlert => ({ id: 1, kind, level, title: kind, cause: 'c', count: 1, subjectId, raisedTick: 0 });

  it('reset() forgets entries, cooldowns, snoozes and the rate window (the title screen between two games)', () => {
    const f = new AlertFeed();
    f.update([a('food-c-low', 'warning')], { nowS: 0, tick: 100, hudHidden: false });
    f.snooze('source-found', 100);
    f.reset();
    expect(f.isSnoozed('source-found', 100)).toBe(false);
    const v = f.update([a('food-c-low', 'warning')], { nowS: 1, tick: 100, hudHidden: false });
    expect(v.cards).toHaveLength(1); // not on the 20 s real-time cooldown of the old game
  });

  it('a load whose tick is lower than the current one resets by itself', () => {
    const f = new AlertFeed();
    f.update([a('nest-crowded', 'notice')], { nowS: 0, tick: 9000, hudHidden: false });
    const v = f.update([], { nowS: 1, tick: 100, hudHidden: false });
    expect(v.cards).toHaveLength(0); // the old card is gone, not turned into "Resolved"
  });
});

describe('AlertFeed: Resolved only for a card that is on screen', () => {
  const a = (kind: string, subjectId: number, level: UiAlert['level'] = 'warning'): UiAlert => ({ id: subjectId, kind, level, title: kind, cause: 'c', count: 1, subjectId, raisedTick: subjectId });

  it('a card cut by the visible limit (it sits behind "+n more") does not pop up as Resolved', () => {
    const f = new AlertFeed();
    const list = [1, 2, 3, 4].map((i) => a('nest-attacked', i, 'critical'));
    const v = f.update(list, { nowS: 0, tick: 10, hudHidden: false });
    expect(v.cards).toHaveLength(3);
    expect(v.more).toBe(1);
    // the hidden one (subject 1, the oldest) clears: nothing new appears on screen
    const after = f.update(list.slice(1), { nowS: 1, tick: 11, hudHidden: false });
    expect(after.cards.every((c) => !c.resolved)).toBe(true);
  });

  it('a non-critical card hidden by the HUD being off does not come back as Resolved', () => {
    const f = new AlertFeed();
    const w = a('food-c-low', 3);
    f.update([w], { nowS: 0, tick: 10, hudHidden: false });
    f.update([w], { nowS: 1, tick: 11, hudHidden: true });
    const v = f.update([], { nowS: 2, tick: 12, hudHidden: false });
    expect(v.cards).toHaveLength(0);
  });

  it('with the HUD hidden the other criticals wait behind the "+n" chip', () => {
    const f = new AlertFeed();
    const v = f.update([a('queen-in-danger', 1, 'critical'), a('nest-flooding', 2, 'critical'), a('nest-attacked', 3, 'critical')], { nowS: 0, tick: 10, hudHidden: true });
    expect(v.cards).toHaveLength(1);
    expect(v.more).toBe(2);
  });
});
