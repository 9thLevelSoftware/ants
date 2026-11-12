// The opening's cards: the time-lapse outcome (GDD 08 §7.10 "First workers: 11. Queen's reserves: 38 %."), the
// hand-over banner with the first aims (GDD 06 §5.13: Tab to take a worker, or stay with the queen), and the calm
// failure card with retry (GDD 06 §5.14).
import { Button, KeyHint } from '../../components';
import type { FoundingActions, FoundingUi } from './store';

export function OutcomeCard({ o, a }: { o: NonNullable<FoundingUi['outcome']>; a: FoundingActions }) {
  return (
    <div class="fo-card-wrap">
      <div class="fo-card" data-testid="founding-outcome" role="dialog" aria-label="First brood">
        <h2>First workers: {o.workers}</h2>
        <p>Queen's reserves: {Math.round(o.reserves * 100)} %</p>
        <div class="fo-card-buttons"><Button variant="primary" autoFocus onClick={() => a.closeOutcome()} data-testid="founding-continue">Continue</Button></div>
      </div>
    </div>
  );
}

export function HandoverBanner({ h, a }: { h: NonNullable<FoundingUi['handover']>; a: FoundingActions }) {
  return (
    <div class="fo-chip fo-handover" data-testid="founding-handover">
      <div><KeyHint action="possess-next">to take a worker, or stay with the queen</KeyHint></div>
      {h.aims.length > 0 && <ul>{h.aims.map((t) => <li key={t}>{t}</li>)}</ul>}
      <div class="fo-card-buttons">
        <Button variant="secondary" onClick={() => a.stayWithQueen()} data-testid="founding-stay">Stay with the queen</Button>
        <Button variant="primary" onClick={() => a.takeWorker()} data-testid="founding-worker">Take a worker</Button>
      </div>
    </div>
  );
}

export function FailureCard({ f, a }: { f: NonNullable<FoundingUi['failure']>; a: FoundingActions }) {
  return (
    <div class="fo-card-wrap">
      <div class="fo-card" data-testid="founding-failed" role="dialog" aria-label="The founding did not succeed">
        <h2>The founding did not succeed</h2>
        <p>{f.text}</p>
        <div class="fo-card-buttons">
          {f.retriesLeft > 0 && <Button variant="primary" autoFocus onClick={() => a.retry()} data-testid="founding-retry">Try another site</Button>}
          <Button variant="secondary" onClick={() => a.acceptFailure()} data-testid="founding-accept">Let it end</Button>
        </div>
      </div>
    </div>
  );
}
