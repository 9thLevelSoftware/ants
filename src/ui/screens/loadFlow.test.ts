import { describe, expect, it } from 'vitest';
import type { GameFacade, SaveResult } from '../api';
import { importInto, loadingContext, loadSlot, markGenerating } from './loadFlow';

function fakeFacade(log: string[]): GameFacade {
  const ok: SaveResult = { ok: true, status: 'ok' };
  return {
    load: async (s: string) => { log.push(`load ${s}`); return ok; },
    importSave: async (_d: Uint8Array | string, t: string) => { log.push(`import ${t}`); return ok; },
  } as unknown as GameFacade;
}

describe('what the loading screen is for', () => {
  it('a slot load marks the screen as a load of that save, a new game marks it as generation', async () => {
    const log: string[] = [];
    const info = { slot: 'slot-1', label: 'Slot 1', savedAt: '', colonyDay: 3, workers: 4, species: 'lasius-niger' };
    await loadSlot(fakeFacade(log), 'slot-1', info);
    expect(loadingContext.value).toEqual({ kind: 'load', info });
    expect(log).toEqual(['load slot-1']);
    markGenerating();
    expect(loadingContext.value).toEqual({ kind: 'generate', info: null });
  });

  it('only "load now" imports lead to the loading screen; stored imports leave it alone', async () => {
    const log: string[] = [];
    markGenerating();
    await importInto(fakeFacade(log), 'FOUNDRESS1:AAAA', 'slot-2');
    expect(loadingContext.value.kind).toBe('generate');
    await importInto(fakeFacade(log), 'FOUNDRESS1:AAAA', 'now');
    expect(loadingContext.value).toEqual({ kind: 'load', info: null });
    expect(log).toEqual(['import slot-2', 'import now']);
  });
});
