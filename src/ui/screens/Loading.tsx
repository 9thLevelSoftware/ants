// Loading (GDD 08 3.6): the field plate of the chosen species on the left; on the right the locality summary, a
// staged progress bar, the current stage and a rotating field note (every 8 s). On a failed generation: "This
// locality could not be completed." with Try another seed and Back. Cancel returns to New Game with every field kept.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { SpeciesId } from '@/sim/types';
import type { UiLoading } from '../api';
import { Button, ProgressBar, stageIndex, useFocusScope } from '../components';
import { facade } from '../store';
import { UI_BALANCE } from '../styles/tokens';
import { lastRequest } from './newgame/form';
import { loadingContext, markGenerating } from './loadFlow';
import { formatSeedCode, nextSeedText } from './newgame/seed';
import { speciesCard } from './newgame/species';
import { AntPlate } from './plates/AntPlate';

/** Stage names of the worldgen pipeline, same order and weights as UI_BALANCE.loadingStageWeights. */
export const LOADING_STAGES = [
  'Zone layout', 'Heightfield', 'Large structures', 'Props and plants', 'Resources and creature territories', 'Rival colony sites',
  'Pre-existing cavities', 'Validation', 'Terrain and cavity meshes', 'Textures, shaders, audio beds',
] as const;

export const FIELD_NOTES: readonly { text: string; source: string }[] = [
  { text: 'A newly mated queen seals herself in a small chamber and raises her first workers from her own body reserves.', source: 'Codex · Claustral founding' },
  { text: 'Garden ants stroke aphids with their antennae to collect honeydew, and guard them from predators.', source: 'Codex · Aphid tending' },
  { text: 'Foragers lay a scent trail on the way home. The richest food ends up with the strongest trail.', source: 'Codex · Trail pheromone' },
  { text: 'A worker carries liquid food home in her crop, a second stomach, and shares it mouth to mouth.', source: 'Codex · Trophallaxis' },
  { text: 'Soil from a new tunnel is carried out grain by grain and dropped beside the entrance.', source: 'Codex · Excavation' },
  { text: 'Nestmates know one another by a shared chemical smell on the body.', source: 'Codex · Colony odour' },
  { text: 'Nurses carry eggs and larvae between chambers, following changes in warmth and damp.', source: 'Codex · Nursing' },
  { text: 'In winter the colony withdraws to the deep chambers and slows almost to a stop.', source: 'Codex · Overwintering' },
];

const ARCHETYPE_WORDS: Record<string, string> = {
  'woodland-edge': 'Woodland Edge', 'suburban-garden': 'Suburban Garden', 'playground-park': 'Playground Park', 'car-park-verge': 'Car Park Verge',
  'kitchen-door': 'Kitchen Door', 'field-margin': 'Field Margin',
};

export function Loading({ loading, inert }: { loading: UiLoading | null; inert?: boolean }) {
  const f = facade.value;
  const root = useRef<HTMLDivElement>(null);
  const l = loading ?? { phase: '', progress: 0, attempt: 1, maxAttempts: UI_BALANCE.worldgenMaxAttempts, error: null };
  const ctx = loadingContext.value;
  const isLoad = (l.kind ?? ctx.kind) === 'load';
  // generation shows the New Game request; reading a save shows that save (never the previous New Game request)
  const req = isLoad ? null : lastRequest.value;
  const save = isLoad ? ctx.info : null;
  const species = speciesCard((req?.species ?? save?.species ?? 'lasius-niger') as SpeciesId);
  const [note, setNote] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setNote((n) => (n + 1) % FIELD_NOTES.length), UI_BALANCE.loadingNoteS * 1000);
    return () => clearInterval(t);
  }, []);
  useFocusScope(root, { trap: true, initial: '[data-testid=loading-cancel],[data-testid=loading-back]', restore: false });

  const stage = stageIndex(l.progress, UI_BALANCE.loadingStageWeights);
  const regenerating = l.attempt > 1;
  const label = isLoad ? l.phase || 'Reading the colony' : regenerating ? `Regenerating locality (attempt ${l.attempt} of ${l.maxAttempts})` : l.phase || LOADING_STAGES[stage];
  const pct = Math.round(l.progress * 100);
  const tryAnother = () => {
    if (!f || !req) return;
    const seedText = nextSeedText(req.seedText ?? formatSeedCode(Number(req.seed ?? 0)));
    const next = { ...req, seedText, seed: parseInt(seedText.replace('-', ''), 16) >>> 0 };
    lastRequest.value = next;
    markGenerating();
    void f.newGame(next);
  };

  return (
    <div ref={root} class="ui-screen ui-loading" inert={inert} data-screen="loading">
      <div class="ui-loading-plate"><AntPlate species={species.id} framed caption={`${species.binomial}, worker, seen from above`} /></div>
      <div class="ui-loading-col">
        <h1 class="ui-h1">{l.error ? (isLoad ? 'That colony could not be loaded.' : 'This locality could not be completed.') : isLoad ? 'Loading your colony' : 'Preparing the locality'}</h1>
        {save && (
          <dl class="ui-summary" data-testid="loading-save-summary">
            <div><dt>Species</dt><dd>{species.binomial}</dd></div>
            <div><dt>Locality</dt><dd>{save.archetype ? ARCHETYPE_WORDS[save.archetype] ?? save.archetype : 'Unknown'}</dd></div>
            {save.seedCode && <div><dt>Seed</dt><dd class="ui-mono">{save.seedCode}</dd></div>}
            <div><dt>Saved</dt><dd>{save.dateLabel ?? `Day ${save.colonyDay}`}</dd></div>
          </dl>
        )}
        {req && (
          <dl class="ui-summary">
            <div><dt>Locality</dt><dd>{req.archetype ? ARCHETYPE_WORDS[req.archetype] ?? req.archetype : 'Random'}</dd></div>
            <div><dt>Size</dt><dd>{req.size ? req.size[0].toUpperCase() + req.size.slice(1) : 'Standard'}</dd></div>
            <div><dt>Seed</dt><dd class="ui-mono">{req.seed !== undefined ? formatSeedCode(Number(req.seed)) : ''}</dd></div>
            <div><dt>Season</dt><dd>{req.startSeason && req.startSeason !== 'natural' ? req.startSeason[0].toUpperCase() + req.startSeason.slice(1) : `${species.foundingSeason[0].toUpperCase()}${species.foundingSeason.slice(1)}, natural start`}</dd></div>
          </dl>
        )}
        {l.error ? (
          <>
            <p class="ui-notice is-warn" role="alert">{l.error}</p>
            <div class="ui-inline">
              {!isLoad && <Button variant="primary" onClick={tryAnother} disabled={!req} data-testid="loading-another">Try another seed</Button>}
              <Button variant={isLoad ? 'primary' : undefined} onClick={() => f?.quitToTitle()} data-testid="loading-back">Back</Button>
            </div>
          </>
        ) : (
          <>
            <div class="ui-loading-progress">
              <ProgressBar value={l.progress} stages={UI_BALANCE.loadingStageWeights} aria-label="Locality progress" valueText={`${label}, ${pct} %`} />
              <p class="ui-stage" role="status" aria-live="polite" data-testid="loading-stage">{label}<span class="ui-stage-pct"> · {pct} %</span></p>
            </div>
            <figure class="ui-note" aria-label="Field note">
              <blockquote>{FIELD_NOTES[note].text}</blockquote>
              <figcaption>{FIELD_NOTES[note].source}</figcaption>
            </figure>
          </>
        )}
      </div>
      {!l.error && <div class="ui-loading-cancel"><Button variant="ghost" onClick={() => f?.quitToTitle()} data-testid="loading-cancel">Cancel</Button></div>}
    </div>
  );
}
