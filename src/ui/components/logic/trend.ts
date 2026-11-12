// Trend arrows for meters (GDD 08 3.4): delta over the last TREND_WINDOW_GAME_H hours relative to the current value;
// flat below 2 %, normal 2-10 %, strong beyond 10 %.
import { UI_BALANCE } from '../../styles/tokens';

export type Trend = 'up-strong' | 'up' | 'flat' | 'down' | 'down-strong';

/** Trend of a value that was `past` three game hours ago and is `current` now. */
export function trendOf(current: number, past: number): Trend {
  const base = Math.abs(current) > 1e-9 ? Math.abs(current) : Math.abs(past) > 1e-9 ? Math.abs(past) : 1;
  const pct = ((current - past) / base) * 100;
  const a = Math.abs(pct);
  if (a < UI_BALANCE.trendFlatPct) return 'flat';
  const strong = a > UI_BALANCE.trendStrongPct;
  if (pct > 0) return strong ? 'up-strong' : 'up';
  return strong ? 'down-strong' : 'down';
}

/** Icon id (from the icon set) for a trend. */
export function trendIcon(t: Trend): string {
  return t === 'flat' ? 'trend-flat' : `trend-${t}`;
}

export const TREND_WORDS: Record<Trend, string> = {
  'up-strong': 'rising quickly', up: 'rising', flat: 'steady', down: 'falling', 'down-strong': 'falling quickly',
};
