// Placeholder pause menu: Resume and Quit to title.
import { useAutoFocusRef } from '../components/focus';
import { facade } from '../store';

export function PauseMenu() {
  const first = useAutoFocusRef<HTMLButtonElement>(true);
  return (
    <div class="fd-screen" role="dialog" aria-label="Paused">
      <p>Paused</p>
      <button class="fd-btn" ref={first} type="button" onClick={() => facade.value?.closePauseMenu()}>Resume</button>
      <button class="fd-btn" type="button" onClick={() => facade.value?.quitToTitle()}>Quit to title</button>
    </div>
  );
}
