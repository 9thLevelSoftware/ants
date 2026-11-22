// `window.__hud`: the HUD's verification surface (GDD 08 App. B `__game.ui.*`, which the game's debug API forwards to
// when it grows them). Installed on the real game only with ?test=1 or on the demo page. Read-only except open / close
// / inspect, which are the UI's own state. `game` hands scripts the facade for stand-ins the debug API cannot do yet.
import { snapshot, facade } from '../store';
import { inspectHover, inspectPin, openDrawer, type DrawerId } from './state';
import { alertFeed, feedView } from './alerts/store';
import { pinInspect } from '../panels/inspect/inspectState';
import { minimapPaintStats } from './minimap/model';

interface Box { id: string; x: number; y: number; w: number; h: number }

const rootPx = (): number => parseFloat(document.documentElement.style.fontSize) || 16;

/** Boxes of the HUD regions in dp (1 dp = rootPx / 16 CSS px), at the current UI scale. */
export function hudBoxes(): { boxes: Box[]; scale: number; layout: string; viewport: { w: number; h: number } } {
  const k = rootPx() / 16;
  const boxes: Box[] = [];
  document.querySelectorAll<HTMLElement>('[data-hud], .fd-drawer').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    boxes.push({ id: el.dataset.hud ?? 'drawer', x: r.left / k, y: r.top / k, w: r.width / k, h: r.height / k });
  });
  return { boxes, scale: k, layout: document.documentElement.dataset.layout ?? 'standard', viewport: { w: window.innerWidth / k, h: window.innerHeight / k } };
}

export function installHudDebug(): () => void {
  const api = {
    snapshot: () => JSON.parse(JSON.stringify(snapshot.peek())),
    hud: hudBoxes,
    screen: () => ({ drawer: openDrawer.peek() }),
    open: (id: DrawerId) => { openDrawer.value = id; return openDrawer.peek(); },
    close: () => { openDrawer.value = null; return openDrawer.peek(); },
    /** Pin the inspect card on `ref` ({kind: 'ant', id}); null clears it. */
    inspect: (ref: { kind: string; id: number } | null) => { pinInspect(ref); return inspectPin.peek(); },
    hover: (ref: { kind: string; id: number } | null) => { inspectHover.value = ref; facade.peek()?.refreshUi?.(); return inspectHover.peek(); },
    alerts: () => ({ cards: feedView.peek().cards, more: feedView.peek().more, toasts: alertFeed.toastLog.slice() }),
    prompts: () => Array.from(document.querySelectorAll('[data-testid="prompt-line"]')).map((el) => ({ input: (el as HTMLElement).dataset.input ?? '', text: el.textContent ?? '' })),
    /** Wall time of the minimap's canvas repaints so far: last and least ms, and how many. */
    minimapPaint: () => ({ ...minimapPaintStats }),
    /** The facade the UI calls (the Game in the real page): for scripted stand-ins only. */
    get game() { return facade.peek(); },
  };
  (window as unknown as { __hud?: typeof api }).__hud = api;
  return () => { delete (window as unknown as { __hud?: typeof api }).__hud; };
}
