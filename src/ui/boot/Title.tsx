// Placeholder title screen: name, subtitle and a "Begin" button (the ui-shell task replaces it).
import { facade } from '../store';

export function Title() {
  return (
    <div class="fd-screen" role="dialog" aria-label="Title">
      <h1 class="fd-title">FOUNDRESS</h1>
      <p class="fd-sub">A naturalistic ant colony sandbox</p>
      <button class="fd-btn" type="button" autofocus onClick={() => { void facade.value?.newGame({}); }}>Begin</button>
    </div>
  );
}
