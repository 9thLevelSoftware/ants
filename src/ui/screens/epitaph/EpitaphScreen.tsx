// The Epitaph (GDD 06 §13.5): a calm field-journal page when a colony has ended. Title, life, how it ended (the
// chain of causes), the history graph, causes of death, figures, the last journal entries, the Lineage (daughters)
// and the actions. No score, no rating. Shown over the minimal epitaph card when the epitaph flow has a record;
// mounted by src/ui/App.tsx.
import { useEffect } from 'preact/hooks';
import { journalEntryText } from '@/content/text/journalText';
import { Button } from '../../components';
import { snapshot } from '../../store';
import { nav, openOverlay, updateNav } from '../nav';
import css from './epitaph.css?inline';
import { HistoryGraph } from './HistoryGraph';
import { epitaphActions, epitaphUi, type EpitaphData } from './store';
import { ARCHETYPE_WORD, causeNoun, causePhrase, roman, SPECIES_NAME } from './words';

const STYLE_ID = 'foundress-epitaph-styles';

function installStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = css;
  document.head.appendChild(el);
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** "How it ended", from the chain of causes. */
export function howItEnded(d: EpitaphData): string {
  if (d.cause === 'retired') return 'The colony was retired.';
  const last = `the last ant ${causePhrase(d.cause)}`;
  if (d.queenCause && d.orphanDays !== null) {
    return `The queen ${causePhrase(d.queenCause)} in Year ${d.queenDiedYear ?? '?'}; ${last} ${plural(Math.round(d.orphanDays), 'day', 'days')} later.`;
  }
  return `${last.charAt(0).toUpperCase()}${last.slice(1)}.`;
}

/** The text template of §13.5. */
export function epitaphText(d: EpitaphData): string {
  const years = d.spanYears < 1 ? 'less than a year' : plural(Math.floor(d.spanYears), 'year', 'years');
  const parts = [`${d.name || 'The colony'} lived ${years} in ${ARCHETYPE_WORD[d.archetype] ?? d.archetype}.`];
  parts.push(`It reached ${plural(d.figures.peakWorkers, 'worker', 'workers')} in Year ${d.figures.peakYear}.`);
  parts.push(howItEnded(d));
  if (d.figures.winters > 0) parts.push(`${plural(d.figures.winters, 'winter was', 'winters were')} survived.`);
  if (d.flightYears.length > 0) {
    const years = [...new Set(d.flightYears)].join(' and ');
    const what = d.flightYears.length === 1 ? `A nuptial flight in Year ${years}` : `Nuptial flights in Year ${years}`;
    parts.push(`${what} produced ${plural(d.figures.daughters, 'daughter foundation', 'daughter foundations')}.`);
  }
  return parts.join(' ');
}

export function EpitaphScreen() {
  useEffect(installStyles, []);
  const ui = epitaphUi.value;
  const a = epitaphActions.value;
  const snap = snapshot.value;
  // the new-colony setup opens over the epitaph (GDD 08 3.1): this page steps aside meanwhile
  if (!ui || !a || snap.screen !== 'epitaph' || nav.value.stack.length > 0) return null;
  const d = ui.data;
  const f = d.figures;
  return (
    <div class="ep-root" data-testid="epitaph-screen">
      <section class="ep-page" role="dialog" aria-label="Epitaph">
        <header>
          <h1>{d.name || 'A colony'}</h1>
          <p class="ep-sub">{SPECIES_NAME[d.species] ?? d.species} · {ARCHETYPE_WORD[d.archetype] ?? d.archetype} · seed <code>{d.seedText}</code> · {d.difficulty[0]}</p>
          <p class="ep-sub">Founded Year {d.founded.year} day {d.founded.doy} · ended Year {d.ended.year} day {d.ended.doy} · generation {roman(d.generation)}</p>
        </header>
        <p class="ep-text" data-testid="epitaph-text">{epitaphText(d)}</p>
        <HistoryGraph g={d.graph} />
        <div class="ep-legend"><i class="k-w" />workers <i class="k-b" />brood <i class="k-c" />sugar stores <i class="k-p" />protein stores</div>
        <div class="ep-cols">
          <section>
            <h3>Causes of death</h3>
            {d.causes.length === 0 ? <p>None recorded.</p> : <ul>{d.causes.map((c) => <li key={c.cause}>{causeNoun(c.cause)}: {c.n}</li>)}</ul>}
          </section>
          <section>
            <h3>Figures</h3>
            <ul>
              <li>Peak: {plural(f.peakWorkers, 'worker', 'workers')}</li>
              <li>Ants raised: {f.born}</li>
              <li>Food returned: {f.foodC.toFixed(0)} sugar, {f.foodP.toFixed(0)} protein</li>
              <li>Nest at its largest: {plural(f.chambers, 'chamber', 'chambers')}, {Math.round(f.volume)} cubic body lengths</li>
              <li>Winters survived: {f.winters}</li>
              <li>Alates reared: {f.alatesReared}; flown: {f.alatesFlown}</li>
              <li>Daughter colonies: {f.daughters}</li>
              <li>Rival colonies overcome: {f.rivals}</li>
            </ul>
          </section>
          <section>
            <h3>Last entries</h3>
            <ul class="ep-entries">
              {d.lastEntries.map((e) => {
                const w = e.title ? { title: e.title } : journalEntryText(e.key, e.tokens);
                return <li key={e.tick + e.key}>{w?.title ?? e.key}</li>;
              })}
            </ul>
          </section>
        </div>
        {d.daughters.length > 0 && (
          <section class="ep-lineage">
            <h3>Lineage</h3>
            <p>{plural(ui.available, 'daughter is', 'daughters are')} waiting to found a colony.</p>
          </section>
        )}
        <footer class="ep-actions">
          {ui.available > 0 && <Button variant="primary" onClick={() => a.foundDaughter(null)} data-testid="epitaph-daughter">Found a daughter</Button>}
          <Button variant="secondary" onClick={() => a.foundAgain()} data-testid="epitaph-again">Found again here</Button>
          <Button variant="secondary" onClick={() => a.openLineage()} data-testid="epitaph-lineage">Lineage</Button>
          <Button variant="secondary" onClick={() => updateNav((n) => openOverlay(n, 'new-game'))} data-testid="epitaph-newgame">New game</Button>
          <Button variant="ghost" onClick={() => { const t = a.copyRecord(); void navigator.clipboard?.writeText(t).catch(() => {}); }} data-testid="epitaph-copy">Copy record</Button>
          <Button variant="ghost" onClick={() => a.title()} data-testid="epitaph-title-btn">Title</Button>
        </footer>
      </section>
    </div>
  );
}
