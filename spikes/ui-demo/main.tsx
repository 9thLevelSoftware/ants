// UI shell demo (task ui-shell). Every screen and every component state with a mock facade, selected by URL flags:
//   ?screen=title|title-empty|new-game|loading|loading-regen|loading-error|loading-load|loading-load-error|pause|settings|save-load|credits|codex|
//           lineage|boot|unsupported|error|epitaph|too-small|components
//   &tab=graphics|audio|controls|accessibility|gameplay   (settings)   &tab=save|load|transfer   (save-load)
//   &section=buttons|inputs|structure|feedback|icons   &modal=confirm|dialog|export|drawer   (components)
//   &scale=80..150 (UI scale in percent, or 0.8..1.5)   &text=100|115|130   &reducedMotion=1   &contrast=high
//   &font=hyperlegible   &bg=scene|bright|dark   &saves=none|some   &storage=off   &nodownload=1   &quality=high
// Sets window.__ready when the first frame and the fonts are in.
import { render } from 'preact';
import { defaultBindings } from '@/input';
import { facade, setSnapshot } from '@/ui/store';
import { emptySnapshot } from '@/ui/api';
import { loadingContext } from '@/ui/screens/loadFlow';
import { ScreenRouter, nav, initialNav, lastRequest, newGameForm, defaultForm } from '@/ui/screens';
import { installStyles, uiPrefs } from '@/ui/styles';
import { setCurrentBindings } from '@/ui/components';
import { Gallery, GALLERY_CSS, type GallerySection } from './gallery';
import { demoSnapshot, MockFacade } from './mockFacade';

declare global {
  interface Window {
    __ready?: boolean;
    __uiDemo?: { facade: MockFacade; nav: typeof nav };
  }
}

const q = new URLSearchParams(location.search);
const num = (k: string): number | null => { const v = q.get(k); return v === null ? null : Number(v); };

function uiScaleFlag(): number | null {
  const v = num('scale');
  if (v === null || !Number.isFinite(v)) return null;
  return v > 3 ? v / 100 : v;
}

async function main(): Promise<void> {
  const screen = q.get('screen') ?? 'title';
  document.body.dataset.bg = q.get('bg') ?? 'scene';

  const mock = new MockFacade({
    saves: (q.get('saves') ?? (screen === 'title-empty' ? 'none' : 'some')) as 'none' | 'some',
    storage: q.get('storage') !== 'off',
    lineage: q.get('lineage') === '1',
  });
  if (q.get('quality')) mock.setSettings({ graphics: { quality: q.get('quality') as never, overrides: {} } });
  facade.value = mock;
  // preferences from flags, written to the mock's settings like the Settings screen does (in memory for this page load)
  const scaleFlag = uiScaleFlag();
  uiPrefs.set({
    accessibility: {
      ...(scaleFlag !== null ? { uiScale: scaleFlag } : {}),
      ...(num('text') !== null ? { textScale: (num('text') as number) / 100 } : {}),
      reducedMotion: q.get('reducedMotion') === '1' ? 'on' : 'off',
      highContrast: q.get('contrast') === 'high',
      font: q.get('font') === 'hyperlegible' ? 'hyperlegible' : 'standard',
    },
  });
  setCurrentBindings(defaultBindings());
  window.__uiDemo = { facade: mock, nav };

  newGameForm.value = defaultForm('4F7A-21C9');
  lastRequest.value = { seed: 0x4f7a21c9, seedText: '4F7A-21C9', species: 'lasius-niger', archetype: 'suburban-garden', size: 'standard', difficulty: 'naturalist', startSeason: 'natural' };

  // snapshot and navigation for the requested screen
  let snap = demoSnapshot('title');
  let stack = initialNav();
  const tab = q.get('tab');
  const playing = { time: { tick: 0, year: 2, season: 'summer', dayOfSeason: 5, hour: 14, minute: 20, label: 'Summer · Day 5 · 14:20' }, lastSave: { agoS: 180, kind: 'auto' as const, timeLabel: '14:02' } };
  switch (screen) {
    case 'boot': snap = demoSnapshot('boot'); break;
    case 'unsupported': snap = demoSnapshot('unsupported'); break;
    case 'title': case 'title-empty': snap = demoSnapshot('title'); break;
    case 'new-game': snap = demoSnapshot('title'); stack = { ...stack, stack: ['new-game'] }; break;
    case 'credits': snap = demoSnapshot('title'); stack = { ...stack, stack: ['credits'] }; break;
    case 'codex': case 'lineage': snap = demoSnapshot('title'); stack = { ...stack, stack: [screen] }; break;
    case 'loading': snap = demoSnapshot('loading', { loading: { phase: 'Heightfield', progress: 0.27, attempt: 1, maxAttempts: 8, error: null } }); break;
    case 'loading-regen': snap = demoSnapshot('loading', { loading: { phase: 'Zone layout', progress: 0.03, attempt: 2, maxAttempts: 8, error: null } }); break;
    case 'loading-load':
    case 'loading-load-error': {
      // reading a save: the screen shows that save, not the last New Game request
      const info = (await mock.listSaves()).find((x) => x.slot === 'slot-3') ?? null;
      loadingContext.value = { kind: 'load', info };
      snap = demoSnapshot('loading', { loading: screen === 'loading-load'
        ? { phase: 'Terrain and cavity meshes', progress: 0.8, attempt: 1, maxAttempts: 8, error: null }
        : { phase: 'Reading the colony', progress: 0.3, attempt: 1, maxAttempts: 8, error: 'This save was made by a newer version of the game (0.9.0).' } });
      break;
    }
    case 'loading-error': snap = demoSnapshot('loading', { loading: { phase: 'Validation', progress: 0.5, attempt: 8, maxAttempts: 8, error: 'Validation failed: no connected path from the nest site to food (attempt 8 of 8).' } }); break;
    case 'pause': snap = demoSnapshot('paused', playing); break;
    case 'settings': snap = demoSnapshot(q.get('from') === 'pause' ? 'paused' : 'title', playing); stack = { ...stack, stack: ['settings'], settingsTab: (tab as never) ?? 'graphics' }; break;
    case 'save-load': snap = demoSnapshot(q.get('from') === 'title' ? 'title' : 'paused', playing); stack = { ...stack, stack: ['save-load'], saveTab: (tab as never) ?? (q.get('from') === 'title' ? 'load' : 'save') }; break;
    case 'error': snap = demoSnapshot('title', { error: 'TypeError: Cannot read properties of undefined (reading \'pos\')\n    at renderAnts (src/render/ants/AntRenderer.ts:212:19)\n    at frame (src/game/Game.ts:301:7)' }); break;
    case 'epitaph': snap = demoSnapshot('epitaph', { epitaph: { ageDays: 41, peakWorkers: 63, cause: 'starvation in winter' } }); break;
    case 'components': snap = demoSnapshot('playing'); break;
    case 'too-small': snap = demoSnapshot('title'); break;
    default: snap = demoSnapshot('title');
  }
  nav.value = stack;
  setSnapshot({ ...emptySnapshot(snap.screen), ...snap });

  installStyles();
  const style = document.createElement('style');
  style.textContent = GALLERY_CSS;
  document.head.appendChild(style);

  const root = document.getElementById('ui') as HTMLElement;
  if (screen === 'components') {
    render(<><ScreenRouter /><div class="ui-root"><Gallery section={((q.get('section') as GallerySection | null) ?? 'all')} modal={q.get('modal')} /></div></>, root);
  } else {
    render(<ScreenRouter />, root);
  }
  await document.fonts.ready;
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  window.__ready = true;
}

main().catch((e) => { console.error('[ui-demo] failed', e); });
