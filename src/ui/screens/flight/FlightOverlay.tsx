// The nuptial flight's screens (GDD 06 §11.5-§11.6): the release prompt ("Conditions are good. Release the alates?"),
// the take-off prompt (Fly as a young queen / Watch / Continue), the flight read-out while flying (phase, height,
// strength, mating bar, the swarm's direction) and the end card with the daughter offer. Mounted by src/ui/App.tsx.
import { useEffect } from 'preact/hooks';
import { Button } from '../../components';
import { snapshot } from '../../store';
import { count, FLIGHT_OUTCOME, PHASE_WORD, pct } from '../epitaph/words';
import css from './flight.css?inline';
import { flightActions, flightUi, type FlightActions, type FlightUi } from './store';

const STYLE_ID = 'foundress-flight-styles';

function installStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = css;
  document.head.appendChild(el);
}

function Meter({ label, v, tone }: { label: string; v: number; tone: string }) {
  return (
    <div class="fl-meter">
      <span class="fl-label">{label}</span>
      <div class={`fl-bar is-${tone}`}><i style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%` }} /></div>
      <span class="fl-num">{pct(v)}</span>
    </div>
  );
}

function Flying({ f, a }: { f: NonNullable<FlightUi['flying']>; a: FlightActions }) {
  return (
    <>
      <div class="fl-chip fl-cap" data-testid="flight-hud">
        <div class="fl-title">Nuptial flight</div>
        <div class="fl-sub">{PHASE_WORD[f.phase] ?? f.phase} · {Math.round(f.heightBu)} body lengths up · wind {f.windMs.toFixed(1)} m/s</div>
      </div>
      <div class="fl-chip fl-meters">
        <Meter label="Strength" v={f.energy} tone="energy" />
        <Meter label="Mating" v={f.mating} tone="mating" />
        <div class="fl-label">{f.mated ? 'Mated. Find bare soil and come down.' : `The swarm: ${Math.round(f.lekDistBu)} body lengths away, above the high ground`}</div>
      </div>
      <div class="fl-chip fl-keys">
        <span class="fl-label">Steer with the camera · Space climb · Shift descend</span>
        <Button variant="secondary" onClick={() => a.landNow()} data-testid="flight-land">Land now</Button>
      </div>
    </>
  );
}

export function FlightOverlay() {
  useEffect(installStyles, []);
  const ui = flightUi.value;
  const a = flightActions.value;
  const snap = snapshot.value;
  if (!ui || !a || snap.view === 'photo' || (snap.screen !== 'playing' && snap.screen !== 'paused')) return null;
  return (
    <div class="fl-root" data-testid="flight-root">
      {ui.ask && (
        <div class="fl-chip fl-prompt" data-testid="flight-ask" role="status">
          <div>Conditions are good. Release the alates?</div>
          <div class="fl-buttons">
            <Button variant="primary" onClick={() => a.release()} data-testid="flight-release">Release</Button>
            <Button variant="secondary" onClick={() => a.wait()} data-testid="flight-wait">Wait</Button>
          </div>
        </div>
      )}
      {ui.launch && (
        <div class="fl-chip fl-prompt" data-testid="flight-launch" role="status">
          <div>The winged ants are leaving: {count(ui.launch.gynes, 'young queen')}, {count(ui.launch.males, 'male')}.</div>
          <div class="fl-buttons">
            <Button variant="primary" onClick={() => a.flyAsQueen()} data-testid="flight-fly">Fly as a young queen</Button>
            <Button variant="secondary" onClick={() => a.watch()} data-testid="flight-watch">Watch</Button>
            <Button variant="ghost" onClick={() => a.watch()} data-testid="flight-continue">Continue</Button>
          </div>
        </div>
      )}
      {ui.flying && <Flying f={ui.flying} a={a} />}
      {ui.ended && (
        <div class="fl-card-wrap">
          <div class="fl-card" role="dialog" aria-label="The flight is over" data-testid="flight-ended">
            <h2>The flight is over</h2>
            <p>{FLIGHT_OUTCOME[ui.ended.outcome] ?? ''}</p>
            <p>
              {count(ui.ended.launched, 'winged ant')} left the nest; {count(ui.ended.mated, 'queen')} mated;{' '}
              {ui.ended.daughters === 0 ? 'none began a nest of her own.' : `${ui.ended.daughters} began ${ui.ended.daughters === 1 ? 'a nest of her own' : 'nests of their own'}.`}
            </p>
            {ui.ended.founded && <p>She has begun to dig. Her colony is in the Lineage.</p>}
            <div class="fl-buttons">
              {ui.ended.daughters > 0 && <Button variant="primary" onClick={() => a.openLineage()} data-testid="flight-lineage">Found a daughter colony</Button>}
              <Button variant="secondary" autoFocus onClick={() => a.closeEnded()} data-testid="flight-close">Continue</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
