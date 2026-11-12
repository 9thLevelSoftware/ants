// HUD demo (task ui-hud). The in-game HUD, Colony orders, Roster, inspect card and alerts on a mock facade, selected by
// URL flags:
//   ?scene=worker|queen|observer|orders|roster|inspect|alerts|hidden|empty|critical
//   &scale=80..150   &text=100|115|130   &bg=scene|bright|dark   &reducedMotion=1   &contrast=high   &view=WxH is set by the harness
//   &anchor=1 (prompt anchored over a fake ant at the centre of the screen)   &paused=1
// Sets window.__ready when the first frame and the fonts are in. window.__hud is the debug surface (see hud/debugHook.ts),
// window.__hudDemo gives scripts the facade (calls, commands) and the scene setters.
import { render } from 'preact';
import { defaultBindings } from '@/input';
import { HudRoot, openPanel } from '@/ui/hud';
import { hudBridge } from '@/ui/hud/state';
import { setCurrentBindings } from '@/ui/components';
import { pinInspect } from '@/ui/panels/inspect/inspectState';
import { facade, setSnapshot, snapshot } from '@/ui/store';
import { uiPrefs } from '@/ui/styles';
import { demoAlerts, demoSnapshot, HudMockFacade } from './mock';

declare global {
  interface Window {
    __ready?: boolean;
    __hudDemo?: { facade: HudMockFacade; setAlerts(kind: 'none' | 'few' | 'many' | 'critical'): void };
  }
}

const q = new URLSearchParams(location.search);
const num = (k: string): number | null => { const v = q.get(k); return v === null ? null : Number(v); };

async function main(): Promise<void> {
  const scene = q.get('scene') ?? 'worker';
  document.body.dataset.bg = q.get('bg') ?? 'scene';
  document.documentElement.dataset.hudDemo = '1';
  const mock = new HudMockFacade();
  facade.value = mock;
  const scale = num('scale');
  uiPrefs.set({
    accessibility: {
      ...(scale !== null ? { uiScale: scale > 3 ? scale / 100 : scale } : {}),
      ...(num('text') !== null ? { textScale: (num('text') as number) / 100 } : {}),
      reducedMotion: q.get('reducedMotion') === '1' ? 'on' : 'off', highContrast: q.get('contrast') === 'high', font: 'standard',
    },
  });
  setCurrentBindings(defaultBindings());

  const alerts = scene === 'alerts' ? 'many' : scene === 'critical' ? 'critical' : scene === 'empty' ? 'none' : 'few';
  const snap = demoSnapshot({ hudHidden: scene === 'hidden' }, { queen: scene === 'queen' || scene === 'orders', alerts, possessed: scene !== 'observer' });
  if (q.get('paused') === '1' && snap.speed) snap.speed = { ...snap.speed, paused: true, level: 0 };
  if (scene === 'orders' && snap.directives && q.get('manual') === '1') snap.directives = { ...snap.directives, allocationMode: 'manual' };
  setSnapshot(snap);

  const root = document.getElementById('ui') as HTMLElement;
  render(<HudRoot />, root);
  window.__hudDemo = { facade: mock, setAlerts: (k: 'none' | 'few' | 'many' | 'critical') => setSnapshot({ ...snapshotValue(), alerts: demoAlerts(k) }) };

  // a fake projector so the prompt can be seen anchored above an ant at the middle of the screen
  for (let i = 0; i < 30 && !hudBridge.value; i++) await new Promise<void>((r) => requestAnimationFrame(() => r())); // the HUD installs it in an effect
  if (q.get('anchor') === '1' && hudBridge.value) {
    const real = hudBridge.value;
    hudBridge.value = { ...real, possessedAnchor: (_h, w, h, out) => { out.x = w / 2; out.y = h * 0.58; return true; } };
  }
  if (scene === 'orders') openPanel('directives');
  if (scene === 'roster') openPanel('roster');
  if (scene === 'inspect') pinInspect({ kind: 'ant', id: q.get('ant') ? Number(q.get('ant')) : 1 });
  if (q.get('scroll') === '1') { await new Promise<void>((r) => requestAnimationFrame(() => r())); const b = document.querySelector('.ui-drawer-body'); if (b) b.scrollTop = Number(q.get('scrollTo') ?? 99999); }
  await document.fonts.ready;
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  window.__ready = true;
}

const snapshotValue = () => snapshot.value;

main().catch((e) => { console.error('[hud-demo] failed', e); });
