// The page's alert feed: one AlertFeed fed by the snapshot, published as a signal. Cards also age on a timer, because
// a notice must leave 12 s after it showed even when the simulation sends nothing new (paused game).
import { signal } from '@preact/signals';
import { alertsSlice, hudHiddenSlice } from '../slices';
import { snapshot } from '../../store';
import { centreCardUp } from '../blockingCard';
import { foundingUi } from '../../screens/founding/store';
import { winterUi } from '../../screens/overwinter/store';
import { AlertFeed, type FeedView } from './feed';

export const alertFeed = new AlertFeed();
export const feedView = signal<FeedView>({ cards: [], more: 0 });

let timer: number | undefined;

function nowS(): number {
  return performance.now() / 1000;
}

/** Re-evaluates the feed against the latest alerts (called on every snapshot and once a second). */
export function refreshFeed(): void {
  const time = snapshot.peek().time;
  // no game (title, loading, epitaph): whatever the feed remembers belongs to a game that is over
  if (!time) alertFeed.reset();
  const tick = time?.tick ?? 0;
  const compact = document.documentElement.dataset.layout === 'compact';
  feedView.value = alertFeed.update(alertsSlice.peek(), { nowS: nowS(), tick, hudHidden: hudHiddenSlice.peek(), cardUp: centreCardUp(), maxVisible: compact ? 2 : 3 });
}

/** Subscribes the feed to the snapshot; returns the uninstaller. */
export function startFeed(): () => void {
  const stopA = alertsSlice.subscribe(refreshFeed);
  const stopH = hudHiddenSlice.subscribe(refreshFeed);
  const stopF = foundingUi.subscribe(refreshFeed); // a centre card opening clears the "Resolved" cards at once
  const stopW = winterUi.subscribe(refreshFeed);
  timer = window.setInterval(refreshFeed, 1000);
  refreshFeed();
  return () => { stopA(); stopH(); stopF(); stopW(); if (timer !== undefined) window.clearInterval(timer); timer = undefined; };
}
