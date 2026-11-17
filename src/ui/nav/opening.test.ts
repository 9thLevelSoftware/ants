// The opening's pad controls that live in the DOM layer (controller.ts opening()): any button skips the intro card,
// holding the interact button tends the brood once the queen has laid, holding the time-lapse skip button skips it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PAD } from '@/input/defaults';
import type { PadSnapshot } from '@/input/types';
import { foundingActions, foundingUi, type FoundingActions, type FoundingUi } from '../screens/founding/store';
import { setSnapshot, snapshot } from '../store';
import { NavController } from './controller';

const pad = (buttons: number[] = []): PadSnapshot => {
  const b = new Array<number>(17).fill(0);
  for (const i of buttons) b[i] = 1;
  return { index: 0, id: 'pad', mapping: 'standard', buttons: b, axes: [0, 0, 0, 0] };
};

function actions(): { [K in keyof FoundingActions]: ReturnType<typeof vi.fn> } {
  return { skipIntro: vi.fn(), beginLapse: vi.fn(), skipLapse: vi.fn(), closeOutcome: vi.fn(), stayWithQueen: vi.fn(), takeWorker: vi.fn(), retry: vi.fn(), acceptFailure: vi.fn() } as never;
}

const ui = (phase: string, over: Partial<FoundingUi> = {}): FoundingUi => ({ phase, canBeginLapse: false, ...over } as FoundingUi);

describe('the opening by pad (NavController.opening)', () => {
  const g = globalThis as unknown as { document?: unknown };
  const saved = g.document;
  beforeEach(() => {
    // no DOM here: no menu layer is live, so the game owns the pad
    g.document = { querySelector: () => null, querySelectorAll: () => [], activeElement: null, documentElement: { dataset: {} } };
    setSnapshot({ ...snapshot.peek(), mode: 'playing' });
  });
  afterEach(() => { g.document = saved; foundingUi.value = null; foundingActions.value = null; });

  const run = (ctl: NavController, frames: [number, number[]][]) => { for (const [t, b] of frames) ctl.step(t, pad(b)); };

  it('any pad button skips the intro card', () => {
    const a = actions();
    foundingActions.value = a as never;
    foundingUi.value = ui('intro-card');
    run(new NavController(), [[0, []], [16, [PAD.A]]]);
    expect(a.skipIntro).toHaveBeenCalledTimes(1);
  });

  it('holding the interact button after the first eggs begins the time-lapse; a tap does not', () => {
    const a = actions();
    foundingActions.value = a as never;
    foundingUi.value = ui('lay', { canBeginLapse: true });
    const ctl = new NavController();
    run(ctl, [[0, []], [16, [PAD.A]], [100, [PAD.A]], [150, []]]);
    expect(a.beginLapse, 'a tap tends nothing').not.toHaveBeenCalled();
    run(ctl, [[300, [PAD.A]]]);
    for (let t = 316; t < 1500; t += 16) ctl.step(t, pad([PAD.A]));
    expect(a.beginLapse).toHaveBeenCalledTimes(1);
  });

  it('no eggs yet: holding the interact button does not tend', () => {
    const a = actions();
    foundingActions.value = a as never;
    foundingUi.value = ui('lay', { canBeginLapse: false });
    const ctl = new NavController();
    ctl.step(0, pad());
    for (let t = 16; t < 2000; t += 16) ctl.step(t, pad([PAD.A]));
    expect(a.beginLapse).not.toHaveBeenCalled();
  });

  it('holding the skip button for a second skips the time-lapse; releasing sooner does not', () => {
    const a = actions();
    foundingActions.value = a as never;
    foundingUi.value = ui('timelapse');
    const ctl = new NavController();
    ctl.step(0, pad());
    for (let t = 16; t < 600; t += 16) ctl.step(t, pad([PAD.A]));
    ctl.step(620, pad());
    expect(a.skipLapse, 'released after 0.6 s').not.toHaveBeenCalled();
    for (let t = 700; t < 2000; t += 16) ctl.step(t, pad([PAD.A]));
    expect(a.skipLapse).toHaveBeenCalledTimes(1);
  });
});
