// The legend of an active overlay (GDD 08 10.1): a channel name with its pattern sample and what it encodes, a scale bar
// with ticks (temperature: the species' brood comfort band marked; moisture: contours at 25 / 50 / 75 %), and for the dig-plan
// overlay the list of plans with their status and reason. Palettes: Okabe-Ito, high contrast, pattern only.
import { cx } from '../components/cx';
import { Icon } from '../icons';
import { uiPrefs } from '../styles/prefs';
import type { UiPlanLine } from '../api';
import { chamberWord } from '../panels/nest/model';
import { BLOCKED_WORD, inkFor, legendFor, OVERLAY_ICON, type Legend as LegendModel, type LegendScale, type OverlayId, type PaletteId } from './catalogue';
import { Swatch } from './Patterns';

const STATUS_WORD: Record<string, string> = { proposed: 'Proposed', queued: 'Queued', active: 'Active', stalled: 'Stalled', paused: 'Paused', complete: 'Complete' };

function ScaleBar({ s, palette }: { s: LegendScale; palette: PaletteId }) {
  const stops = palette === 'pattern-only' ? ['#2a2620', '#8a8070', '#eee7d7'] : palette === 'high-contrast' ? ['#000000', '#FFD400', '#FFFFFF'] : s.stops;
  const bg = `linear-gradient(90deg, ${stops.join(', ')})`;
  return (
    <div class="ov-scale" data-testid="legend-scale">
      <div class="ov-scale-bar" style={{ background: bg }}>
        {s.band && <span class="ov-scale-band" style={{ left: `${s.band.from * 100}%`, width: `${(s.band.to - s.band.from) * 100}%` }} title={s.band.label} />}
        {s.ticks.map((t) => <span key={t.label} class="ov-scale-tick" style={{ left: `${t.at * 100}%` }} />)}
      </div>
      <div class="ov-scale-labels">
        {s.ticks.map((t) => <span key={t.label} style={{ left: `${t.at * 100}%` }}>{t.label}</span>)}
      </div>
      <div class="ov-scale-ends"><span>{s.lowWord}</span><span class="ov-scale-caption">{s.caption}</span><span>{s.highWord}</span></div>
      {s.band && <p class="ov-band-note"><span class="ov-band-mark" aria-hidden="true" /> {s.band.label}</p>}
    </div>
  );
}

function PlanList({ plans }: { plans: readonly UiPlanLine[] }) {
  if (plans.length === 0) return <p class="ov-muted">No plan is open.</p>;
  return (
    <ul class="ov-plans" data-testid="legend-plans">
      {plans.map((p) => (
        <li key={p.id} data-plan={p.id} data-status={p.status}>
          <span class="ov-plan-name">{p.kind === 'chamber' ? chamberWord(p.chamberType ?? 'general') : p.kind.charAt(0).toUpperCase() + p.kind.slice(1)} {p.id}</span>
          <span class="ov-plan-status">{p.source === 'architect' && p.status === 'proposed' ? 'Architect' : STATUS_WORD[p.status] ?? p.status}{p.status === 'active' ? ` ${Math.round(p.progress * 100)} %` : ''}</span>
          {p.status === 'stalled' && p.blockedReason && <span class="ov-plan-reason"><Icon name="status-warn" size={14} decorative /> {BLOCKED_WORD[p.blockedReason] ?? p.blockedReason}</span>}
        </li>
      ))}
    </ul>
  );
}

export interface LegendProps {
  id: OverlayId;
  comfort?: { lo: number; hi: number } | null;
  plans?: readonly UiPlanLine[];
  palette?: PaletteId;
  class?: string;
}

export function LegendCard({ id, comfort = null, plans = [], palette, class: cls }: LegendProps) {
  const pal = palette ?? uiPrefs.prefs.value.accessibility.overlayPalette;
  const L: LegendModel = legendFor(id, comfort);
  return (
    <section class={cx('ov-legend', 'fd-chip', cls)} aria-label={`${L.title} legend`} data-testid="legend" data-overlay={id} data-palette={pal}>
      <h3 class="ov-legend-title"><Icon name={OVERLAY_ICON[id]} size={18} decorative /> {L.title}</h3>
      {L.entries.length > 0 && (
        <ul class="ov-entries">
          {L.entries.map((e, i) => (
            <li key={e.id} data-entry={e.id} data-pattern={e.pattern}>
              <Swatch pattern={e.pattern} ink={inkFor(pal, e.hue, i)} label={e.label} />
              <span class="ov-entry-text"><b>{e.label}</b>{e.note && <span class="ov-muted"> · {e.note}</span>}</span>
            </li>
          ))}
        </ul>
      )}
      {L.scale && <ScaleBar s={L.scale} palette={pal} />}
      {id === 'dig-plans' && <PlanList plans={plans} />}
      <p class="ov-footnote">{L.footnote}</p>
    </section>
  );
}
