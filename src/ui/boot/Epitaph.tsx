// Placeholder epitaph card (GDD 01 §1.1, T1 minimal): the colony has died, age, peak population, cause.
import type { UiSnapshot } from '../api';
import { facade } from '../store';

export function Epitaph({ e }: { e: UiSnapshot['epitaph'] }) {
  return (
    <div class="fd-screen" role="dialog" aria-label="The colony has died">
      <h2>The colony has died</h2>
      {e && <p>{e.ageDays} days old · peak {e.peakWorkers} workers · {e.cause}</p>}
      <button class="fd-btn" type="button" onClick={() => { void facade.value?.newGame({}); }}>New game</button>
      <button class="fd-btn" type="button" onClick={() => facade.value?.quitToTitle()}>Title</button>
    </div>
  );
}
