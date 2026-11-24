import { describe, expect, it } from 'vitest';
import { CrossfadeVeil } from './crossfadeVeil';

function fakes() {
  const style: Record<string, string> = {};
  const draws: number[] = [];
  const el = { style, width: 0, height: 0, setAttribute() {}, getContext: () => ({ drawImage: () => draws.push(1) }) };
  const source = { width: 640, height: 360, ownerDocument: { createElement: () => el }, insertAdjacentElement: (_w: string, e: unknown) => { expect(e).toBe(el); } };
  return { veil: new CrossfadeVeil(source as unknown as HTMLCanvasElement), style, draws, el };
}

describe('CrossfadeVeil', () => {
  it('shows nothing until a frame has been captured', () => {
    const { veil, style } = fakes();
    veil.setOpacity(1);
    expect(veil.showing).toBe(false);
    expect(style.display).toBe('none');
  });

  it('lays the captured still over the picture at the asked opacity and hides it at 0', () => {
    const { veil, style, el } = fakes();
    veil.capture();
    expect([el.width, el.height]).toEqual([640, 360]);
    veil.setOpacity(0.6);
    expect(veil.showing).toBe(true);
    expect([style.display, style.opacity]).toEqual(['block', '0.6']);
    veil.setOpacity(0);
    expect(veil.showing).toBe(false);
    expect(style.display).toBe('none');
  });

  it('does not overwrite the still while it is showing', () => {
    const { veil, draws } = fakes();
    veil.capture();
    veil.setOpacity(1);
    veil.capture();
    expect(draws.length).toBe(1);
    veil.setOpacity(0);
    veil.capture();
    expect(draws.length).toBe(2);
  });

  it('forgets the still on reset (a game that ended during a crossfade leaves nothing on the title screen)', () => {
    const { veil, style } = fakes();
    veil.capture();
    veil.setOpacity(1);
    veil.reset();
    expect(style.display).toBe('none');
    veil.setOpacity(1);
    expect(veil.showing).toBe(false);
  });
});
