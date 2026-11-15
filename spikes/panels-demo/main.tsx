// Panels demo (task ui-panels). Colony health, Nest overview, Journal, Codex, the marker palette, overlay controls and legends
// on a mock facade, selected by URL flags:
//   ?scene=health|nest|journal|codex|markers|overlays|alerts   &scale=80..150   &text=100|115|130   &bg=scene|bright|dark|nest
//   health:   &expand=<diag id> (default diag-brood-growth)   &none=1 (no diagnostics)
//   nest:     &select=<chamber id>   &empty=1 (no chambers)
//   journal:  &tab=aims|milestones|graphs|log   &chart=population|brood|stores|intake|deaths|nest-volume|nest-temp   &range=3d|year|all   &young=1
//   codex:    &entry=<cx id>   &seen=none|some   &search=<text>   &comfort=ring (spider comfort on)
//   markers:  &tool=dig|forage|avoid|rally|entrance|move-brood|move-queen   &template=tunnel
//   overlays: &overlay=scent,temperature,moisture,threats,dig-plans   &palette=okabe-ito|high-contrast|pattern-only   &view=colony|observer|possess
//   &inspect=1 (the inspect card pinned, to see it beside the overlay controls and legends)   &reducedMotion=1   &contrast=high
// Sets window.__ready when the first frame and the fonts are in. window.__panels is the debug surface (panels/wiring/debug.ts);
// window.__panelsDemo gives scripts the facade, the bridge calls and the open scene.
import { render } from 'preact';
import { defaultBindings } from '@/input';
import { HudRoot, openPanel } from '@/ui/hud';
import { setCurrentBindings } from '@/ui/components';
import { overlays, setOverlay } from '@/ui/overlays/state';
import type { OverlayId } from '@/ui/overlays/catalogue';
import { codexSelection, healthExpanded, journalTab, nestSelection, openBook, panelsBridge } from '@/ui/panels/wiring/state';
import { facade, setSnapshot, snapshot } from '@/ui/store';
import { uiPrefs } from '@/ui/styles';
import { pinInspect } from '@/ui/panels/inspect/inspectState';
import { demoSnapshot } from '../hud-demo/mock';
import { demoCodex, demoHealth, demoJournal, demoMarkers, demoNest } from './data';
import { MockPanelsBridge, PanelsMockFacade } from './mock';

declare global {
  interface Window {
    __ready?: boolean;
    __panelsDemo?: { facade: PanelsMockFacade; bridge: MockPanelsBridge; scene: string };
  }
}

const q = new URLSearchParams(location.search);
const num = (k: string): number | null => { const v = q.get(k); return v === null ? null : Number(v); };
const frames = (n: number): Promise<void> => new Promise((r) => { const go = (i: number) => (i <= 0 ? r() : requestAnimationFrame(() => go(i - 1))); go(n); });

async function main(): Promise<void> {
  const scene = q.get('scene') ?? 'health';
  document.body.dataset.bg = q.get('bg') ?? (scene === 'nest' ? 'nest' : 'scene');
  document.documentElement.dataset.hudDemo = '1';
  document.documentElement.dataset.panelsDemo = '1';
  const mock = new PanelsMockFacade();
  facade.value = mock;
  const scale = num('scale');
  uiPrefs.set({
    accessibility: {
      ...(scale !== null ? { uiScale: scale > 3 ? scale / 100 : scale } : {}),
      ...(num('text') !== null ? { textScale: (num('text') as number) / 100 } : {}),
      reducedMotion: q.get('reducedMotion') === '1' ? 'on' : 'off', highContrast: q.get('contrast') === 'high', font: 'standard',
      ...(q.get('palette') ? { overlayPalette: q.get('palette') as 'okabe-ito' } : {}),
      ...(q.get('comfort') === 'ring' ? { spiderComfort: 'marker' as const } : {}),
    },
  });
  setCurrentBindings(defaultBindings());

  const colonyView = scene === 'markers' || q.get('view') === 'colony';
  const view = (q.get('view') as 'possess' | 'observer' | 'colony' | null) ?? (colonyView ? 'colony' : scene === 'overlays' ? 'observer' : 'possess');
  const base = demoSnapshot({ view }, { alerts: scene === 'alerts' ? 'critical' : 'few', possessed: view === 'possess' });
  const health = q.get('none') === '1' ? { overall: 'ok' as const, rows: [], nowTick: 0 } : demoHealth();
  const nest = q.get('empty') === '1' ? { ...demoNest(), chambers: [], tunnels: [], entrances: [], volumeOpen: 0, openPlans: 0 } : demoNest();
  let journal = demoJournal();
  if (q.get('young') === '1') journal = { ...journal, nowTick: 7000, hourly: Object.fromEntries(Object.entries(journal.hourly).map(([k, v]) => [k, v.slice(0, 20)])), daily: {}, entries: journal.entries.slice(0, 2), events: [], aims: { current: [], done: [] } };
  setSnapshot({
    ...base, health, nest, journal, codex: q.get('seen') === 'none' ? { seen: {} } : demoCodex(), markers: demoMarkers(),
  });

  const root = document.getElementById('ui') as HTMLElement;
  render(<HudRoot />, root);
  const bridge = new MockPanelsBridge();
  for (let i = 0; i < 30 && !panelsBridge.value; i++) await frames(1); // the HUD installs it in an effect
  panelsBridge.value = bridge;
  window.__panelsDemo = { facade: mock, bridge, scene };

  if (q.get('tool')) { bridge.state.tool = q.get('tool') as 'dig'; }
  if (q.get('template')) bridge.state.planner.template = q.get('template') as 'tunnel';
  for (const o of (q.get('overlay') ?? '').split(',').filter(Boolean)) setOverlay(o as OverlayId, true);
  void overlays;
  if (q.get('inspect') === '1') pinInspect({ kind: 'ant', id: 1 });
  if (scene === 'health') { healthExpanded.value = q.get('expand') ?? 'diag-brood-growth'; openPanel('health'); }
  if (scene === 'nest') { nestSelection.value = num('select') ?? -1; openPanel('nest'); }
  if (scene === 'journal') { journalTab.value = (q.get('tab') as 'aims') ?? 'aims'; openBook.value = 'journal'; }
  if (scene === 'codex') {
    codexSelection.value = q.get('entry') ?? 'cx-trophallaxis';
    openBook.value = 'codex';
  }
  await frames(3);
  window.__hud?.snapshot();
  await document.fonts.ready;
  await frames(2);
  window.__ready = true;
}

declare global { interface Window { __hud?: { snapshot(): unknown } } }
void snapshot;
main().catch((e) => { console.error('[panels-demo] failed', e); });
