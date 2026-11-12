// The first-brood time-lapse overlay (GDD 08 §7.10 `timelapse-founding`, GDD 06 §5.11): caption, advancing date,
// the stage strip (egg -> larva -> pupa -> worker with counts), the queen's reserves draining, losses, progress
// and Skip (hold the tl-skip key 1 s, or the button). The UI never computes outcomes: everything is the sim's.
import { Button, KeyHint, ProgressBar } from '../../components';
import type { FoundingUi } from './store';

const STAGES: { id: string; label: string; counter: string; beats: string[] }[] = [
  { id: 'egg', label: 'Eggs', counter: 'eggs', beats: ['eggs'] },
  { id: 'larva', label: 'Larvae', counter: 'larvae', beats: ['larvae'] },
  { id: 'pupa', label: 'Pupae', counter: 'pupae', beats: ['pupae', 'cocoons'] },
  { id: 'worker', label: 'Workers', counter: 'workers', beats: ['eclosion', 'final'] },
];

export function TimelapseOverlay({ lapse, onSkip }: { lapse: NonNullable<FoundingUi['lapse']>; onSkip: () => void }) {
  const c = lapse.counters;
  return (
    <>
      <div class="fo-chip fo-lapse-cap" data-testid="founding-lapse">
        <div class="fo-lapse-title">First brood</div>
        <div class="fo-lapse-date">{lapse.date}</div>
      </div>
      <div class="fo-chip fo-lapse-gauge">
        <div class="fo-label">Queen's reserves</div>
        <div class="fo-bar"><i style={{ width: `${Math.max(0, Math.min(1, c.reserves ?? 0)) * 100}%` }} /></div>
        <div class="fo-num">{Math.round((c.reserves ?? 0) * 100)} %</div>
      </div>
      <div class="fo-chip fo-lapse-losses">
        <div><span class="fo-label">Eaten by the queen </span><span class="fo-num">{c.eaten ?? 0}</span></div>
        <div><span class="fo-label">Brood lost </span><span class="fo-num">{c.lost ?? 0}</span></div>
      </div>
      <div class="fo-chip fo-lapse-strip">
        <div class="fo-stages">
          {STAGES.map((s) => (
            <div key={s.id} class={`fo-stage${s.beats.includes(lapse.stage) ? ' is-now' : ''}`} data-testid={`founding-stage-${s.id}`}>
              <b>{c[s.counter] ?? 0}</b><span>{s.label}</span>
            </div>
          ))}
        </div>
        <div class="fo-lapse-foot">
          <ProgressBar value={lapse.progress} aria-label="First brood" />
          {lapse.skipping
            ? <span class="fo-label">Skipping…</span>
            : <Button variant="secondary" onClick={onSkip} data-testid="founding-skip"><KeyHint action="tl-skip">Skip</KeyHint></Button>}
        </div>
      </div>
    </>
  );
}
