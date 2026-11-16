// The overwintering screens (GDD 06 §6.2-§6.5): the non-modal banner (Begin / Delay one day), the winter time-lapse
// overlay (frost strip, day counter, the cluster, stores draining, beats) with Skip, and the Winter Report card.
// Everything shown comes from the winter flow's read-out; mounted by src/ui/App.tsx.
import { useEffect } from 'preact/hooks';
import { Button, ProgressBar } from '../../components';
import { snapshot } from '../../store';
import { BEAT_WORD, causeNoun, count, loads, pct, SPECIES_NAME, WINTER_REMEDY } from '../epitaph/words';
import css from './winter.css?inline';
import { winterActions, winterUi, type WinterActions, type WinterLapseUi } from './store';
import type { WinterRecord } from '@/sim/types';

const STYLE_ID = 'foundress-winter-styles';

function installStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = css;
  document.head.appendChild(el);
}

function Banner({ b, a }: { b: { delaysLeft: number; secondsLeft: number }; a: WinterActions }) {
  return (
    <div class="wi-chip wi-banner" data-testid="winter-banner" role="status">
      <div class="wi-banner-title">Winter settles. The colony is withdrawing.</div>
      <div class="wi-buttons">
        <Button variant="primary" onClick={() => a.begin()} data-testid="winter-begin">Begin</Button>
        <Button variant="secondary" disabled={b.delaysLeft <= 0} onClick={() => a.delay()} data-testid="winter-delay">Delay one day</Button>
      </div>
    </div>
  );
}

/** The cluster: one dot per worker, tighter on cold days. */
function Cluster({ n, t }: { n: number; t: number }) {
  const dots = Math.min(n, 120);
  const tight = Math.max(0.45, Math.min(1, (t + 2) / 10));
  const items = [];
  for (let i = 0; i < dots; i++) {
    const a = i * 2.399963, r = Math.sqrt(i + 0.5) * 7 * tight;
    items.push(<ellipse key={i} cx={100 + Math.cos(a) * r} cy={52 + Math.sin(a) * r * 0.55} rx="3.4" ry="1.6" transform={`rotate(${(i * 47) % 180} ${100 + Math.cos(a) * r} ${52 + Math.sin(a) * r * 0.55})`} />);
  }
  return (
    <svg class="wi-cluster" viewBox="0 0 200 100" aria-hidden="true">
      <ellipse class="wi-chamber" cx="100" cy="52" rx="92" ry="40" />
      <g class="wi-ants">{items}</g>
    </svg>
  );
}

function Lapse({ l, a, species }: { l: WinterLapseUi; a: WinterActions; species: string }) {
  return (
    <div class={`wi-lapse${l.frost ? ' is-frost' : ''}`} data-testid="winter-lapse">
      <div class="wi-rime" />
      <div class="wi-chip wi-cap">
        <div class="wi-title">Winter</div>
        <div class="wi-sub">{SPECIES_NAME[species] ?? species} · Day {l.day} of {l.days}</div>
      </div>
      {/* reduced motion: a new still crossfades in (opacity only) each time the still index changes */}
      <div class={`wi-chip wi-stage${l.reducedMotion ? ' is-still' : ''}`} key={l.reducedMotion ? `still-${l.still}` : 'stage'} data-still={l.reducedMotion ? l.still : undefined}>
        <Cluster n={l.workers} t={l.tMean} />
        <div class="wi-temp">{l.tMean.toFixed(1)} °C in the winter chamber</div>
        {l.beat && <div class="wi-beat" data-testid="winter-beat">{BEAT_WORD[l.beat] ?? l.beat}</div>}
      </div>
      <div class="wi-chip wi-strip">
        <div class="wi-counts">
          <div><b>{l.workers}</b><span>Workers</span></div>
          <div><b>{l.larvae}</b><span>Larvae</span></div>
          <div><b>{loads(l.c)}</b><span>Sugar stores</span></div>
          <div><b>{loads(l.p)}</b><span>Protein stores</span></div>
          <div><b>{l.frostSoFar}</b><span>Frost nights</span></div>
        </div>
        <div class="wi-foot">
          <ProgressBar value={l.progress} aria-label="Winter" />
          {l.skipping ? <span class="wi-label">Skipping…</span> : <Button variant="secondary" onClick={() => a.skip()} data-testid="winter-skip">Skip</Button>}
        </div>
      </div>
    </div>
  );
}

function Report({ r, a, species }: { r: WinterRecord; a: WinterActions; species: string }) {
  const lost = r.workers0 - r.workers1;
  const ranked = Object.entries(r.losses).filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1]);
  return (
    <div class="wi-card-wrap">
      <div class="wi-card" role="dialog" aria-label="Winter Report" data-testid="winter-report">
        <h2>{SPECIES_NAME[species] ?? species} colony, winter of Year {r.year}: {r.workers1} workers (started with {r.workers0})</h2>
        <div class="wi-grid">
          <section>
            <h3>Population</h3>
            <p>Workers {r.workers0} → {r.workers1}{lost > 0 ? ` (−${lost})` : ''}</p>
            <ul>{ranked.map(([c, n]) => <li key={c}>{causeNoun(c)}: {n}</li>)}</ul>
            <p>Larvae {r.larvae0} → {r.larvae1}</p>
            <p>{r.queenAlive ? 'The queen is alive.' : `The queen died (${causeNoun(r.queenCause)}).`}</p>
          </section>
          <section>
            <h3>Stores</h3>
            <p>Sugar {loads(r.c0)} → {loads(r.c1)}</p>
            <p>Protein {loads(r.p0)} → {loads(r.p1)}</p>
            <p>About {Math.floor(r.daysLeft)} days of stores left.</p>
          </section>
          <section>
            <h3>Climate</h3>
            <p>Coldest chamber {r.coldestC.toFixed(1)} °C at {Math.round(r.coldestDepthBu)} body lengths deep</p>
            <p>{count(r.frostNights, 'frost night')}; heaviest rain {r.heaviestRainMm.toFixed(0)} mm; {count(r.floods, 'flood')}</p>
          </section>
          <section>
            <h3>Why</h3>
            {r.why.length === 0 ? <p>No losses this winter.</p> : (
              <ul>{r.why.map((w) => <li key={w.cause}><b>{causeNoun(w.cause)} {pct(w.weight)}</b>. {WINTER_REMEDY[w.remedy] ?? ''}</li>)}</ul>
            )}
          </section>
        </div>
        <p class="wi-outlook">Spring brood expected from day {r.springBroodDoy}.</p>
        <div class="wi-buttons"><Button variant="primary" autoFocus onClick={() => a.close()} data-testid="winter-close">Continue into spring</Button></div>
      </div>
    </div>
  );
}

export function WinterOverlay() {
  useEffect(installStyles, []);
  const ui = winterUi.value;
  const a = winterActions.value;
  const snap = snapshot.value;
  if (!ui || !a || snap.view === 'photo' || (snap.screen !== 'playing' && snap.screen !== 'paused')) return null;
  return (
    <div class="wi-root" data-testid="winter-root" data-phase={ui.phase}>
      {ui.phase === 'banner' && ui.banner && <Banner b={ui.banner} a={a} />}
      {ui.phase === 'lapse' && ui.lapse && <Lapse l={ui.lapse} a={a} species={ui.species} />}
      {ui.phase === 'report' && ui.report && <Report r={ui.report} a={a} species={ui.species} />}
    </div>
  );
}
