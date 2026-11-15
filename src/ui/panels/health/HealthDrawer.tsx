// Colony health, the "why" view (GDD 08 4.4, screen id `colony-health`, key Y): a right-docked drawer with the overall
// status, one row per diagnostic (shape + word, label, value, sparkline, since) sorted worst first, and under the open
// row its cause chain: weighted factors with bars, nested explanations, "Show" and the remedies as link buttons.
import { useEffect, useRef } from 'preact/hooks';
import { Icon } from '../../icons';
import { DrawerShell } from '../../hud/DrawerShell';
import { closePanel } from '../../hud/state';
import { StatusChip } from '../../components/StatusChip';
import type { UiDiagnostic } from '../../api';
import { healthSlice } from '../wiring/slices';
import { healthExpanded } from '../wiring/state';
import { runRemedy, showFocus } from './actions';
import { factorTree, overallOf, rankRows, remedyLink, rowName, statusKind, statusWord, valueWord, type FactorTree } from './model';
import { DiagSpark } from './Spark';

const OVERALL_LINE: Record<UiDiagnostic['status'], string> = {
  ok: 'Nothing needs attention.', info: 'Nothing needs attention; some notes below.', warn: 'Some things are strained.', bad: 'Something is failing.',
};

function Tree({ tree, rows, nested }: { tree: FactorTree; rows: readonly UiDiagnostic[]; nested: boolean }) {
  return (
    <ul class={`pn-factors${nested ? ' is-nested' : ''}`}>
      {tree.lines.map((l) => (
        <li key={l.cause} class="pn-factor" data-testid="health-factor" data-cause={l.cause}>
          <div class="pn-factor-head">
            <span class="pn-factor-bar" role="img" aria-label={`${l.pct} percent of the shortfall`}><span style={{ width: `${Math.max(2, l.pct)}%` }} /></span>
            <span class="pn-factor-pct">{l.pct} %</span>
            <span class="pn-factor-cause">{l.label}</span>
          </div>
          {l.detail && <p class="pn-factor-detail">{l.detail}</p>}
          {l.diag && l.chain && (
            <div class="pn-because" data-testid="health-chain">
              <p class="pn-because-head">
                <span>Because</span> <StatusChip status={statusKind(l.diag.status)} word={statusWord(l.diag.status)} class="is-small" /> <b>{l.diag.label}</b>
              </p>
              <Tree tree={l.chain} rows={rows} nested />
            </div>
          )}
          {l.diag && l.cut && <p class="pn-because-head is-cut">{l.cut === 'cycle' ? 'Explained above: ' : 'Further causes: '}<b>{l.diag.label}</b></p>}
        </li>
      ))}
      {tree.otherPct > 0 && <li class="pn-factor is-other"><span class="pn-factor-pct">{tree.otherPct} %</span> <span class="pn-factor-cause">Other ({tree.otherPct} %)</span></li>}
      {tree.lines.length === 0 && <li class="pn-factor is-none">No single cause stands out.</li>}
    </ul>
  );
}

function Row({ d, rows, open }: { d: UiDiagnostic; rows: readonly UiDiagnostic[]; open: boolean }) {
  const kind = statusKind(d.status);
  const tree = open ? factorTree(d, rows) : null;
  const remedies = open ? d.remedies.map(remedyLink) : [];
  return (
    <li class={`pn-diag is-${d.status}${open ? ' is-open' : ''}`} data-testid="health-row" data-diag={d.id} data-status={d.status} data-open={open ? '1' : '0'}>
      <button
        type="button" class="pn-diag-head" aria-expanded={open ? 'true' : 'false'} aria-label={rowName(d)} data-testid="health-row-head"
        onClick={() => { healthExpanded.value = open ? null : d.id; }}
      >
        <span class={`pn-shape is-${kind}`}><Icon name={`status-${kind}`} size={20} decorative /></span>
        <span class="pn-diag-text">
          <span class="pn-diag-label">{d.label}</span>
          <span class="pn-diag-meta"><b>{statusWord(d.status)}</b> · {valueWord(d) && `${valueWord(d)} · `}since {d.sinceLabel}</span>
        </span>
        <DiagSpark values={d.history} label={d.label} tone={d.status} />
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} decorative />
      </button>
      {open && tree && (
        <div class="pn-diag-body">
          <Tree tree={tree} rows={rows} nested={false} />
          <div class="pn-diag-actions">
            {d.focus && (
              <button type="button" class="pn-link" onClick={() => showFocus(d.focus!)} data-testid="health-show">
                <Icon name="jump-to" size={16} decorative /> Show
              </button>
            )}
            {remedies.map((r) => (
              r.action.kind === 'advice'
                ? <span key={r.id} class="pn-advice">{r.label}</span>
                : <button key={r.id} type="button" class="pn-link" data-testid="health-remedy" data-remedy={r.id} onClick={() => runRemedy(r)}>{r.label}</button>
            ))}
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * Brings the expanded row into view when it changes (an alert's click-through expands a row that is below the fold of a
 * list of a dozen rows) and, when the drawer opened that way, puts the keyboard focus on it.
 */
function useScrollToExpanded(expanded: string | null, ready: boolean): void {
  const fresh = useRef(true);
  useEffect(() => {
    if (!expanded || !ready) return;
    const row = document.querySelector<HTMLElement>(`.pn-health [data-diag="${CSS.escape(expanded)}"]`);
    if (!row) return;
    row.scrollIntoView({ block: 'start', inline: 'nearest' });
    if (fresh.current) row.querySelector<HTMLElement>('.pn-diag-head')?.focus({ preventScroll: true });
    fresh.current = false;
  }, [expanded, ready]);
}

export function HealthDrawer() {
  const h = healthSlice.value;
  const expanded = healthExpanded.value;
  const rows = h ? rankRows(h.rows) : [];
  const overall = h ? overallOf(rows) : 'ok';
  useScrollToExpanded(expanded, rows.some((r) => r.id === expanded));
  return (
    <DrawerShell title="Colony health" onClose={() => closePanel('health')} class="fd-drawer pn-drawer pn-health" initial={expanded ? `[data-diag="${CSS.escape(expanded)}"] .pn-diag-head` : '.pn-diag-head'}>
      {!h ? (
        <p class="pn-empty">No colony to read.</p>
      ) : (
        <>
          <div class="pn-overall" data-testid="health-overall" data-status={overall}>
            <StatusChip status={statusKind(overall)} word={statusWord(overall)} />
            <span>{OVERALL_LINE[overall]}</span>
          </div>
          {rows.length === 0 ? (
            <p class="pn-empty">Nothing has been measured yet. The first readings arrive within a game hour.</p>
          ) : (
            <ul class="pn-diag-list" aria-label="Diagnostics, worst first">
              {rows.map((d) => <Row key={d.id} d={d} rows={rows} open={expanded === d.id} />)}
            </ul>
          )}
        </>
      )}
    </DrawerShell>
  );
}

