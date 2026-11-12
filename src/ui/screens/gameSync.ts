// Keeps KeyHints on the game's CURRENT bindings (GDD 08 2.7: never a hard-coded key). The game owns the bindings
// (stored, loaded after the shell mounted, changed by Settings); this mirrors them into the signal KeyHints read, on
// every facade change and snapshot refresh. The signal ignores a set to the same object, so an idle game costs nothing.
import { effect, untracked } from '@preact/signals';
import { setCurrentBindings } from '../components';
import { facade, snapshot } from '../store';

export function startBindingSync(): () => void {
  return effect(() => {
    const f = facade.value;
    void snapshot.value;
    untracked(() => {
      const b = f?.getBindings?.();
      if (b) setCurrentBindings(b);
    });
  });
}
