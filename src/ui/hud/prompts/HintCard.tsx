// The hint card (GDD 08 §9): a calm chip on the scrim, key cap from the CURRENT binding plus a verb, e.g. `[T] Antennate
// the ground`. It sits in a HUD margin region chosen by the hint's anchor, never in the middle of the screen where the
// ant is, never takes focus, never blocks input (pointer events only on its close button). Compact form (after a minute
// without the action): the key cap alone, faded. Reduced motion: an opacity fade only (CSS, data-motion).
import { useEffect, useRef } from 'preact/hooks';
import { currentBindings, KeyCap } from '../../components';
import type { HintView } from '@/game/onboarding';
import { keepOutRects } from '../keepOut';
import { placeAvoiding, type Rect } from '../promptPlacement';
import { keyCapText } from './keys';

/** The context prompt chip is placed by its own loop (over the ant, or the bottom fallback); the card steps aside for it. */
function promptRect(): Rect | null {
  const el = document.querySelector<HTMLElement>('[data-hud="prompts"]');
  if (!el || el.style.visibility === 'hidden') return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
}

/**
 * The top-centre card keeps clear of the HUD regions and of the context prompt chip, wherever that sits: it slides sideways
 * (never down onto the ant). Checked a few times a second with style writes only.
 */
function useStepAside(ref: { current: HTMLElement | null }, active: boolean, seq: number): void {
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    let timer = 0;
    let last = '';
    const place = () => {
      const m = parseFloat(document.documentElement.style.fontSize) || 16;
      const size = { w: el.offsetWidth, h: el.offsetHeight };
      const view = { w: window.innerWidth, h: window.innerHeight };
      const pr = promptRect();
      const out = placeAvoiding({ x: (view.w - size.w) / 2, y: m }, size, view, m, pr ? [...keepOutRects(), pr] : keepOutRects(), m * 0.5);
      const css = `${out.x.toFixed(0)}px ${out.y.toFixed(0)}px`;
      if (css !== last) { last = css; el.style.translate = 'none'; el.style.left = `${out.x}px`; el.style.top = `${out.y}px`; }
    };
    place();
    timer = window.setInterval(place, 200);
    return () => window.clearInterval(timer);
  }, [active, seq]);
}

export interface HintCardProps {
  view: HintView;
  onDismiss(): void;
}

export function HintCard({ view, onDismiss }: HintCardProps) {
  const text = keyCapText(currentBindings.value, view.action, view.fixedKey);
  const ref = useRef<HTMLDivElement>(null);
  useStepAside(ref, view.anchor === 'top', view.seq);
  return (
    <div
      ref={ref} class={`hn-card hn-at-${view.anchor}${view.compact ? ' is-compact' : ''}`} key={view.seq} role="status" aria-live="polite"
      data-hud="hint" data-testid="hint-card" data-hint-id={view.id} data-compact={view.compact ? '1' : '0'}
    >
      {view.hold && !view.compact && <span class="hn-hold">Hold</span>}
      {view.action !== null || view.fixedKey ? <KeyCap label={text ?? '?'} class={text ? '' : 'is-unbound'} /> : null}
      {!view.compact && <span class="hn-verb" data-testid="hint-verb">{view.verb}</span>}
      {!view.compact && (
        <button
          type="button" class="hn-close" tabIndex={-1} aria-label="Dismiss hint" title="Dismiss (Shift+H)" data-testid="hint-dismiss"
          onMouseDown={(e) => e.preventDefault()} onClick={onDismiss}
        >
          {'×'}
        </button>
      )}
    </div>
  );
}
