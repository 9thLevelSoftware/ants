// Journal > Event log (GDD 08 7.2): the rolling list of the last 200 events (alerts of every level, milestones, deaths of the
// queen, possessions): time, level shape, text, and "Show" where the entry has a place.
import { Icon } from '../../icons';
import { ALERT_LEVEL_STATUS, ALERT_WORDS } from '../../components/StatusChip';
import type { UiJournal } from '../../api';
import { panelsBridge } from '../wiring/state';
import { eventWording, timeLine } from './timeline';

export function LogTab({ j }: { j: UiJournal }) {
  const bridge = panelsBridge.value;
  const list = [...j.events].reverse();
  if (list.length === 0) return <p class="pn-empty" data-testid="log-none">Nothing has been logged yet.</p>;
  return (
    <ul class="pn-log" data-testid="journal-log" aria-label="Event log, newest first">
      {list.map((e, i) => {
        const level = (e.level in ALERT_LEVEL_STATUS ? e.level : 'info') as keyof typeof ALERT_LEVEL_STATUS;
        const st = ALERT_LEVEL_STATUS[level];
        return (
          <li key={`${e.tick}-${i}`} class="pn-log-row" data-level={level}>
            <span class="pn-log-time">{timeLine(j, e.tick, e.calTick)}</span>
            <span class={`pn-shape is-${st}`} title={ALERT_WORDS[level]}><Icon name={`status-${st}`} size={16} label={ALERT_WORDS[level]} /></span>
            <span class="pn-log-text">{eventWording(e)}</span>
            {e.focus && bridge ? <button type="button" class="pn-iconbtn" aria-label="Show" title="Show" onClick={() => bridge.jumpTo(e.focus!)}><Icon name="jump-to" size={16} decorative /></button> : <span />}
          </li>
        );
      })}
    </ul>
  );
}
