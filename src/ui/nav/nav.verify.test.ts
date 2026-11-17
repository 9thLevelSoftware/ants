// Independent verification of the navigation layer (reviewer's tests). Failing tests demonstrate real bugs.
import { describe, expect, it } from 'vitest';
import { defaultBindings, type Binding } from '@/input';
import { PAD } from '@/input/defaults';
import type { PadSnapshot } from '@/input/types';
import { PadReader } from './padReader';
import { ShortcutMatcher, shortcutsOf } from './shortcuts';

const snap = (buttons: number[] = [], axes = [0, 0, 0, 0]): PadSnapshot => {
  const b = new Array<number>(17).fill(0);
  for (const i of buttons) b[i] = 1;
  return { index: 0, id: 'pad', mapping: 'standard', buttons: b, axes };
};

/** The ids NavController.play() matches while the game owns the pad (controller.ts PANEL_ACTIONS + EXTRA_ACTIONS). */
const PLAY_IDS = ['directives', 'roster', 'why-view', 'nest-overview', 'journal', 'codex', 'scent-view', 'overlay-cycle', 'dismiss-hint', 'alert-focus', 'controls-reminder'];

function run(frames: number[][]): string[] {
  const list = shortcutsOf(defaultBindings().pad as Record<string, Binding | null>, PLAY_IDS);
  const m = new ShortcutMatcher(), r = new PadReader();
  const out: string[] = [];
  let t = 0;
  r.update(snap(), t);
  for (const f of frames) { t += 16; out.push(...m.fired(list, r.update(snap(f), t))); }
  return out;
}

describe('pad shortcuts of play do not fire inside the game\'s own LB combinations', () => {
  // LB + D-pad left is speed-down (GDD 01 5.1). The nav matcher only knows its own list, in which D-pad left alone is
  // the scent view; LB is not a modifier of anything in that list, so speed-down also toggles the scent overlay.
  it('LB + D-pad left (speed down) does not toggle the scent view', () => {
    expect(run([[PAD.LB], [PAD.LB, PAD.DLEFT], [PAD.LB], []])).not.toContain('scent-view');
  });

  it('RB + D-pad left opens the nest overview and not the scent view', () => {
    expect(run([[PAD.RB], [PAD.RB, PAD.DLEFT], [PAD.RB], []])).toEqual(['nest-overview']);
  });

  it('RB + B is the overlay cycle; LB + B (possess a nurse) fires none of the play shortcuts', () => {
    expect(run([[PAD.RB], [PAD.RB, PAD.B], []])).toEqual(['overlay-cycle']);
    expect(run([[PAD.LB], [PAD.LB, PAD.B], []])).toEqual([]);
  });

  it('LB + View is the alert feed and RB + View dismisses the hint', () => {
    expect(run([[PAD.LB], [PAD.LB, PAD.VIEW], []])).toEqual(['alert-focus']);
    expect(run([[PAD.RB], [PAD.RB, PAD.VIEW], []])).toEqual(['dismiss-hint']);
  });

  it('Start held 1 s fires the controls reminder once', () => {
    const list = shortcutsOf(defaultBindings().pad as Record<string, Binding | null>, PLAY_IDS);
    const m = new ShortcutMatcher(), r = new PadReader();
    r.update(snap(), 0);
    const got: string[] = [];
    for (let t = 16; t < 1600; t += 16) got.push(...m.fired(list, r.update(snap([PAD.START]), t)));
    expect(got).toEqual(['controls-reminder']);
  });
});

describe('PadReader edge cases', () => {
  it('a pad with fewer buttons than the standard layout does not throw and reads the rest as up', () => {
    const r = new PadReader();
    const short: PadSnapshot = { index: 0, id: 'x', mapping: '', buttons: [1, 0], axes: [] };
    r.update({ ...short, buttons: [0, 0] }, 0);
    const f = r.update(short, 16);
    expect(f.edge(PAD.A)).toBe(true);
    expect(f.down(PAD.START)).toBe(false);
    expect(f.move).toBeNull();
  });
});
