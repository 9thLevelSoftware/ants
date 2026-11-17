import { describe, expect, it } from 'vitest';
import { defaultBindings } from '@/input';
import { hintText } from '@/content/text';
import { HINT_IDS } from '@/sim/types';
import type { FoundingUi } from '../../screens/founding/store';
import { promptVisibility } from './foundingShown';
import { foundingShownHints, promptHintId } from './foundingShown';
import { keyCapText } from './keys';

describe('key caps come from the current bindings', () => {
  it('writes the walking keys from the four movement components, and follows a rebinding', () => {
    const set = defaultBindings();
    expect(keyCapText(set, 'move')).toBe('W A S D');
    const next = structuredClone(set);
    next.kbm['move.up'] = [{ kind: 'key', code: 'KeyI' }, null];
    next.kbm['move.left'] = [{ kind: 'key', code: 'KeyJ' }, null];
    next.kbm['move.down'] = [{ kind: 'key', code: 'KeyK' }, null];
    next.kbm['move.right'] = [{ kind: 'key', code: 'KeyL' }, null];
    expect(keyCapText(next, 'move')).toBe('I J K L');
  });

  it('shows the one key of a verb and changes when it is rebound', () => {
    const set = defaultBindings();
    expect(keyCapText(set, 'trail-toggle')).toBe('R');
    expect(keyCapText(set, 'release')).toBe('X');
    expect(keyCapText(set, 'colony-view')).toBe('M');
    expect(keyCapText(set, 'scent-view')).toBe('V');
    expect(keyCapText(set, 'why-view')).toBe('Y');
    expect(keyCapText(set, 'directives')).toBe('I');
    expect(keyCapText(set, 'possess-next')).toBe('Tab');
    const next = structuredClone(set);
    next.kbm['release'] = [{ kind: 'key', code: 'KeyN' }, null];
    expect(keyCapText(next, 'release')).toBe('N');
    next.kbm['trail-toggle'] = [null, null];
    expect(keyCapText(next, 'trail-toggle')).toBeNull(); // unbound: the card shows "?" in an unbound cap
  });

  it('writes the speed keys as a range, the look drag as the drag button, and the marker tool from its fixed text', () => {
    const set = defaultBindings();
    expect(keyCapText(set, 'speed-1')).toBe('1-4');
    const next = structuredClone(set);
    next.kbm['speed-2'] = [{ kind: 'key', code: 'KeyZ' }, null];
    expect(keyCapText(next, 'speed-1')).toBe('1 / Z / 3 / 4');
    expect(keyCapText(set, 'orbit')).toMatch(/drag/i);
    expect(keyCapText(set, null, 'Shift+1')).toBe('Shift+1');
    expect(keyCapText(set, null)).toBeNull();
  });

  it('has a key cap for every hint that names an action, with the default bindings', () => {
    const set = defaultBindings();
    for (const id of HINT_IDS) {
      const t = hintText(id);
      if (t.action !== null) expect(keyCapText(set, t.action), `${id} -> ${t.action}`).not.toBeNull();
    }
  });
});

const ui = (phase: string, prompts: { action: string; text: string }[], extra: Partial<FoundingUi> = {}): FoundingUi => ({ phase, prompts, ...extra } as unknown as FoundingUi);

describe('the opening overlay bridge', () => {
  it('maps the overlay prompts and gauges to hint ids by phase', () => {
    expect(promptHintId('search', 'move')).toBe('hint-move');
    expect(promptHintId('search', 'inspect')).toBe('hint-antennate');
    expect(promptHintId('dig', 'dig')).toBe('hint-dig');
    expect(promptHintId('seal', 'interact')).toBe('hint-seal');
    expect(promptHintId('lay', 'interact')).toBe('hint-lay');
    expect(promptHintId('lay', 'tend')).toBe('hint-timelapse');
    expect(promptHintId('handover', 'possess-next')).toBe('hint-cycle');
    expect(promptHintId('timelapse', 'interact')).toBeUndefined();
    const shown = foundingShownHints(ui('dig', [{ action: 'dig', text: 'Dig' }], { readiness: { r: 0.2, depth: 0.2, volume: 0, ready: false }, queen: { reserves: 1, desiccation: 0, health: 1, reservesFalling: false, drying: false } }));
    expect(shown.sort()).toEqual(['hint-dig', 'hint-readiness', 'hint-reserves']);
    expect(foundingShownHints(null)).toEqual([]);
  });

  it('hides the prompts whose hint is not allowed, keeps the Tend button, and shows everything when allowed', () => {
    const search = ui('search', [{ action: 'move', text: 'Walk' }, { action: 'inspect', text: 'Antennate the ground' }, { action: 'dig', text: 'Dig' }]);
    expect(promptVisibility(search, () => true)).toEqual([true, true, true]);
    expect(promptVisibility(search, (id) => id !== 'hint-move')).toEqual([false, true, true]);
    const lay = ui('lay', [{ action: 'interact', text: 'Lay eggs' }, { action: 'tend', text: 'Tend the brood' }]);
    expect(promptVisibility(lay, () => false)).toEqual([false, true]);
    expect(promptVisibility(null, () => false)).toEqual([]);
  });
});
