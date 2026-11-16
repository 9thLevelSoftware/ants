// Root of photo mode's screen (GDD 08 7.9): the controls panel on the left (collapsible with Tab), the composition
// guides, the preview of the last capture and a one-line hint. Everything shows only while the game publishes a photo
// read-out (store.ts); the HUD hides itself in photo mode (src/ui/hud/HudRoot.tsx). Mounted by src/ui/App.tsx.
import { useEffect, useState } from 'preact/hooks';
import { KeyHint } from '../../components';
import { inputDevice } from '../../nav/device';
import { facade, snapshot } from '../../store';
import { ControlsPanel } from './ControlsPanel';
import { Guides } from './Guides';
import { PreviewCard } from './PreviewCard';
import css from './photo.css?inline';
import { photoActions, photoUi } from './store';

const STYLE_ID = 'foundress-photo-styles';

function installStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = css;
  document.head.appendChild(el);
}

type InputLike = { input?: { setSuspended(on: boolean): void } };
/** The game's keys stop while focus is inside the panel (arrows move sliders there, not the camera). */
function suspendGameKeys(on: boolean): void {
  try { (facade.peek() as unknown as InputLike | null)?.input?.setSuspended(on); } catch { /* no game input (demo page) */ }
}

/** Gives focus back to the game: a mouse click on a control must not leave WASD dead. */
function releaseFocus(): void {
  const el = document.activeElement as HTMLElement | null;
  if (el && el !== document.body) el.blur();
  suspendGameKeys(false);
}

/** Tab (focus on the game) collapses and opens the panel; Esc closes the preview before it leaves photo mode. */
function usePhotoKeys(collapsed: boolean, setCollapsed: (v: boolean) => void): void {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const ui = photoUi.peek();
      if (!ui) return;
      if (e.code === 'Escape' && ui.preview) {
        e.preventDefault(); e.stopPropagation(); // the game must not also leave photo mode
        photoActions.peek()?.closePreview();
        return;
      }
      const a = document.activeElement;
      const gameFocus = !a || a === document.body || a.tagName === 'CANVAS';
      if (e.code === 'Tab' && gameFocus && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        setCollapsed(!collapsed);
        if (collapsed) requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="photo-panel"] [role="slider"]')?.focus());
      }
    };
    window.addEventListener('keydown', down, true); // capture: runs before the game's own listener
    return () => window.removeEventListener('keydown', down, true);
  }, [collapsed, setCollapsed]);
}

/** While photo mode shows, the page carries this class: photo.css hides every other overlay (HUD stand-ins, opening panels). */
const ACTIVE_CLASS = 'ph-active';

export function PhotoScreen() {
  useEffect(installStyles, []);
  const showing = !!photoUi.value && !!photoActions.value && snapshot.value.screen === 'playing';
  useEffect(() => {
    document.documentElement.classList.toggle(ACTIVE_CLASS, showing);
    return () => document.documentElement.classList.remove(ACTIVE_CLASS);
  }, [showing]);
  const [collapsed, setCollapsed] = useState(false);
  usePhotoKeys(collapsed, setCollapsed);
  const ui = photoUi.value, a = photoActions.value;
  const screen = snapshot.value.screen;
  if (!ui || !a || screen !== 'playing') return null;
  return (
    <div
      class="ui-root ph-root" data-testid="photo-root"
      onFocusIn={() => suspendGameKeys(true)}
      onFocusOut={(e: FocusEvent) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) suspendGameKeys(false); }}
      onPointerUp={() => setTimeout(releaseFocus, 0)}
      onKeyDown={(e: KeyboardEvent) => { if (e.code === 'Escape') { e.stopPropagation(); releaseFocus(); } }}
    >
      <Guides guides={ui.guides} />
      {collapsed
        ? <button type="button" class="ph-reopen ui-surface" onClick={() => setCollapsed(false)} data-testid="photo-reopen">Photo controls</button>
        : <ControlsPanel ui={ui} a={a} onCollapse={() => setCollapsed(true)} />}
      {ui.preview && <PreviewCard p={ui.preview} a={a} />}
      <p class="ph-hint" data-testid="photo-hint">
        {inputDevice.value === 'pad'
          ? <><KeyHint action="ph-move">fly</KeyHint><KeyHint action="ph-up">up</KeyHint><KeyHint action="ph-down">down</KeyHint><KeyHint action="ph-look">look</KeyHint>
            <KeyHint action="ph-focal">focal length</KeyHint><KeyHint action="ph-focus">focus</KeyHint><KeyHint action="ph-capture">Capture</KeyHint><KeyHint action="ph-exit">Leave</KeyHint></>
          : <><span>WASD fly</span><KeyHint action="ph-up">up</KeyHint><KeyHint action="ph-down">down</KeyHint><span>right-drag look</span>
            <span>wheel focal length</span><span>Shift+wheel focus</span><KeyHint action="ph-capture">Capture</KeyHint></>}
      </p>
    </div>
  );
}
