// Key placeholders in codex lines, and the run-time citation map (review fixes).
import { describe, expect, it } from 'vitest';
import { cloneBindings, defaultBindings } from '@/input/bindings';
import { rebind } from '@/input/rebind';
import { ALL_CODEX_ENTRIES, codexInGameLine, getCodexEntry } from './index';
import { CITATIONS } from './citations';
import { PROVENANCE } from './provenance';
import { resolveKeyTokens } from './keys';

describe('{key:action-id} in codex lines', () => {
  it('resolves to the default keys in the lookup views', () => {
    expect(getCodexEntry('cx-trophallaxis')!.inGame).toContain('shares the contents');
    expect(getCodexEntry('cx-trophallaxis')!.inGame).toMatch(/\bG shares/);
    expect(getCodexEntry('cx-interface-markers')!.inGame).toContain('press Delete to cancel');
  });

  it('leaves no placeholder in any view', () => {
    for (const e of ALL_CODEX_ENTRIES) expect(getCodexEntry(e.id)!.inGame ?? '', e.id).not.toMatch(/\{key:/);
  });

  it('follows a rebinding', () => {
    const r = rebind(cloneBindings(defaultBindings()), 'share-food', 0, { kind: 'key', code: 'KeyN' }, 'swap');
    expect(r.status).toBe('applied');
    if (r.status !== 'applied') return;
    expect(codexInGameLine('cx-trophallaxis', r.bindings)).toMatch(/\bN shares/);
    expect(codexInGameLine('cx-nope')).toBeUndefined();
    expect(codexInGameLine('cx-material-loam')).toBe(getCodexEntry('cx-material-loam')!.inGame);
  });

  it('leaves an unknown action as written', () => {
    expect(resolveKeyTokens('press {key:no-such-action} now')).toBe('press {key:no-such-action} now');
  });
});

describe('citations', () => {
  it('equal the citations of the provenance tables', () => {
    const fromTables = Object.fromEntries(Object.entries(PROVENANCE).map(([id, p]) => [id, p.citation]));
    expect(CITATIONS).toEqual(fromTables);
  });
});
