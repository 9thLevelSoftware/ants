// The Lineage (GDD 06 §12, GDD 01 `lineage`): every colony of this device by generation, its flights, and the
// daughters waiting to found a colony ("Found as this daughter queen" starts a new game in a fresh locality). Opened
// from the epitaph and the flight's end card (and, by its owner's one-line swap, from the title's Lineage entry).
import { useEffect } from 'preact/hooks';
import type { DaughterRecord, LineageColonyRecord, LineageStore } from '@/sim/types';
import { Button } from '../../components';
import { ARCHETYPE_WORD, causeNoun, count, roman, SPECIES_NAME } from '../epitaph/words';
import { ZONE_WORD } from '@/content/text/words';
import css from './lineage.css?inline';
import { lineageActions, lineageUi } from './store';

const STYLE_ID = 'foundress-lineage-styles';

function installStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = css;
  document.head.appendChild(el);
}

function DaughterCard({ d, onFound }: { d: DaughterRecord; onFound: (id: string) => void }) {
  return (
    <li class={`li-daughter is-${d.state}`} data-testid="lineage-daughter">
      <div><b>Young queen</b> · generation {roman(d.generation)} · flew on day {d.doy}</div>
      <div class="li-small">{d.witnessed ? `Landed in ${ZONE_WORD[d.landingZone ?? 'lawn'] ?? 'the grass'}; you flew her.` : 'Landed somewhere beyond the colony.'} Locality: {ARCHETYPE_WORD[d.archetypeHint ?? ''] ?? 'unknown'}</div>
      {d.state === 'available'
        ? <Button variant="primary" onClick={() => onFound(d.id)} data-testid="lineage-found">Found as this daughter queen</Button>
        : <span class="li-small">{d.state === 'founded' ? 'Founded' : 'Lost'}</span>}
    </li>
  );
}

function ColonyRow({ c, l, onFound }: { c: LineageColonyRecord; l: LineageStore; onFound: (id: string) => void }) {
  const daughters = l.daughters.filter((d) => d.motherColonyId === c.id);
  return (
    <li class="li-colony" data-testid="lineage-colony" style={{ marginLeft: `${(c.generation - 1) * 1.25}rem` }}>
      <div class="li-name">{c.name || 'A colony'} <span class="li-small">{SPECIES_NAME[c.species] ?? c.species} · generation {roman(c.generation)}</span></div>
      <div class="li-small">
        Peak {count(c.peakWorkers, 'worker')} · {count(c.winters, 'winter')} · {count(c.flights, 'flight')} · {count(c.daughtersFounded, 'daughter')}
        {c.endedDate ? ` · ended Year ${c.endedDate.year} (${causeNoun(c.endCause)})` : ' · living'}
      </div>
      {daughters.length > 0 && <ul class="li-daughters">{daughters.map((d) => <DaughterCard key={d.id} d={d} onFound={onFound} />)}</ul>}
    </li>
  );
}

export function LineageScreen() {
  useEffect(installStyles, []);
  const l = lineageUi.value;
  const a = lineageActions.value;
  if (!l || !a) return null;
  const known = new Set(l.colonies.map((c) => c.id));
  const orphans = l.daughters.filter((d) => !known.has(d.motherColonyId));
  const cols = [...l.colonies].sort((x, y) => x.generation - y.generation || x.id.localeCompare(y.id));
  return (
    <div class="li-root" data-testid="lineage-screen">
      <section class="li-page" role="dialog" aria-label="Lineage">
        <header class="li-head">
          <h1>Lineage</h1>
          <span class="li-small">{count(l.colonies.length, 'colony', 'colonies')} · {count(l.flights.length, 'flight')} · {count(l.daughters.filter((d) => d.state === 'available').length, 'daughter')} waiting</span>
        </header>
        {cols.length === 0 && orphans.length === 0 ? <p>No colonies recorded yet.</p> : (
          <ul class="li-tree">
            {cols.map((c) => <ColonyRow key={c.id} c={c} l={l} onFound={(id) => a.foundDaughter(id)} />)}
            {orphans.length > 0 && <li class="li-colony"><div class="li-name">Daughters of this game</div><ul class="li-daughters">{orphans.map((d) => <DaughterCard key={d.id} d={d} onFound={(id) => a.foundDaughter(id)} />)}</ul></li>}
          </ul>
        )}
        <footer class="li-actions">
          <Button variant="ghost" onClick={() => { const t = a.exportJson(); void navigator.clipboard?.writeText(t).catch(() => {}); }} data-testid="lineage-export">Copy lineage.json</Button>
          <Button variant="secondary" autoFocus onClick={() => a.close()} data-testid="lineage-close">Back</Button>
        </footer>
      </section>
    </div>
  );
}
