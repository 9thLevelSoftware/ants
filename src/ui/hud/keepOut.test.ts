// gate-close-app: the marker palette (.pn-panel) is mounted by the panels layer, outside the HUD root; the keep-out
// list must still hold it, so prompts and hint cards are placed clear of it (e2e/slicenight/slice-night.png: the
// "Why?" chip sat on the palette's Select button). Node environment: a minimal document stands in for the DOM.
import { afterEach, describe, expect, it } from 'vitest';
import { keepOutRects, watchKeepOut } from './keepOut';

type R = { x: number; y: number; w: number; h: number };
const el = (r: R) => ({ getBoundingClientRect: () => ({ left: r.x, top: r.y, width: r.w, height: r.h }) });

const g = globalThis as { window?: unknown };
const savedWindow = g.window;
let stop: (() => void) | null = null;
afterEach(() => { stop?.(); stop = null; g.window = savedWindow; });

describe('HUD keep-out regions', () => {
  it('are searched in the whole document: a panel toolbar outside the HUD root is kept clear too', () => {
    g.window = { addEventListener: () => {}, removeEventListener: () => {} };
    const pulse = el({ x: 900, y: 10, w: 300, h: 50 });
    const palette = el({ x: 360, y: 16, w: 560, h: 48 });
    let asked = '';
    const body = { querySelectorAll: (sel: string) => { asked = sel; return [pulse, palette]; } };
    const hudRoot = { ownerDocument: { body }, querySelectorAll: () => [pulse] };
    stop = watchKeepOut(hudRoot as unknown as HTMLElement);
    expect(asked).toContain('.pn-panel');
    expect(keepOutRects()).toEqual([{ x: 900, y: 10, w: 300, h: 50 }, { x: 360, y: 16, w: 560, h: 48 }]);
  });
});
