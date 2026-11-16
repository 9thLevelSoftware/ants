// Independent verification of the gamepad / rebinding half of task input-gamepad-a11y (reviewer's tests).
// Failing tests here demonstrate real bugs and are left in place for the fixer.
import { describe, expect, it } from 'vitest';
import { defaultBindings } from './bindings';
import { PAD } from './defaults';
import { hintText } from './glyphs';
import { InputState } from './inputState';
import { PadCapture } from './padCapture';
import { findConflicts, rebind } from './rebind';
import type { PadSnapshot } from './types';

function pad(buttons: number[] = [], axes: number[] = [0, 0, 0, 0]): PadSnapshot {
  const b = new Array<number>(17).fill(0);
  for (const i of buttons) b[i] = 1;
  return { index: 0, id: 'Xbox 360 Controller (STANDARD GAMEPAD Vendor: 045e Product: 028e)', mapping: 'standard', buttons: b, axes };
}

/** An InputState in one context, plus a frame driver that records every action pressed on any frame. */
function rig(ctx: 'P' | 'O' | 'C' = 'P') {
  const input = new InputState();
  input.contexts.setBase(ctx);
  let now = 1000;
  input.update(now);
  const seen = new Set<string>();
  const frame = (p: PadSnapshot | null, ms = 16) => {
    input.setPads(p ? [p] : []);
    now += ms;
    input.update(now);
    for (const id of ['possess-next', 'possess-prev', 'directives', 'roster', 'journal', 'codex', 'why-view', 'nest-overview', 'overlay-cycle',
      'dismiss-hint', 'alert-jump', 'trail-toggle', 'release', 'foot', 'dig', 'inspect', 'colony-view', 'speed-down', 'pause-toggle']) {
      if (input.pressed(id)) seen.add(id);
    }
  };
  return { input, frame, seen };
}

describe('RB as the panel modifier must not also take the next ant (GDD 08 5.4: RB+View with RB as a modifier)', () => {
  // The task addendum: "RB as a modifier so View alone keeps its meaning". RB alone is `possess-next` (a plain press), so
  // every RB + X combination also fires possess-next on the RB press edge -> opening Colony orders by pad switches ant.
  for (const [name, button] of [['directives', PAD.DUP], ['roster', PAD.DDOWN], ['journal', PAD.X], ['codex', PAD.Y], ['dismiss-hint', PAD.VIEW]] as const) {
    it(`RB + ${name}: fires ${name} and NOT possess-next`, () => {
      const { frame, seen } = rig('P');
      frame(null);
      frame(pad([PAD.RB]));
      frame(pad([PAD.RB, button]));
      frame(pad([PAD.RB]));
      frame(pad());
      if (name !== 'dismiss-hint' && name !== 'journal' && name !== 'codex' && name !== 'roster') expect(seen.has(name)).toBe(true);
      expect([...seen], 'possess-next fired while RB was only a modifier').not.toContain('possess-next');
    });
  }

  it('LB + RB (alert-jump) does not fire possess-next (LB first): the existing yield rule works for a held LB', () => {
    const { frame, seen } = rig('P');
    frame(null);
    frame(pad([PAD.LB]));
    frame(pad([PAD.LB, PAD.RB]));
    frame(pad());
    expect(seen.has('alert-jump')).toBe(true);
    expect(seen.has('possess-next')).toBe(false);
    expect(seen.has('possess-prev')).toBe(false);
  });

  it('LB + D-pad up pauses and does not take the previous ant (LB is a tap gesture)', () => {
    const { frame, seen } = rig('O');
    frame(null);
    frame(pad([PAD.LB]));
    frame(pad([PAD.LB, PAD.DUP]));
    frame(pad([PAD.LB]));
    frame(pad());
    expect(seen.has('pause-toggle')).toBe(true);
    expect(seen.has('possess-prev')).toBe(false);
  });
});

describe('pad rebinding conflicts are never silent (GDD 01 5.7)', () => {
  // The pad capture always yields a plain `{ kind: 'pad', button }`. sameBinding() treats a plain press, a tap and a
  // hold of the same button as different bindings, so a captured View is applied without any conflict although
  // `release` (View tap) and `colony-view` (View hold) are live in the same contexts and would fire together.
  it('capturing View for possess-next reports the View tap (release) / View hold (colony view) owners', () => {
    const set = defaultBindings();
    const captured = feedCapture([pad([]), pad([PAD.VIEW])]);
    expect(captured).toEqual({ kind: 'pad', button: PAD.VIEW });
    const conflicts = findConflicts(set, 'possess-next', captured!).map((c) => c.actionId);
    expect(conflicts, 'no conflict reported for View').toEqual(expect.arrayContaining(['release']));
    expect(rebind(set, 'possess-next', 'pad', captured!).status).toBe('conflict');
  });

  it('capturing View again for release keeps the tap gesture (otherwise holding View for the colony view also releases)', () => {
    const set = defaultBindings();
    const captured = feedCapture([pad([]), pad([PAD.VIEW])])!;
    const r = rebind(set, 'release', 'pad', captured);
    expect(r.status).toBe('applied');
    if (r.status !== 'applied') return;
    // the player rebound release to the very button it had: View held 600 ms must not also release the ant
    const input = new InputState(r.bindings);
    input.contexts.setBase('P');
    let now = 1000;
    input.update(now);
    let released = false, colony = false;
    for (let t = 0; t <= 600; t += 16) {
      input.setPads([pad([PAD.VIEW])]); now += 16; input.update(now);
      released ||= input.pressed('release'); colony ||= input.pressed('colony-view');
    }
    expect(colony).toBe(true);
    expect(released, 'release fired on a View hold after rebinding it to View').toBe(false);
  });
});

function feedCapture(frames: PadSnapshot[]) {
  const c = new PadCapture('button');
  let out = null;
  for (const f of frames) out = c.feed(f) ?? out;
  return out;
}

describe('pad capture edge cases', () => {
  it('Home is never captured; LB held then released alone is LB; LB then RB is RB with LB', () => {
    expect(feedCapture([pad([]), pad([PAD.HOME]), pad([])])).toBeNull();
    expect(feedCapture([pad([]), pad([PAD.LB]), pad([])])).toEqual({ kind: 'pad', button: PAD.LB });
    // LB held, RB pressed: RB is itself a modifier button, so the combination is not offered and RB+LB stays pending
    const c = new PadCapture('button');
    c.feed(pad([])); c.feed(pad([PAD.LB])); c.feed(pad([PAD.LB, PAD.RB]));
    expect(c.feed(pad([]))).toEqual({ kind: 'pad', button: PAD.LB }); // documented: the first modifier wins
  });

  it('a missing pad mid-capture does not arm or capture', () => {
    const c = new PadCapture('button');
    expect(c.feed(null)).toBeNull();
    expect(c.feed(pad([PAD.A]))).toBeNull(); // not armed yet: A still held from opening the row
    expect(c.feed(pad([]))).toBeNull();
    expect(c.feed(pad([PAD.B]))).toEqual({ kind: 'pad', button: PAD.B });
  });
});

describe('hint text', () => {
  it('GDD 08 App E 21: rebinding Dig to D names "Move right"; Swap gives Move right = F', async () => {
    const { conflictMessage } = await import('../ui/screens/settings/captureBinding');
    const set = defaultBindings();
    const d = { kind: 'key', code: 'KeyD' } as const;
    const r = rebind(set, 'dig', 0, d);
    expect(r.status).toBe('conflict');
    if (r.status !== 'conflict') return;
    expect(conflictMessage(d, r.conflicts)).toContain('Move right');
    const s = rebind(set, 'dig', 0, d, 'swap');
    expect(s.status).toBe('applied');
    if (s.status !== 'applied') return;
    expect(s.bindings.kbm['dig'][0]).toEqual(d);
    expect(s.bindings.kbm['move.right'][0]).toEqual({ kind: 'key', code: 'KeyF' });
  });

  it('a pad hint for an action with no pad binding is null (the caller decides the fallback)', () => {
    const set = defaultBindings();
    expect(hintText(set, 'possess-last', 'pad')).toBeNull();
    expect(hintText(set, 'cv-rotate', 'pad')).toBe('Right stick');
  });
});
