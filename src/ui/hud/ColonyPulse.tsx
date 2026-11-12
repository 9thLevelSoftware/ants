// Colony pulse (GDD 08 3.4): overall status shape, workers, brood by stage, and the two stores with trend arrows.
// Hover or keyboard focus expands it: workers by task group, the queen, stores with 3-day sparklines, today's intake
// and the worst diagnostic with a "Why?" link. 336 x 56 dp collapsed. Before the first egg it shows the queen only.
import type { UiColony } from '../api';
import { Icon } from '../icons';
import { trendIcon, trendOf, TREND_WORDS, type Trend } from '../components';
import { cap, loads, pct } from './format';
import { Meter } from '../components';
import { colonySlice } from './slices';
import { hudHooks } from './state';
import { Sparkline } from './Sparkline';

const STATUS_WORD = { ok: 'Good', warn: 'Strained', bad: 'Failing' } as const;
const STATUS_SHAPE = { ok: 'status-ok', warn: 'status-warn', bad: 'status-bad' } as const;

function trendFor(now: number, past: number | null | undefined): Trend | null {
  return past === null || past === undefined ? null : trendOf(now, past);
}

function Stat({ letter, value, trend, tone }: { letter: 'C' | 'P'; value: number; trend: Trend | null; tone: 'c' | 'p' }) {
  return (
    <span class="fd-stat" data-testid={`pulse-${letter.toLowerCase()}`} aria-label={`${letter === 'C' ? 'Carbohydrate' : 'Protein'} ${loads(value)}${trend ? `, ${TREND_WORDS[trend]}` : ''}`}>
      <span class={`fd-stat-letter tone-${tone}`} aria-hidden="true">{letter}</span>
      <span class="fd-stat-value" aria-hidden="true">{loads(value)}</span>
      {trend && <Icon name={trendIcon(trend)} size={16} decorative class={`trend-${trend}`} />}
    </span>
  );
}

function queenWord(c: UiColony): string {
  if (!c.queenAlive) return 'absent';
  if (c.queenMode === 'founding') return 'founding';
  if (c.queenMode === 'orphan-dead') return 'absent';
  return c.brood.egg > 0 ? 'laying' : 'resting';
}

function GroupBars({ c }: { c: UiColony }) {
  const g = c.groups;
  if (!g) return null;
  const max = Math.max(1, g.forage, g.nurse, g.dig, g.defend);
  const rows: [string, string, number][] = [['Forage', 'task-forage', g.forage], ['Nurse', 'task-nurse', g.nurse], ['Dig', 'task-dig', g.dig], ['Defend', 'task-guard', g.defend]];
  return (
    <ul class="fd-groups" aria-label="Workers by task group">
      {rows.map(([name, icon, n]) => (
        <li key={name} class="fd-group">
          <Icon name={icon} size={16} decorative />
          <span class="fd-group-name">{name}</span>
          <span class="fd-group-bar" aria-hidden="true"><span style={{ width: `${(n / max) * 100}%` }} /></span>
          <span class="fd-group-n">{n}</span>
        </li>
      ))}
    </ul>
  );
}

export function ColonyPulse() {
  const c = colonySlice.value;
  if (!c) return null;
  const broodTotal = c.brood.egg + c.brood.larva + c.brood.pupa;
  const early = broodTotal === 0 && c.workers === 0;
  const status = c.status ?? 'ok';
  const tC = trendFor(c.stores.c, c.past?.c), tP = trendFor(c.stores.p, c.past?.p);
  return (
    <section class="fd-pulse fd-chip" tabIndex={0} role="group" aria-label="Colony" data-hud="pulse" data-testid="pulse">
      <div class="fd-pulse-head">
        <span class="fd-pulse-status" title={`Colony ${STATUS_WORD[status].toLowerCase()}`}>
          <Icon name={STATUS_SHAPE[status]} size={20} label={`Colony status: ${STATUS_WORD[status]}`} class={`is-${status}`} />
        </span>
        {early ? (
          <>
            <span class="fd-pulse-main"><span class="fd-pulse-label">Queen</span> <b class="fd-pulse-word">{queenWord(c)}</b></span>
            {c.queenReserves !== null && c.queenReserves !== undefined && (
              <span class="fd-pulse-reserves"><Meter class="fd-meter" label="Reserves" value={c.queenReserves} max={1} tone={c.queenReserves < 0.25 ? 'warn' : 'ok'} reserve text={pct(c.queenReserves)} /></span>
            )}
          </>
        ) : (
          <>
            <span class="fd-pulse-main"><span class="fd-pulse-label">Workers</span> <b data-testid="pulse-workers">{c.workers}</b></span>
            <Stat letter="C" value={c.stores.c} trend={tC} tone="c" />
            <span class="fd-pulse-brood" aria-label={`Brood: ${c.brood.egg} eggs, ${c.brood.larva} larvae, ${c.brood.pupa} pupae`} data-testid="pulse-brood">
              <span class="fd-pulse-label">Brood</span>
              <span class="fd-brood"><Icon name="egg" size={16} decorative />{c.brood.egg}</span>
              <span class="fd-brood"><Icon name="larva" size={16} decorative />{c.brood.larva}</span>
              <span class="fd-brood"><Icon name="pupa" size={16} decorative />{c.brood.pupa}</span>
            </span>
            <Stat letter="P" value={c.stores.p} trend={tP} tone="p" />
          </>
        )}
      </div>
      {!early && (
        <div class="fd-pulse-more">
          <GroupBars c={c} />
          <div class="fd-pulse-line"><span>Queen</span><b>{cap(queenWord(c))}</b></div>
          {c.spark && (
            <div class="fd-pulse-spark">
              <Sparkline label="Carbohydrate, last 3 game days" values={c.spark.c} tone="c" />
              <Sparkline label="Protein, last 3 game days" values={c.spark.p} tone="p" />
            </div>
          )}
          {c.intake && <div class="fd-pulse-line"><span>Intake today</span><b>C {loads(c.intake.c)} · P {loads(c.intake.p)}</b></div>}
          {c.worst && (
            <div class="fd-pulse-line fd-pulse-worst">
              <Icon name={c.worst.status === 'bad' ? 'status-bad' : 'status-warn'} size={16} decorative />
              <span class="fd-worst-label">{c.worst.label}</span>
              {hudHooks.openHealth && <button type="button" class="fd-link" onClick={() => hudHooks.openHealth?.(c.worst?.id ?? null)}>Why?</button>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
