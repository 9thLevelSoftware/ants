// The read-outs behind window.__nav: layers on screen, who owns the pad, the focused control, the audit of a layer.
import { auditLayer } from './audit';
import { padCaptureHolds } from './controller';
import { inputDevice, padStyle, setInputDevice } from './device';
import { activeLayer, allLayers, liveLayers } from './layers';

const nameOf = (el: Element | null): string => {
  if (!el) return '';
  const h = el as HTMLElement;
  return h.getAttribute('aria-label') ?? h.getAttribute('data-testid') ?? (h.textContent ?? '').trim().slice(0, 40);
};

export const effectiveLayerReport = {
  /** Layers on screen, top first by rank. */
  layers: () => liveLayers().sort((a, b) => b.spec.rank - a.spec.rank).map((l) => ({ id: l.spec.id, kind: l.spec.kind, rank: l.spec.rank, claim: l.spec.claim })),
  /** The layer that owns the pad right now (null = the game). */
  owner: () => { const l = activeLayer(); return l ? { id: l.spec.id, kind: l.spec.kind } : null; },
  /** The focused control: tag, test id and name. */
  focus: () => {
    const a = document.activeElement as HTMLElement | null;
    return a && a !== document.body ? { tag: a.tagName.toLowerCase(), testid: a.getAttribute('data-testid'), name: nameOf(a) } : null;
  },
  device: () => ({ device: inputDevice.value, style: padStyle.value }),
  setDevice: setInputDevice,
  capturing: () => padCaptureHolds.value > 0,
  /**
   * Focus-order audit of the layer that owns the pad, of the first layer with this id, or (a CSS selector) of the
   * first element that matches, for regions that are not layers (the HUD).
   */
  audit: (idOrSelector?: string) => {
    if (idOrSelector && /^[.[#]/.test(idOrSelector)) {
      const el = document.querySelector<HTMLElement>(idOrSelector);
      return el ? { id: idOrSelector, ...auditLayer(el) } : null;
    }
    const l = idOrSelector ? liveLayers().find((x) => x.spec.id === idOrSelector) : activeLayer();
    return l ? { id: l.spec.id, ...auditLayer(l.root) } : null;
  },
  /** Every registered layer (built-in table plus registrations). */
  table: () => allLayers().map((l) => ({ id: l.id, selector: l.selector ?? null, rank: l.rank, claim: l.claim, kind: l.kind })),
};
