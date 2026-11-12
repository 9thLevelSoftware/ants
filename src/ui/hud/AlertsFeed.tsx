// Alerts feed (GDD 08 6): up to three cards, 336 x 64 dp, status shape + level word + title + cause + count, and a
// "+n more" chip. Click-through goes to the panels later tasks own through the hook registry (state.ts); until they
// exist a click acknowledges the card. Right-click, the context-menu key or Shift+Enter open Acknowledge, Snooze and
// Open in journal. The backquote key (hotkeys.ts) moves focus into the feed; arrows move between cards.
import { useRef, useState } from 'preact/hooks';
import { ALERT_LEVEL_STATUS, ALERT_WORDS } from '../components';
import { Icon } from '../icons';
import { facade, snapshot } from '../store';
import { alertFeed, feedView, refreshFeed } from './alerts/store';
import type { FeedCard } from './alerts/feed';
import { hudHooks } from './state';

function activate(card: FeedCard): void {
  let handled = false;
  if (card.diagnosticId && hudHooks.openHealth) { hudHooks.openHealth(card.diagnosticId); handled = true; }
  if (card.focus && hudHooks.jumpTo) { hudHooks.jumpTo(card.focus); handled = true; }
  if (!handled) acknowledge(card);
}

function acknowledge(card: FeedCard): void {
  alertFeed.acknowledge(card.key);
  facade.value?.command?.({ type: 'acknowledgeAlert', alertId: card.alertId });
  refreshFeed();
}

function CardMenu({ card, onClose }: { card: FeedCard; onClose: () => void }) {
  const tick = snapshot.value.time?.tick ?? 0;
  const items: { label: string; run: () => void; hidden?: boolean }[] = [
    { label: 'Acknowledge', run: () => acknowledge(card) },
    { label: 'Snooze this kind for 1 game day', run: () => { alertFeed.snooze(card.kind, tick); refreshFeed(); }, hidden: card.level === 'critical' },
    { label: 'Open in journal', run: () => hudHooks.openJournal?.(), hidden: !hudHooks.openJournal },
  ];
  return (
    <div class="fd-alert-menu ui-surface" role="menu" aria-label="Alert actions" onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      {items.filter((i) => !i.hidden).map((i, n) => (
        <button key={i.label} type="button" role="menuitem" class="fd-menu-item" autofocus={n === 0} onClick={() => { i.run(); onClose(); }}>{i.label}</button>
      ))}
    </div>
  );
}

function Card({ card, index, count, focusAt }: { card: FeedCard; index: number; count: number; focusAt: (i: number) => void }) {
  const [menu, setMenu] = useState(false);
  const status = ALERT_LEVEL_STATUS[card.level];
  const urgent = card.level === 'warning' || card.level === 'critical';
  return (
    <div class={`fd-alert is-${card.level}${card.resolved ? ' is-resolved' : ''}`} role={urgent ? 'alert' : 'status'} data-testid="alert-card" data-kind={card.kind} data-level={card.level}>
      <button
        type="button" class="fd-alert-main" data-alert-button="1"
        onClick={() => activate(card)}
        onContextMenu={(e: MouseEvent) => { e.preventDefault(); setMenu(true); }}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); setMenu(true); }
          else if (e.key === 'ArrowDown' && index < count - 1) { e.preventDefault(); focusAt(index + 1); }
          else if (e.key === 'ArrowUp' && index > 0) { e.preventDefault(); focusAt(index - 1); }
        }}
      >
        <span class={`fd-alert-shape is-${status}`}><Icon name={`status-${status}`} size={20} decorative /></span>
        <span class="fd-alert-text">
          <span class="fd-alert-title"><span class="ui-sr-only">{ALERT_WORDS[card.level]}: </span>{card.title}</span>
          <span class="fd-alert-cause">{card.resolved ? 'Resolved' : card.cause}</span>
        </span>
        {card.count > 1 && <span class="fd-alert-count" aria-label={`${card.count} times`}>x{card.count}</span>}
      </button>
      {card.focus && hudHooks.jumpTo && (
        <button type="button" class="fd-alert-jump" aria-label="Show me" title="Show me" onClick={() => hudHooks.jumpTo?.(card.focus as NonNullable<FeedCard['focus']>)}>
          <Icon name="jump-to" size={18} decorative />
        </button>
      )}
      {menu && <CardMenu card={card} onClose={() => setMenu(false)} />}
    </div>
  );
}

export function AlertsFeed() {
  const view = feedView.value;
  const root = useRef<HTMLDivElement>(null);
  if (view.cards.length === 0 && view.more === 0) return null;
  const focusAt = (i: number) => {
    const btns = root.current?.querySelectorAll<HTMLElement>('[data-alert-button]');
    btns?.[i]?.focus();
  };
  return (
    <section ref={root} class="fd-alerts" aria-label="Alerts" data-hud="alerts" data-testid="alerts">
      {view.cards.map((c, i) => <Card key={c.key} card={c} index={i} count={view.cards.length} focusAt={focusAt} />)}
      {view.more > 0 && (
        hudHooks.openJournal
          ? <button type="button" class="fd-more" data-testid="alerts-more" onClick={() => hudHooks.openJournal?.()}>+{view.more > 99 ? '99+' : view.more} more</button>
          : <span class="fd-more" data-testid="alerts-more">+{view.more > 99 ? '99+' : view.more} more</span>
      )}
    </section>
  );
}
