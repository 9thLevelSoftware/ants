// Roster drawer (GDD 08 4.5, screen id `roster`, key L): quick possess buttons, filters, an id search and a virtualised,
// sortable table of the colony's ants with Follow and Possess. Rows are 32 dp; only the rows in view (plus a few) exist
// in the DOM, so 2,500 ants cost the same as 25. The list updates at most twice a second and keeps its order between
// updates; a "Re-sort" chip appears when the order went stale. The drawer is 34 rem wide (a deviation from the 25 rem
// of the other drawers) so the eight columns of the chapter fit.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { UiRosterQuery, UiRosterRow } from '../../api';
import { Button } from '../../components/Button';
import { KeyHint } from '../../components/KeyHint';
import { Select } from '../../components/Select';
import { TextField } from '../../components/TextField';
import { DrawerShell } from '../../hud/DrawerShell';
import { Meter } from '../../components';
import { Icon } from '../../icons';
import { CASTE_ICON, casteCount, loads, TASK_ICON } from '../../hud/format';
import { rosterSlice } from '../../hud/slices';
import { closePanel, hudBridge, rosterQuery } from '../../hud/state';
import { facade } from '../../store';
import { nextSort } from './rosterModel';

const ROW_REM = 2; // 32 dp
const OVERSCAN = 4;
const COLUMNS: { key: UiRosterQuery['sort']; label: string }[] = [
  { key: 'id', label: 'Ant' }, { key: 'age', label: 'Age' }, { key: 'task', label: 'Task' }, { key: 'where', label: 'Where' },
  { key: 'health', label: 'Health' }, { key: 'crop', label: 'Crop' }, { key: 'carrying', label: 'Carrying' },
];

const remPx = (): number => parseFloat(document.documentElement.style.fontSize) || 16;

function setQuery(patch: Partial<UiRosterQuery>): void {
  rosterQuery.value = { ...rosterQuery.value, ...patch, offset: patch.offset ?? 0 };
}

function Row({ row, index, active, onActivate }: { row: UiRosterRow; index: number; active: boolean; onActivate: () => void }) {
  const f = facade.value;
  const bridge = hudBridge.value;
  return (
    <div
      class={`fd-row${row.possessed ? ' is-possessed' : ''}`} role="row" tabIndex={active ? 0 : -1} data-index={index} data-id={row.id}
      style={{ top: `${index * ROW_REM}rem` }} data-testid="roster-row" onFocus={onActivate}
    >
      <span class="fd-cell fd-cell-ant" role="cell"><Icon name={CASTE_ICON[row.caste] ?? 'ant-worker'} size={16} decorative /> <span>{row.name}</span></span>
      <span class="fd-cell" role="cell">{row.ageDays.toFixed(1)}</span>
      <span class="fd-cell fd-cell-task" role="cell" title={row.task}><Icon name={TASK_ICON[row.task.toLowerCase().replace(/ /g, '-')] ?? 'task-idle'} size={16} decorative /> <span>{row.task}</span></span>
      <span class="fd-cell" role="cell" title={row.where}><span>{row.where}</span></span>
      <span class="fd-cell" role="cell"><Meter label="" value={row.health} max={1} tone={row.health < 0.3 ? 'bad' : row.health < 0.6 ? 'warn' : 'ok'} class="fd-mini" /><span class="ui-sr-only">{Math.round(row.health * 100)} %</span></span>
      <span class="fd-cell" role="cell" title={`C ${loads(row.cropC)} · P ${loads(row.cropP)}`}>
        <Meter label="" max={1} segments={[{ value: row.cropC, tone: 'c' }, { value: row.cropP, tone: 'p' }]} class="fd-mini" />
        <span class="ui-sr-only">C {loads(row.cropC)} P {loads(row.cropP)}</span>
      </span>
      <span class="fd-cell" role="cell" title={row.carrying}><span>{row.carrying}</span></span>
      <span class="fd-cell fd-cell-actions" role="cell">
        {bridge && <button type="button" class="fd-row-btn" tabIndex={-1} aria-label={`Follow ${row.name}`} title="Follow" onClick={() => bridge.follow(row.id)} data-testid="roster-follow"><Icon name="follow" size={16} decorative /></button>}
        <button type="button" class="fd-row-btn" tabIndex={-1} aria-label={`Possess ${row.name}`} title="Possess" disabled={row.possessed} onClick={() => f?.possess(row.id)} data-testid="roster-possess"><Icon name="possess" size={16} decorative /></button>
      </span>
    </div>
  );
}

function Quick() {
  const r = rosterSlice.value;
  const f = facade.value;
  const roles = r?.roles ?? { forager: 0, digger: 0, nurse: 0, queen: 0 };
  const items: { role: 'forager' | 'digger' | 'nurse' | 'queen'; label: string; action: string; none: string }[] = [
    { role: 'forager', label: 'A forager', action: 'possess-forager', none: 'No foragers alive' },
    { role: 'digger', label: 'A digger', action: 'possess-digger', none: 'No diggers alive' },
    { role: 'nurse', label: 'A nurse', action: 'possess-nurse', none: 'No nurses alive' },
    { role: 'queen', label: 'The queen', action: 'possess-queen', none: 'No queen alive' },
  ];
  return (
    <div class="fd-quick" role="group" aria-label="Possess the nearest">
      {items.map((i) => (
        <Button key={i.role} variant="secondary" disabled={roles[i.role] === 0} disabledReason={i.none} onClick={() => f?.possess(i.role)} data-testid={`roster-quick-${i.role}`}>
          {i.label} <KeyHint action={i.action} />
        </Button>
      ))}
    </div>
  );
}

function Filters() {
  const q = rosterQuery.value;
  const r = rosterSlice.value;
  const g = r?.byGroup ?? {};
  const c = r?.byCaste ?? {};
  const workers = (c.worker ?? 0) + (c.minor ?? 0) + (c.media ?? 0) + (c.major ?? 0);
  return (
    <div class="fd-filters">
      <Select
        aria-label="Caste" value={q.caste} onChange={(v) => setQuery({ caste: v })}
        options={[{ value: 'all', label: `All castes (${r?.all ?? 0})` }, { value: 'worker', label: `Workers (${workers})` }, { value: 'queen', label: `Queen (${c.queen ?? 0})` }, { value: 'gyne', label: `Gynes (${c.gyne ?? 0})` }, { value: 'male', label: `Males (${c.male ?? 0})` }]}
      />
      <Select
        aria-label="Task group" value={q.group} onChange={(v) => setQuery({ group: v })}
        options={[{ value: 'all', label: 'All jobs' }, { value: 'forage', label: `Forage (${g.forage ?? 0})` }, { value: 'nurse', label: `Nurse (${g.nurse ?? 0})` }, { value: 'dig', label: `Dig (${g.dig ?? 0})` }, { value: 'defend', label: `Defend (${g.defend ?? 0})` }, { value: 'idle', label: `Idle (${g.idle ?? 0})` }]}
      />
      <Select
        aria-label="Location" value={q.where} onChange={(v) => setQuery({ where: v })}
        options={[{ value: 'all', label: 'Anywhere' }, { value: 'nest', label: 'In the nest' }, { value: 'outside', label: 'Outside' }]}
      />
      <TextField aria-label="Search by ant number" placeholder="Ant number" value={q.search} onInput={(v) => setQuery({ search: v })} data-testid="roster-search" />
    </div>
  );
}

function Header() {
  const q = rosterQuery.value;
  return (
    <div class="fd-head-row" role="row">
      {COLUMNS.map((c) => {
        const sorted = q.sort === c.key;
        return (
          <div key={c.key} role="columnheader" aria-sort={sorted ? (q.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
            <button type="button" class={`fd-colhead${sorted ? ' is-sorted' : ''}`} onClick={() => setQuery({ ...nextSort(q, c.key) })} data-testid={`roster-sort-${c.key}`}>
              {c.label}{sorted && <Icon name={q.dir === 'asc' ? 'chevron-up' : 'chevron-down'} size={14} decorative />}
            </button>
          </div>
        );
      })}
      <span class="fd-colhead is-static" role="columnheader"><span class="ui-sr-only">Actions</span></span>
    </div>
  );
}

export function Roster() {
  const r = rosterSlice.value;
  const scroller = useRef<HTMLDivElement>(null);
  const [viewH, setViewH] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [active, setActive] = useState(0);
  const total = r?.total ?? 0;
  const rowPx = ROW_REM * remPx();
  const first = Math.floor(scrollTop / rowPx);
  const visible = Math.max(1, Math.ceil(viewH / rowPx));
  // the requested window: rows in view plus a margin, never more than the DOM budget (about 60 rows)
  useEffect(() => {
    const off = Math.max(0, first - OVERSCAN);
    const lim = Math.min(60, visible + 2 * OVERSCAN);
    const q = rosterQuery.peek();
    if (q.offset !== off || q.limit !== lim) { rosterQuery.value = { ...q, offset: off, limit: lim }; }
  }, [first, visible]);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    setViewH(el.clientHeight);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver((es) => setViewH(es[0]?.contentRect.height ?? 0)) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  const rows = (r?.rows ?? []).map((row, i) => ({ row, index: (r?.offset ?? 0) + i })).filter((x) => x.index >= first - OVERSCAN && x.index <= first + visible + OVERSCAN);
  const goTo = (index: number) => {
    const el = scroller.current;
    if (!el || total === 0) return;
    const i = Math.max(0, Math.min(total - 1, index));
    setActive(i);
    const top = i * rowPx, bottom = top + rowPx;
    if (top < el.scrollTop) el.scrollTop = top; else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight;
    requestAnimationFrame(() => el.querySelector<HTMLElement>(`[data-index="${i}"]`)?.focus({ preventScroll: true }));
  };
  const onKey = (e: KeyboardEvent) => {
    const rowEl = (e.target as HTMLElement).closest<HTMLElement>('[data-id]');
    if (!rowEl) return;
    const idx = Number(rowEl.dataset.index), id = Number(rowEl.dataset.id);
    const page = Math.max(1, visible - 1);
    const move: Record<string, number> = { ArrowDown: idx + 1, ArrowUp: idx - 1, PageDown: idx + page, PageUp: idx - page, Home: 0, End: total - 1 };
    if (e.key in move) { e.preventDefault(); goTo(move[e.key]); return; }
    if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) hudBridge.value?.follow(id); else facade.value?.possess(id); }
  };
  const b = r?.brood;
  return (
    <DrawerShell title="Roster" onClose={() => closePanel('roster')} class="fd-drawer fd-roster">
      <Quick />
      <Filters />
      <div class="fd-roster-meta" aria-live="polite">
        <span data-testid="roster-count">{total} {total === 1 ? 'ant' : 'ants'}</span>
        {r?.stale && <button type="button" class="fd-chip-btn" onClick={() => setQuery({ resort: rosterQuery.value.resort + 1, offset: rosterQuery.value.offset })} data-testid="roster-resort"><Icon name="reset" size={14} decorative /> Re-sort</button>}
      </div>
      <div class="fd-table" role="table" aria-label="Ants" aria-rowcount={total}>
        <Header />
        <div ref={scroller} class="fd-body ui-scroll" role="rowgroup" onScroll={(e) => setScrollTop((e.currentTarget as HTMLElement).scrollTop)} onKeyDown={onKey} data-testid="roster-body">
          <div class="fd-spacer" style={{ height: `${total * ROW_REM}rem` }}>
            {rows.map(({ row, index }) => <Row key={row.id} row={row} index={index} active={index === active} onActivate={() => setActive(index)} />)}
          </div>
          {total === 0 && <p class="fd-note fd-empty">No ants match these filters.</p>}
        </div>
      </div>
      {b && (
        <footer class="fd-roster-foot" data-testid="roster-brood">
          <Icon name="egg" size={16} decorative /> {b.egg} eggs <Icon name="larva" size={16} decorative /> {b.larva} larvae <Icon name="pupa" size={16} decorative /> {b.pupa} pupae
          {Object.keys(b.byCaste).length > 0 && <span class="fd-roster-castes"> · will be {Object.entries(b.byCaste).map(([k, n]) => casteCount(n, k)).join(', ')}</span>}
        </footer>
      )}
    </DrawerShell>
  );
}
