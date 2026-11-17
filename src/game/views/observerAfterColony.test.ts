// Look pass 3: leaving the colony view for the observer must not orbit an ant that is still underground (the camera ended
// up inside the nest looking at soil, gate-close-app check4/rain-pip.png).
import { describe, expect, it, vi } from 'vitest';
import { requestView, toggleColonyView, type ViewSwitchHost } from './viewSwitch';
import type { GameSession } from '../session';

function fakeSession(underground: boolean) {
  const calls: string[] = [];
  const s = {
    view: 'colony', possessedId: -1, followId: 7, followItemId: -1,
    sim: {
      state: { player: { returnAntId: -1 } },
      stores: { ants: { get: (id: number) => (id === 7 ? { id, pos: { x: 1, y: underground ? -5 : 3, z: 1 } } : undefined) } },
      field: { substrate: (p: { y: number }) => p.y },
    },
    views: { unfollow: vi.fn(() => calls.push('unfollow')) },
    setView: vi.fn((v: string) => { calls.push(`view:${v}`); (s as { view: string }).view = v; }),
  };
  return { s, calls };
}
const host = (s: unknown): ViewSwitchHost => ({
  session: s as GameSession, mode: 'playing', command: () => {}, possess: () => {}, release: () => {}, viewChanged: () => {},
});

describe('observer after the colony view', () => {
  it('stays free (no follow) when the released ant is still underground', () => {
    const { s, calls } = fakeSession(true);
    toggleColonyView(host(s)); // M: colony -> back
    expect(s.followId).toBe(-1);
    expect(calls).toEqual(['unfollow', 'view:observer']);
  });
  it('keeps following an ant on the surface', () => {
    const { s, calls } = fakeSession(false);
    toggleColonyView(host(s));
    expect(s.followId).toBe(7);
    expect(calls).toEqual(['view:observer']);
  });
  it('an explicit observer request from the colony view does the same', () => {
    const { s, calls } = fakeSession(true);
    requestView(host(s), 'observer');
    expect(s.followId).toBe(-1);
    expect(calls).toEqual(['unfollow', 'view:observer']);
  });
});
