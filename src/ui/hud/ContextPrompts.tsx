// Context prompts (GDD 08 5.3, GDD 01 9): chips on the scrim, key cap + verb + object, anchored 1.2 BU above the
// possessed ant's head and 48 dp up, clamped 16 dp inside the viewport; off-screen or behind the camera the chip sits
// at the bottom centre (the fallback box); either way it slides off the other HUD regions (promptPlacement.ts), so it
// never covers an alert card or the inspect card. Up to three action lines stack; "Colony orders" is never dropped. Prompts
// never take focus and never block input (pointer-events none). The position is updated from its own animation frame
// loop with transform writes only: no layout reads, no component re-render.
import { useEffect, useRef } from 'preact/hooks';
import type { UiPromptLine } from '../api';
import { KeyCap, currentBindings, hintLabel } from '../components';
import { promptSlice, possessedSlice } from './slices';
import { facade } from '../store';
import { hudBridge } from './state';
import { ACTION_OF, visibleLines } from './promptLines';
import { keepOutRects } from './keepOut';
import { placeAvoiding } from './promptPlacement';

function Line({ line }: { line: UiPromptLine }) {
  const label = hintLabel(currentBindings.value, ACTION_OF[line.input] ?? line.input);
  const hold = line.input === 'interact-hold';
  return (
    <div class={`fd-ctxline${line.ok ? '' : ' is-disabled'}`} data-testid="prompt-line" data-input={line.input} aria-disabled={line.ok ? undefined : 'true'}>
      {hold && <span class="fd-ctxline-hold">Hold</span>}
      <KeyCap label={label ?? '?'} class={label ? '' : 'is-unbound'} />
      <span class="fd-ctxline-text">{line.text}</span>
    </div>
  );
}

/** Viewport facts the animation loop reads without touching the layout. */
const view = { w: window.innerWidth, h: window.innerHeight, rem: 16 };
function readView(): void {
  view.w = window.innerWidth;
  view.h = window.innerHeight;
  view.rem = parseFloat(document.documentElement.style.fontSize) || 16;
}
readView();
window.addEventListener('resize', readView);

function useAnchor(ref: { current: HTMLElement | null }, active: boolean): void {
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    readView();
    const size = { w: el.offsetWidth, h: el.offsetHeight };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver((es) => { const r = es[0]?.contentRect; if (r) { size.w = r.width; size.h = r.height; } }) : null;
    ro?.observe(el);
    const out = { x: 0, y: 0 }, want = { x: 0, y: 0 };
    let raf = 0, lastX = NaN, lastY = NaN, mode = '';
    const loop = () => {
      const m = 1 * view.rem; // 16 dp margin
      const up = 3 * view.rem; // 48 dp above the anchor
      const anchored = hudBridge.peek()?.possessedAnchor(1.2, view.w, view.h, out) ?? false;
      // the wanted spot: above the ant, or the fallback box at the bottom centre; then clear of the other HUD regions
      want.x = anchored ? out.x - size.w / 2 : (view.w - size.w) / 2;
      want.y = anchored ? out.y - up - size.h : view.h - size.h - m;
      const { x, y } = placeAvoiding(want, size, view, m, keepOutRects(), view.rem * 0.5);
      const nextMode = anchored ? 'ant' : 'fallback';
      if (!(Math.abs(x - lastX) <= 0.4) || !(Math.abs(y - lastY) <= 0.4)) {
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        lastX = x; lastY = y;
      }
      if (nextMode !== mode) { mode = nextMode; el.dataset.anchor = mode; }
      el.style.visibility = 'visible';
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro?.disconnect(); };
  }, [active]);
}

export function ContextPrompts() {
  const prompt = promptSlice.value;
  const possessed = possessedSlice.value;
  const ref = useRef<HTMLDivElement>(null);
  const mode = facade.value?.getSettings?.().gameplay.prompts ?? 'always';
  const all: UiPromptLine[] = prompt?.lines ?? (prompt?.primary ? [{ slot: 'primary', input: 'interact', text: prompt.primary, ok: true }] : []);
  const shown = visibleLines(all).filter((l) => mode !== 'never' || l.input === 'directives');
  const observerText = !possessed && prompt?.primary && !prompt.lines ? prompt.primary : null;
  const active = shown.length > 0 || observerText !== null;
  useAnchor(ref, active);
  if (!active) return null;
  return (
    <div ref={ref} class="fd-prompts" style={{ visibility: 'hidden' }} aria-label="Prompts" data-hud="prompts" data-testid="prompts">
      {shown.map((l, i) => <Line key={`${l.input}-${i}`} line={l} />)}
      {observerText && <div class="fd-ctxline" data-testid="prompt-line"><span class="fd-ctxline-text">{observerText}</span></div>}
    </div>
  );
}
