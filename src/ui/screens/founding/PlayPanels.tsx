// The opening's in-play panels (GDD 06 §5.5-§5.10, GDD 08 §9.2-§9.3): the queen's meters (reserves, shelter clock,
// health), the site read-out card, the readiness bar, the script's glyph prompts and the clutch forecast.
import { Button, KeyHint, ProgressBar } from '../../components';
import { inputDevice } from '../../nav/device';
import { onboarding } from '../../hud/prompts/state';
import { promptVisibility } from '../../hud/prompts/foundingShown';
import type { FoundingUi } from './store';

const pct = (v: number): string => `${Math.round(v * 100)} %`;

function Bar({ value, cls }: { value: number; cls?: string }) {
  return <div class={`fo-bar${cls ? ` ${cls}` : ''}`}><i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} /></div>;
}

export function QueenMeters({ q }: { q: NonNullable<FoundingUi['queen']> }) {
  return (
    <div class="fo-chip fo-queen" data-testid="founding-queen">
      <div class="fo-meter"><span class="fo-label">Reserves</span><Bar value={q.reserves} /><span class="fo-num">{pct(q.reserves)}</span></div>
      <div class="fo-meter"><span class="fo-label">Drying</span><Bar value={q.desiccation} cls="is-dry" /><span class="fo-num">{pct(q.desiccation)}</span></div>
      <div class="fo-meter"><span class="fo-label">Health</span><Bar value={q.health} cls="is-health" /><span class="fo-num">{pct(q.health)}</span></div>
    </div>
  );
}

/** A 5-step dotted scale (GDD 08 §9.3: "Moisture ●●●○○ damp"). */
function Dots({ n }: { n: number }) {
  return <span class="fo-dots" aria-hidden="true">{'●'.repeat(n)}<span class="off">{'○'.repeat(5 - n)}</span></span>;
}

export function SiteReadout({ site }: { site: NonNullable<FoundingUi['site']> }) {
  const word = site.word ?? 'poor';
  return (
    <div class="fo-chip fo-site" data-testid="founding-site" aria-live="polite">
      <div class="fo-site-head">
        <span class={`fo-site-word is-${word}`}>{word[0].toUpperCase() + word.slice(1)}</span>
        <span class="fo-label">{site.chamberQ !== null ? 'Chamber Q ' : 'Q '}<span class="fo-num">{site.q.toFixed(2)}</span></span>
      </div>
      {site.rows.map((r) => (
        <div class="fo-site-row" key={r.id}>
          <span class="fo-label">{r.label}</span><Dots n={r.dots} /><span>{r.word}</span>
        </div>
      ))}
    </div>
  );
}

export function Readiness({ r }: { r: NonNullable<FoundingUi['readiness']> }) {
  return (
    <div class="fo-chip fo-ready" data-testid="founding-readiness">
      <div class="fo-label">{r.ready ? 'The chamber is ready' : 'Chamber'}</div>
      <ProgressBar value={r.r} stages={[0.4, 0.6]} aria-label="Founding readiness" valueText={pct(r.r)} />
      <div class="fo-ready-parts"><span>Depth {pct(r.depth)}</span><span>Room {pct(r.volume)}</span></div>
    </div>
  );
}

/** The script's glyph prompts; a prompt whose hint the engine no longer allows (learned, dismissed, off) is left out. */
export function Prompts({ ui, onTend }: { ui: FoundingUi; onTend: () => void }) {
  const engine = onboarding.value?.engine;
  const shown = promptVisibility(ui, (id) => (engine ? engine.allows(id) : true));
  const prompts = ui.prompts.filter((_, i) => shown[i]);
  if (prompts.length === 0) return null;
  return (
    <div class="fo-chip fo-prompts" data-testid="founding-prompts">
      {prompts.map((p) => (p.action === 'tend'
        ? (
          <span key="tend" class="fo-tend">
            <Button variant="primary" onClick={onTend} disabled={!ui.canBeginLapse} data-testid="founding-tend">{p.text}</Button>
            {/* a pad has no pointer: holding the interact button begins the lapse (src/ui/nav controller) */}
            {inputDevice.value === 'pad' && <KeyHint action="interact">hold to tend</KeyHint>}
          </span>
        )
        : <KeyHint key={p.action} action={p.action}>{p.text}</KeyHint>))}
    </div>
  );
}

export function ClutchPanel({ c }: { c: NonNullable<FoundingUi['clutch']> }) {
  return (
    <div class="fo-chip fo-clutch" data-testid="founding-clutch">
      <div><span class="fo-label">Eggs </span><span class="fo-num">{c.eggs}</span><span class="fo-label"> of {c.limit}</span></div>
      {c.expected && <div class={`is-${c.risk}`}><span class="fo-label">First workers </span><span class="fo-num">{c.expected[0]}-{c.expected[1]}</span></div>}
      {c.reservesAtFirst !== null && <div class={`is-${c.risk}`}><span class="fo-label">Reserves then </span><span class="fo-num">{pct(Math.max(0, c.reservesAtFirst))}</span></div>}
      {c.safeEggs !== null && <div><span class="fo-label">Safe up to </span><span class="fo-num">{c.safeEggs}</span><span class="fo-label"> eggs</span></div>}
    </div>
  );
}
