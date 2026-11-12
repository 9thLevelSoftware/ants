// The other sections of Colony orders (GDD 08 4.2, GDD 02 12.1): brood production, diet emphasis, stores and safety,
// and the nest architect. Every control has a plain line saying what it changes. Controls send `setDirectives` (or
// `setAutoExpand`) through the facade; the shown value follows the draft until the snapshot catches up.
import { SegmentedControl } from '../../components/SegmentedControl';
import { Select } from '../../components/Select';
import { Slider } from '../../components/Slider';
import { Toggle } from '../../components/Toggle';
import { Tooltip } from '../../components/Tooltip';
import type { UiDirectives } from '../../api';
import { gameDays, loads } from '../../hud/format';
import { useCommit } from './useCommit';
import { blockSyntheticVertical } from '../../hud/padGuard';

export interface SectionProps {
  d: UiDirectives;
  setDirectives: (patch: Record<string, unknown>) => void;
  /** Sends any command (setAutoExpand); absent in the demo. */
  command?: (cmd: Record<string, unknown>) => void;
}

const BROOD_PRESETS = [{ value: 0, label: 'Workers only' }, { value: 0.5, label: 'Balanced' }, { value: 1, label: 'Raise alates' }] as const;

export function BroodSection({ d, setDirectives }: SectionProps) {
  const [invest, setInvest] = useCommit(d.alateInvestment, (v) => setDirectives({ alateInvestment: v }));
  const blocked = !d.alates.ok || !d.queenAlive;
  const reason = !d.queenAlive ? 'No queen: no new eggs' : d.alates.reason ?? '';
  const preset = BROOD_PRESETS.reduce((best, p) => (Math.abs(p.value - invest) < Math.abs(best.value - invest) ? p : best), BROOD_PRESETS[0]);
  const castes = Object.entries(d.broodByCaste).map(([k, n]) => `${n} ${k}`).join(' · ');
  return (
    <section class="fd-sec" aria-labelledby="fd-sec-brood" data-testid="dir-brood">
      <h3 id="fd-sec-brood" class="fd-sec-h">Brood production</h3>
      <p class="fd-help">Raising winged queens and males costs a great deal of food. Workers only keeps every egg a worker.</p>
      <Tooltip text={reason || 'Workers, or a share of winged queens and males'} placement="bottom">
        <SegmentedControl
          options={BROOD_PRESETS.map((p) => ({ value: p.value, label: p.label, disabled: blocked && p.value > 0, reason }))}
          value={preset.value} onChange={(v) => setInvest(v)} aria-label="Brood production" disabled={!d.queenAlive}
        />
      </Tooltip>
      {blocked && <p class="fd-note" data-testid="dir-brood-reason">{reason}</p>}
      <Select
        options={[{ value: 'auto-release', label: 'Release alates when ready' }, { value: 'ask', label: 'Ask me first' }, { value: 'hold', label: 'Hold them in the nest' }]}
        value={d.alatePolicy} onChange={(v) => setDirectives({ alatePolicy: v })} aria-label="When alates are ready" disabled={blocked}
      />
      <details class="fd-more-opts">
        <summary>More</summary>
        <Slider min={0} max={100} step={5} value={Math.round(invest * 100)} onChange={(v) => setInvest(v / 100)} format={(v) => `${v} %`} aria-label="Share of effort for winged queens and males" disabled={blocked} />
        <p class="fd-help">A finer setting between the three choices above.</p>
      </details>
      <p class="fd-help">Brood now: {castes || 'none'}.</p>
    </section>
  );
}

export function DietSection({ d, setDirectives }: SectionProps) {
  const auto = d.diet === 'auto';
  const [diet, setDiet] = useCommit<number>(auto ? 0 : (d.diet as number), (v) => setDirectives({ diet: v }));
  const word = diet === 0 ? 'balanced' : diet < 0 ? `${-diet} % toward carbohydrate` : `${diet} % toward protein`;
  return (
    <section class="fd-sec" aria-labelledby="fd-sec-diet" data-testid="dir-diet">
      <h3 id="fd-sec-diet" class="fd-sec-h">Diet emphasis</h3>
      <p class="fd-help">Tilts which food the foragers favour. Larvae and the queen still need what they need; this only changes where the colony looks.</p>
      <Toggle checked={auto} label={<>Auto<span class="ui-sr-only"> diet</span></>} onChange={(on) => setDirectives({ diet: on ? 'auto' : diet })} />
      <div class="fd-diet">
        <span class="fd-diet-end"><span class="fd-stat-letter tone-c">C</span> Carbohydrate</span>
        <span class="fd-diet-end is-right">Protein <span class="fd-stat-letter tone-p">P</span></span>
      </div>
      <div onKeyDownCapture={blockSyntheticVertical}><Slider min={-100} max={100} step={5} value={diet} onChange={(v) => setDiet(v)} format={(v) => (v === 0 ? '0' : v > 0 ? `+${v}` : String(v))} aria-label="Diet emphasis" disabled={auto} /></div>
      <p class="fd-help" data-testid="dir-diet-word">{auto ? 'The colony decides.' : `Favouring: ${word}.`}</p>
      <p class="fd-help">In store: C {loads(d.stores.c)} · P {loads(d.stores.p)}. Brought in today: C {loads(d.intake.c)} · P {loads(d.intake.p)}. Larvae now: {d.larvae}.</p>
    </section>
  );
}

const STOCK = [{ value: 'low', label: 'Low' }, { value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }];
const STANCES = [{ value: 'cautious', label: 'Cautious' }, { value: 'defensive', label: 'Defensive' }, { value: 'aggressive', label: 'Aggressive' }];

export function SafetySection({ d, setDirectives }: SectionProps) {
  return (
    <section class="fd-sec" aria-labelledby="fd-sec-safety" data-testid="dir-safety">
      <h3 id="fd-sec-safety" class="fd-sec-h">Stores and safety</h3>
      <p class="fd-help">Food stored: C {gameDays(d.stockDays.c)}, P {gameDays(d.stockDays.p)}. A higher target raises foraging while stores are low, to prepare for winter.</p>
      <SegmentedControl options={STOCK} value={d.stockTarget} onChange={(v) => setDirectives({ stockTarget: v })} aria-label="Stock target" />
      <Toggle checked={d.stayIn} label="Keep foragers in" onChange={(on) => setDirectives({ stayIn: on })} aria-label="Keep foragers in" />
      <p class="fd-help">{d.stayIn ? `No departures; ants outside come home. Clears in about ${Math.max(1, Math.round(d.stayInHoursLeft))} game hours.` : 'No departures; ants outside come home. Clears by itself after one game day.'}</p>
      <SegmentedControl options={STANCES} value={d.stance} onChange={(v) => setDirectives({ stance: v })} aria-label="Stance toward rivals" />
      <p class="fd-help">How the colony meets rival ants and predators near the nest.</p>
    </section>
  );
}

export function NestSection({ d, setDirectives, command }: SectionProps) {
  const modes = [
    { value: 'auto', label: 'Auto' },
    { value: 'suggest', label: 'Suggest', disabled: true, reason: 'Suggestions arrive with the full sandbox' },
    { value: 'off', label: 'Off' },
  ];
  return (
    <section class="fd-sec" aria-labelledby="fd-sec-nest" data-testid="dir-nest">
      <h3 id="fd-sec-nest" class="fd-sec-h">Nest</h3>
      {d.architect === null ? (
        <p class="fd-note">There is no nest to extend yet.</p>
      ) : (
        <>
          <SegmentedControl
            options={modes} value={d.architect} aria-label="Nest architect" disabled={!command}
            onChange={(v) => command?.({ type: 'setAutoExpand', nestId: d.nestId, mode: v })}
          />
          <p class="fd-help">Auto lets the ants extend the nest where space is short; Off carries out only your own dig plans. Open plans now: {d.openPlans}.</p>
        </>
      )}
      <Toggle checked={d.sealInCold} label="Seal entrances in cold weather" onChange={(on) => setDirectives({ sealInCold: on })} aria-label="Seal entrances in cold weather" />
      <p class="fd-help">Closes the entrances when it turns cold and opens them again when it warms.</p>
    </section>
  );
}
