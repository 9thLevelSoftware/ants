// Placeholder title screen: name, subtitle and a "Begin" button (the ui-shell task replaces it).
import { useAutoFocusRef } from '../components/focus';
import { facade } from '../store';

export function Title() {
  const first = useAutoFocusRef<HTMLButtonElement>(true);
  return (
    <div class="fd-screen" role="dialog" aria-label="Title">
      <h1 class="fd-title">FOUNDRESS</h1>
      <p class="fd-sub">A naturalistic ant colony sandbox</p>
      <button class="fd-btn" ref={first} type="button" onClick={() => { void facade.value?.newGame({}); }}>Begin</button>
    </div>
  );
}
