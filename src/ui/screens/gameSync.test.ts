import { describe, expect, it } from 'vitest';
import { cloneBindings, defaultBindings, type BindingSet } from '@/input';
import type { GameFacade } from '../api';
import { currentBindings, hintLabel } from '../components';
import { emptySnapshot } from '../api';
import { facade, setSnapshot } from '../store';
import { startBindingSync } from './gameSync';

/** A facade that answers only what the sync asks for. */
const gameWith = (b: BindingSet) => ({ getBindings: () => b }) as unknown as GameFacade;

describe('KeyHints follow the game bindings, not the defaults', () => {
  it('seeds from the game on attach and follows later changes at the next snapshot refresh', () => {
    const custom = cloneBindings(defaultBindings());
    custom.kbm['pause-toggle'] = [{ kind: 'key', code: 'KeyP' }, null];
    const stop = startBindingSync();
    try {
      facade.value = gameWith(custom);
      expect(hintLabel(currentBindings.value, 'pause-toggle')).toBe('P');
      const later = cloneBindings(custom);
      later.kbm['pause-toggle'] = [{ kind: 'key', code: 'KeyO' }, null];
      facade.value = gameWith(later);
      setSnapshot({ ...emptySnapshot('title'), rev: 5 });
      expect(hintLabel(currentBindings.value, 'pause-toggle')).toBe('O');
    } finally {
      stop();
      facade.value = null;
    }
  });
});
