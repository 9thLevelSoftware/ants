// Nest overview (GDD 08 4.6, screen id `nest`, key U): a right-docked drawer with the schematic nest, the chamber table
// (type, volume, occupancy against capacity, temperature with its brood comfort mark, humidity, risk words), the
// designation control of the selected chamber (`designateChamber`, only valid types are listed) and the entrances.
import { useMemo } from 'preact/hooks';
import { Icon } from '../../icons';
import { DrawerShell } from '../../hud/DrawerShell';
import { closePanel } from '../../hud/state';
import { Select } from '../../components/Select';
import { cx } from '../../components/cx';
import type { UiNest } from '../../api';
import { nestSlice } from '../wiring/slices';
import { nestSelection, panelsBridge } from '../wiring/state';
import { NestDiagram, OccupancyKey } from './Diagram';
import { chamberRows, chamberShort, chamberWord, designationOptions, layoutSchematic, loadParts, mainLoadKey, type ChamberRow } from './model';

const COMFORT_WORD = { within: 'In range', outside: 'Outside range', none: '' } as const;
const SHAPE_ICON = { bad: 'status-bad', warn: 'status-warn', watch: 'status-watch' } as const;

function Risks({ row }: { row: ChamberRow }) {
  if (row.risks.length === 0) return <span class="pn-muted">None</span>;
  return (
    <span class="pn-risks">
      {row.risks.map((r) => <span key={r.word} class={`pn-risk is-${r.shape}`}><Icon name={SHAPE_ICON[r.shape]} size={14} decorative />{r.word}</span>)}
    </span>
  );
}

function ComfortMark({ row }: { row: ChamberRow }) {
  if (row.comfort === 'none') return null;
  const ok = row.comfort === 'within';
  return <span class={`pn-comfort is-${ok ? 'ok' : 'warn'}`} title={COMFORT_WORD[row.comfort]}><Icon name={ok ? 'status-ok' : 'status-warn'} size={14} label={COMFORT_WORD[row.comfort]} /></span>;
}

function mainLoad(n: UiNest, row: ChamberRow): { text: string; key: string } {
  const c = n.chambers.find((x) => x.id === row.id);
  const parts = c ? loadParts(c.occupancy, c.capacity) : [];
  if (parts.length === 0) return { text: '—', key: '' };
  const main = parts.find((p) => p.key === mainLoadKey(row.type)) ?? parts[0];
  return { text: `${Math.round(main.n)} / ${Math.round(main.cap)}`, key: main.key };
}

function EntranceList({ n }: { n: UiNest }) {
  const bridge = panelsBridge.value;
  if (n.entrances.length === 0) return <p class="pn-muted">No entrance yet.</p>;
  return (
    <ul class="pn-entrances" data-testid="nest-entrances">
      {n.entrances.map((e) => {
        const open = e.status === 'open';
        return (
          <li key={e.id} class="pn-entrance" data-entrance={e.id} data-status={e.status}>
            <span class={`pn-shape ${open ? 'is-ok' : 'is-warn'}`}><Icon name={open ? 'status-ok' : 'status-warn'} size={16} decorative /></span>
            <span class="pn-entrance-text">
              <b>Entrance {e.id}</b> · {open ? 'Open' : e.status.charAt(0).toUpperCase() + e.status.slice(1)}
              <span class="pn-muted"> · {e.moundBu ? `mound ${Math.round(e.moundBu * 10) / 10} BU` : 'no mound'} · {Math.round(e.trafficIn)} in, {Math.round(e.trafficOut)} out per game hour</span>
            </span>
            {bridge && (e.status === 'open' || e.status === 'sealed') && (
              <button type="button" class="pn-link" onClick={() => bridge.toggleEntrance(e.id)} data-testid="nest-entrance-toggle">{open ? 'Seal' : 'Reopen'}</button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function NestDrawer() {
  const n = nestSlice.value;
  const selected = nestSelection.value;
  const layout = useMemo(() => (n ? layoutSchematic(n) : null), [n]);
  const rows = useMemo(() => (n ? chamberRows(n) : []), [n]);
  const bridge = panelsBridge.value;
  const pick = (id: number): void => {
    nestSelection.value = id;
    bridge?.jumpToChamber(id);
  };
  const sel = n?.chambers.find((c) => c.id === selected) ?? null;
  const selRow = rows.find((r) => r.id === selected) ?? null;
  return (
    <DrawerShell title="Nest overview" onClose={() => closePanel('nest')} class="fd-drawer pn-drawer pn-nest" initial=".pn-row-btn">
      {!n || !layout ? (
        <p class="pn-empty">There is no nest yet.</p>
      ) : (
        <>
          <p class="pn-nest-sum" data-testid="nest-summary">
            <b>{n.chambers.length}</b> {n.chambers.length === 1 ? 'chamber' : 'chambers'} · <b>{Math.round(n.volumeOpen)}</b> BU³ open · <b>{n.openPlans}</b> {n.openPlans === 1 ? 'plan' : 'plans'} open
          </p>
          <NestDiagram layout={layout} selected={selected} onPick={pick} label={`Side view of the nest: ${n.chambers.length} chambers, ${n.entrances.length} entrances`} />
          <OccupancyKey />
          {rows.length === 0 ? <p class="pn-muted">No chamber is registered yet.</p> : (
            <table class="pn-table" data-testid="nest-table">
              <thead>
                <tr><th scope="col">Chamber</th><th scope="col" class="is-num" title="Volume in BU³">Vol.</th><th scope="col" class="is-num" title="Held against capacity">Held</th><th scope="col" class="is-num">Temp.</th><th scope="col" class="is-num" title="Relative humidity">RH</th><th scope="col">Risk</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const load = mainLoad(n, r);
                  return (
                    <tr key={r.id} class={cx('pn-chamber-row', selected === r.id && 'is-selected')} data-chamber={r.id} data-type={r.type}>
                      <th scope="row">
                        <button type="button" class="pn-row-btn" onClick={() => pick(r.id)} aria-pressed={selected === r.id ? 'true' : 'false'} title="Show in the colony view">
                          <Icon name={`chamber-${r.type}`} size={18} decorative /> <span>{chamberShort(r.type)} <span class="pn-id">{r.id}</span></span>
                        </button>
                      </th>
                      <td class="is-num">{r.volume}</td>
                      <td class="is-num" title={r.load}>{load.text}</td>
                      <td class="is-num">{r.temp} °C <ComfortMark row={r} /></td>
                      <td class="is-num">{r.humidityPct} %</td>
                      <td><Risks row={r} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {sel && selRow && (
            <section class="pn-chamber-detail" aria-label={`Chamber ${sel.id}`} data-testid="nest-detail">
              <h3 class="pn-h3">{chamberWord(sel.type)} {sel.id}</h3>
              <p class="pn-muted pn-small">{selRow.load}. Designated by {sel.designatedBy === 'player' ? 'you' : 'the colony'}.</p>
              {/* the Select sits in a div, not a label: a click on an option would bubble to the label and reopen the list */}
              {selRow.options.length > 0 ? (
                <div class="pn-field">
                  <span>Use as</span>
                  <Select
                    aria-label={`Use of chamber ${sel.id}`} value={sel.type}
                    options={designationOptions(sel.type, selRow.options)}
                    onChange={(t: string) => { if (t !== sel.type) bridge?.designateChamber(sel.id, t); }}
                  />
                </div>
              ) : <p class="pn-muted pn-small">This chamber cannot be given another use now.</p>}
            </section>
          )}
          <h3 class="pn-h3">Entrances</h3>
          <EntranceList n={n} />
        </>
      )}
    </DrawerShell>
  );
}
