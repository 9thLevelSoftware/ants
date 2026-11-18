// URL flags (architecture §5, task F3b): test, seed, quality, species, archetype, size, autostart, view, plus
// `post` (render layer), `render=debug` (debug renderers in every slot) and `nowebgl=1` (test the unsupported screen). Pure: takes the search string.
import { parseRenderFlags, type QualitySetting } from '@/render/app';
import type { NewGameOptions, StartView } from './newGame/options';

export interface GameFlags {
  test: boolean;
  quality: QualitySetting;
  post: boolean | null;
  autostart: boolean;
  forceDebugRender: boolean;
  /** Pretend WebGL2 is missing (verifies the unsupported screen). */
  noWebgl: boolean;
  /** Options for the autostarted (or first) new game. */
  newGame: NewGameOptions;
}

export function parseGameFlags(search: string): GameFlags {
  const q = new URLSearchParams(search);
  const r = parseRenderFlags(search);
  const opts: NewGameOptions = {};
  const seed = q.get('seed');
  if (seed !== null && seed !== '') opts.seed = /^\d+$/.test(seed) ? Number(seed) : seed;
  const str = (k: string) => q.get(k) ?? undefined;
  // species that are not released yet can be tried only in test mode (GDD 08 3.7 greys their cards out)
  if (str('species') && r.test) opts.species = str('species') as NewGameOptions['species'];
  if (str('archetype')) opts.archetype = str('archetype') as NewGameOptions['archetype'];
  if (str('size')) opts.size = str('size') as NewGameOptions['size'];
  if (str('difficulty')) opts.difficulty = str('difficulty') as NewGameOptions['difficulty'];
  const view = q.get('view');
  if (view === 'observer' || view === 'possess') opts.view = view as StartView;
  if (r.test) opts.cheats = true;
  return {
    test: r.test, quality: r.quality, post: r.post, autostart: q.get('autostart') === '1',
    forceDebugRender: q.get('render') === 'debug', noWebgl: q.get('nowebgl') === '1', newGame: opts,
  };
}
