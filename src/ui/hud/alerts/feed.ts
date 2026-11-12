// Alert presentation throttling (GDD 08 6.3). The simulation owns raising and clearing; this decides what the player
// SEES: which alerts become cards (a "toast"), how many cards show, what waits in the "+n more" chip. Pure and driven
// by injected time, so it is unit-tested without a browser. One instance lives for the page (src/ui/hud/alerts/store.ts).
import type { UiAlert } from '../../api';
import { ALERT_BALANCE } from '../balance';

export type AlertLevelId = 'info' | 'notice' | 'warning' | 'critical';

export { ALERT_BALANCE };

const LEVEL_RANK: Record<AlertLevelId, number> = { info: 0, notice: 1, warning: 2, critical: 3 };
const asLevel = (l: string): AlertLevelId => (l === 'info' || l === 'notice' || l === 'warning' || l === 'critical' ? l : 'notice');

export interface FeedCard {
  /** kind:subjectId */
  key: string;
  alertId: number;
  kind: string;
  level: AlertLevelId;
  title: string;
  cause: string;
  count: number;
  resolved: boolean;
  /** Pinned (critical, not acknowledged): stays until resolved or acknowledged. */
  pinned: boolean;
  diagnosticId: string | null;
  focus: UiAlert['focus'];
}

export interface FeedView {
  /** Cards to draw, most urgent first. */
  cards: FeedCard[];
  /** The "+n more" chip. */
  more: number;
}

export interface ToastRecord {
  key: string;
  level: AlertLevelId;
  atS: number;
  tick: number;
  /** 'raise' for a new card, 'escalate' for a level increase. */
  why: 'raise' | 'escalate';
}

type Fate = 'card' | 'log' | 'overflow';

interface Entry {
  key: string;
  alert: UiAlert;
  level: AlertLevelId;
  fate: Fate;
  shownAtS: number;
  /** Real time the card collapsed into the chip (warning after 30 s, notice after 12 s), -1 not yet. */
  collapsedAtS: number;
  /** Resolved (the simulation cleared it): shown as "Resolved" until this real time, then dropped. */
  resolvedUntilS: number;
  /** Player acknowledged it (pinned cards unpin). */
  acknowledged: boolean;
  raisedTick: number;
}

export interface FeedContext {
  /** Real seconds, monotonic (performance.now() / 1000). */
  nowS: number;
  /** Simulation tick, for the game-time cooldowns and snoozes. */
  tick: number;
  /** The HUD is hidden (H): only critical alerts show. */
  hudHidden: boolean;
  /** Cards that fit (3; 2 in the compact layout, GDD 08 2.3). */
  maxVisible?: number;
}

const keyOf = (a: UiAlert): string => `${a.kind}:${a.subjectId ?? -1}`;

export class AlertFeed {
  private entries = new Map<string, Entry>();
  /** Last tick each key cleared, for the game-time cooldown. */
  private clearedTick = new Map<string, number>();
  /** Last real time each key toasted. */
  private toastedAtS = new Map<string, number>();
  private snoozedUntilTick = new Map<string, number>();
  private recentToastsS: number[] = [];
  /** Newest simulation tick seen. A tick below it means a different game (new game, load): game-time state is void. */
  private lastTick = 0;
  /** Every toast granted so far (the test-mode "toast log", GDD 08 App. E check 4). */
  readonly toastLog: ToastRecord[] = [];
  /** Cards raised while the rate limit was full or the kind snoozed, counted for the chip while their alert is active. */
  private view: FeedView = { cards: [], more: 0 };

  /** Reads the alerts of the latest snapshot; returns the view (the same object while nothing changed). */
  update(alerts: readonly UiAlert[], ctx: FeedContext): FeedView {
    if (ctx.tick < this.lastTick) this.reset();
    this.lastTick = ctx.tick;
    const incoming = new Map<string, UiAlert>();
    for (const a of alerts) incoming.set(keyOf(a), a);
    this.clearGone(incoming, ctx);
    for (const [key, a] of incoming) this.observe(key, a, ctx);
    return this.compose(ctx);
  }

  /**
   * Forgets everything about the previous game: entries, cooldowns, snoozes and rate limits all refer to a tick count
   * that no longer exists once another game (or a load) is running. The toast log is a page diagnostic and stays.
   */
  reset(): void {
    this.entries.clear();
    this.clearedTick.clear();
    this.toastedAtS.clear();
    this.snoozedUntilTick.clear();
    this.recentToastsS = [];
    this.lastTick = 0;
    this.view = { cards: [], more: 0 };
  }

  /** The player acknowledged a card: a pinned critical unpins, anything else leaves. */
  acknowledge(key: string): void {
    const e = this.entries.get(key);
    if (e) e.acknowledged = true;
  }

  /** Snooze a kind for a game day (critical kinds cannot be snoozed). Session only. */
  snooze(kind: string, tick: number): void {
    this.lastTick = Math.max(this.lastTick, tick);
    this.snoozedUntilTick.set(kind, tick + ALERT_BALANCE.snoozeGameDays * ALERT_BALANCE.ticksPerGameDay);
  }

  isSnoozed(kind: string, tick: number): boolean {
    return (this.snoozedUntilTick.get(kind) ?? -1) > tick;
  }

  private clearGone(incoming: Map<string, UiAlert>, ctx: FeedContext): void {
    for (const [key, e] of this.entries) {
      if (incoming.has(key)) continue;
      if (e.resolvedUntilS >= 0) { if (ctx.nowS >= e.resolvedUntilS) this.entries.delete(key); continue; }
      this.clearedTick.set(key, ctx.tick);
      if (this.onScreen(e, ctx)) e.resolvedUntilS = ctx.nowS + ALERT_BALANCE.resolvedRealS;
      else this.entries.delete(key);
    }
  }

  /** Whether the card of `e` is on screen right now: only such a card turns into "Resolved" when the simulation clears it. */
  private onScreen(e: Entry, ctx: FeedContext): boolean {
    if (e.fate !== 'card' || e.acknowledged || this.lifetimeOver(e, ctx)) return false;
    if (ctx.hudHidden && e.level !== 'critical') return false;
    return this.view.cards.some((c) => c.key === e.key); // not cut by the visible limit
  }

  private observe(key: string, a: UiAlert, ctx: FeedContext): void {
    const level = asLevel(a.level);
    const e = this.entries.get(key);
    if (e && e.resolvedUntilS < 0) {
      const escalated = LEVEL_RANK[level] > LEVEL_RANK[e.level];
      e.alert = a; // repeat of an active key: the card updates in place (count, cause), no new toast
      e.level = level;
      e.acknowledged = e.acknowledged || a.acknowledged === true;
      if (escalated && (level === 'critical' || !this.isSnoozed(a.kind, ctx.tick))) this.grant(key, e, ctx, 'escalate');
      return;
    }
    const fresh: Entry = { key, alert: a, level, fate: 'log', shownAtS: ctx.nowS, collapsedAtS: -1, resolvedUntilS: -1, acknowledged: a.acknowledged === true, raisedTick: a.raisedTick ?? ctx.tick };
    this.entries.set(key, fresh);
    if (fresh.acknowledged) return;
    const gate = this.gate(key, fresh, ctx);
    if (gate === 'toast') this.grant(key, fresh, ctx, 'raise');
    else if (gate === 'rate') fresh.fate = 'overflow';
  }

  /** Whether a NEW raise of `key` may toast. */
  private gate(key: string, e: Entry, ctx: FeedContext): 'toast' | 'rate' | 'log' {
    const level = e.level;
    if (level !== 'critical') {
      if (this.isSnoozed(e.alert.kind, ctx.tick)) return 'log';
      if (ctx.hudHidden) return 'log';
      if (level === 'info' && ctx.tick >= ALERT_BALANCE.ticksPerGameDay) return 'log'; // info toasts: the first game day only
    }
    const cleared = this.clearedTick.get(key);
    if (cleared !== undefined && (ctx.tick - cleared) < ALERT_BALANCE.cooldownGameH[level] * ALERT_BALANCE.ticksPerGameHour) return 'log';
    const last = this.toastedAtS.get(key);
    if (level !== 'critical' && last !== undefined && ctx.nowS - last < ALERT_BALANCE.cooldownRealS) return 'log';
    if (level !== 'critical') {
      this.recentToastsS = this.recentToastsS.filter((t) => ctx.nowS - t < ALERT_BALANCE.rateWindowRealS);
      if (this.recentToastsS.length >= ALERT_BALANCE.rateMax) return 'rate';
    }
    return 'toast';
  }

  private grant(key: string, e: Entry, ctx: FeedContext, why: ToastRecord['why']): void {
    e.fate = 'card';
    e.shownAtS = ctx.nowS;
    e.collapsedAtS = -1;
    this.toastedAtS.set(key, ctx.nowS);
    if (e.level !== 'critical') this.recentToastsS.push(ctx.nowS);
    this.toastLog.push({ key, level: e.level, atS: ctx.nowS, tick: ctx.tick, why });
  }

  private lifetimeOver(e: Entry, ctx: FeedContext): boolean {
    const age = ctx.nowS - e.shownAtS;
    if (e.level === 'info') return age >= ALERT_BALANCE.infoRealS;
    if (e.level === 'notice') return age >= ALERT_BALANCE.noticeRealS;
    if (e.level === 'warning') return age >= ALERT_BALANCE.warningRealS;
    return false; // critical: until resolved or acknowledged
  }

  private compose(ctx: FeedContext): FeedView {
    const cards: FeedCard[] = [];
    let collapsed = 0;
    let overflow = 0;
    for (const e of this.entries.values()) {
      if (e.fate === 'overflow') { overflow++; continue; }
      if (e.fate !== 'card') continue;
      const resolved = e.resolvedUntilS >= 0;
      if (!resolved && e.acknowledged) continue; // acknowledged: gone from the feed (stays in the log)
      if (ctx.hudHidden && (e.level !== 'critical' || resolved)) continue;
      if (!resolved && this.lifetimeOver(e, ctx)) {
        // a warning past its lifetime collapses into the chip; a notice or info simply leaves
        if (e.level === 'warning') collapsed++;
        continue;
      }
      cards.push({
        key: e.key, alertId: e.alert.id, kind: e.alert.kind, level: e.level, title: e.alert.title, cause: e.alert.cause ?? '',
        count: e.alert.count ?? 1, resolved, pinned: e.level === 'critical' && !e.acknowledged && !resolved,
        diagnosticId: e.alert.diagnosticId ?? null, focus: e.alert.focus ?? null,
      });
    }
    // most urgent first (critical), then newest
    const order = new Map<string, number>();
    for (const e of this.entries.values()) order.set(e.key, e.raisedTick);
    cards.sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || (order.get(b.key) ?? 0) - (order.get(a.key) ?? 0) || b.alertId - a.alertId);
    // HUD hidden: one pinned card, the most urgent (GDD 08 3.4); the other criticals wait behind its "+n" chip
    const limit = ctx.hudHidden ? ALERT_BALANCE.hiddenMaxVisible : (ctx.maxVisible ?? ALERT_BALANCE.maxVisible);
    const visible = cards.slice(0, limit);
    const more = cards.length - visible.length + collapsed + (ctx.hudHidden ? 0 : overflow);
    const next: FeedView = { cards: visible, more };
    return sameView(this.view, next) ? this.view : (this.view = next);
  }
}

function sameView(a: FeedView, b: FeedView): boolean {
  if (a.more !== b.more || a.cards.length !== b.cards.length) return false;
  for (let i = 0; i < a.cards.length; i++) {
    const x = a.cards[i], y = b.cards[i];
    if (x.key !== y.key || x.alertId !== y.alertId || x.level !== y.level || x.title !== y.title || x.cause !== y.cause || x.count !== y.count || x.resolved !== y.resolved || x.pinned !== y.pinned) return false;
  }
  return true;
}
