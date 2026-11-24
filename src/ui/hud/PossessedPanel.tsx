// Possessed-ant panel (GDD 08 5.2): identity with age, task and the behaviour's state and reason, health (with the heat
// glyph), crop as a C / P meter (a founding queen's reserves replace it), what is carried, the acid reserve, and a
// compass to the nearest own entrance. The queen after hand-over also gets the "Colony orders" button. Box 304 x 112 dp.
import type { UiPossessed } from '../api';
import { Button } from '../components/Button';
import { KeyHint } from '../components/KeyHint';
import { Meter } from '../components';
import { Icon } from '../icons';
import { STORES_FULL_NOTE } from '@/content/text';
import { CASTE_ICON, cap, loads, pct, TASK_ICON } from './format';
import { possessedSlice } from './slices';
import { openPanel } from './state';

function Compass({ home }: { home: NonNullable<UiPossessed['home']> }) {
  return (
    <span class="fd-home" aria-label={`Nearest entrance ${home.distBu} body units, ${Math.round(home.angleDeg)} degrees clockwise from straight ahead`} data-testid="possessed-home">
      <svg class="fd-compass" viewBox="0 0 24 24" width="1rem" height="1rem" aria-hidden="true" style={{ transform: `rotate(${home.angleDeg}deg)` }}>
        <path d="M12 3l5 14-5-3-5 3z" fill="currentColor" stroke="none" />
      </svg>
      <span>{home.distBu} BU</span>
    </span>
  );
}

function CropMeter({ p }: { p: UiPossessed }) {
  if (p.reserves !== null && p.reserves !== undefined) {
    return <Meter class="fd-meter" label="Reserves" value={p.reserves} max={1} tone={p.reserves < 0.25 ? 'warn' : 'ok'} reserve text={pct(p.reserves)} />;
  }
  const cap1 = Math.max(p.cropCap, 0.01);
  return (
    <Meter
      class="fd-meter" label="Crop" max={cap1}
      segments={[{ value: p.cropC, tone: 'c', mark: 'C' }, { value: p.cropP, tone: 'p', mark: 'P' }]}
      text={`C ${loads(p.cropC)} · P ${loads(p.cropP)}`}
    />
  );
}

export function PossessedPanel() {
  const p = possessedSlice.value;
  if (!p) return null;
  const heat = p.heatStress === true;
  return (
    <section class="fd-pp fd-chip" aria-label="Possessed ant" data-hud="possessed" data-testid="possessed">
      <div class="fd-pp-id">
        <Icon name={CASTE_ICON[p.caste] ?? 'ant-worker'} size={20} decorative />
        <b class="fd-pp-name" data-testid="possessed-name">{p.name ?? `${cap(p.caste)} ${p.id}`}</b>
        {p.ageDays !== undefined && <span class="fd-pp-age">{p.ageDays.toFixed(1)} d</span>}
        {p.colonyOrders && (
          <Button variant="ghost" class="fd-orders" onClick={() => openPanel('directives')} data-testid="colony-orders-button">
            Colony orders <KeyHint action="directives" />
          </Button>
        )}
      </div>
      <div class="fd-pp-state" data-testid="possessed-state">
        <Icon name={TASK_ICON[p.task] ?? 'task-idle'} size={16} decorative />
        <span>{cap(p.task.replace(/-/g, ' '))}</span>
        {p.stateWord && p.stateWord.toLowerCase() !== p.task.replace(/-/g, ' ') && <span class="fd-pp-word">· {p.stateWord}</span>}
        {p.reason && <span class="fd-pp-word">· {p.reason}</span>}
      </div>
      <div class="fd-pp-health">
        <Meter class="fd-meter" label="Health" value={p.health} max={1} tone={p.health < 0.3 ? 'bad' : p.health < 0.6 ? 'warn' : 'ok'} text={pct(p.health)} />
        {heat && <Icon name="thermometer" size={16} label="Heat stress" class="fd-heat" />}
      </div>
      <CropMeter p={p} />
      {p.storesFull && <div class="fd-pp-note" role="status" data-testid="possessed-stores-full">{STORES_FULL_NOTE}</div>}
      {p.acid && <Meter class="fd-meter" label="Acid" value={p.acid.charges} max={Math.max(1, p.acid.max)} tone="neutral" text={`${p.acid.charges} / ${p.acid.max}`} />}
      <div class="fd-pp-foot">
        <span class="fd-pp-carry" data-testid="possessed-carry"><Icon name="carry" size={16} decorative /> {p.carrying === 'nothing' ? '—' : p.carrying}</span>
        {p.home && !p.underground && <Compass home={p.home} />}
        {p.trailOn && <span class="fd-pp-trail"><Icon name="overlay-scent" size={16} decorative /> Laying trail</span>}
      </div>
    </section>
  );
}
