// The winter flow (GDD 06 §6.4): watching the time-lapse and skipping it end in the same simulation state and the
// same report; the banner, lapse and report read-outs; closing resumes 1x.
import { describe, expect, it } from 'vitest';
import type { Command } from '@/sim/types';
import { stateHash } from '@/sim/save/hash';
import { makeLifeSim, send, step } from '@/sim/colony/succession/testLife';
import { winterUi } from '@/ui/screens/overwinter/store';
import { GameSession } from '../../session';
import type { LifecycleHost } from '../epitaph/host';
import { WinterFlow } from './winterFlow';
import { winterLapseView } from './lapseView';
import { TICKS_PER_DAY } from '@/sim/time';

const cam = { autoFollow: 'gentle' as const, fovOffset: 0, worldUpLock: false, reducedMotion: false };

function setup() {
  const sim = makeLifeSim({ chamberC: 4 });
  const session = new GameSession(sim, cam);
  const host: LifecycleHost = {
    session, realtime: false, mode: 'playing', opts: { testMode: true }, settings: { get: () => ({ camera: { reducedMotion: false } }) },
    command: (c: Command) => { session.driver.enqueue(c); session.driver.applyCommandsNow(); },
    possess: () => {}, setSpeed: () => {}, newGame: async () => {}, quitToTitle: () => {}, load: async () => {}, refreshUi: () => {},
  };
  const flow = new WinterFlow(host);
  flow.attach(session);
  host.command({ type: 'cheat.triggerWinter' });
  flow.frame(session, 0);
  return { sim, session, flow };
}

describe('winter flow', () => {
  it('banner -> lapse -> report; watching and skipping end in the same state', () => {
    const a = setup();
    expect(winterUi.value?.phase).toBe('banner');
    a.flow.begin();
    expect(winterUi.value?.phase).toBe('lapse');
    expect(winterUi.value?.lapse?.day).toBe(1);
    for (let i = 0; i < 30; i++) a.flow.frame(a.session, 1); // 30 real seconds of watching
    const mid = winterUi.value?.lapse;
    expect(mid?.day).toBeGreaterThan(1);
    for (let i = 0; i < 30; i++) a.flow.frame(a.session, 1);
    expect(winterUi.value?.phase).toBe('report');
    const watchedHash = stateHash(a.sim.state);
    const watchedReport = JSON.stringify(winterUi.value?.report);
    a.flow.detach();

    const b = setup();
    b.flow.begin();
    b.flow.skip();
    expect(winterUi.value?.phase).toBe('report');
    expect(stateHash(b.sim.state)).toBe(watchedHash);
    expect(JSON.stringify(winterUi.value?.report)).toBe(watchedReport);
    b.flow.close();
    expect(b.sim.state.env.winter.phase).toBe('none');
    expect(b.sim.state.env.time.paused).toBe(false);
    expect(winterUi.value).toBeNull();
  });

  it('after two delays the lapse counts winter days 3 to 7', () => {
    const sim = makeLifeSim({ chamberC: 4 });
    send(sim, { type: 'cheat.triggerWinter' });
    for (let i = 0; i < 2; i++) {
      send(sim, { type: 'overwinterChoice', choice: 'delay' });
      step(sim, TICKS_PER_DAY);
    }
    send(sim, { type: 'overwinterChoice', choice: 'begin' });
    const rec = sim.state.colonies[0].lifecycle!.winters[0];
    const first = winterLapseView(rec, 0, false, false);
    expect(first.day).toBe(3);
    expect(first.days).toBe(7);
    expect(winterLapseView(rec, 0.999, false, false).day).toBe(7);
  });

  it('reduced motion: the lapse shows five stills spread over the winter', () => {
    const sim = makeLifeSim({ chamberC: 4 });
    send(sim, { type: 'cheat.triggerWinter' });
    send(sim, { type: 'overwinterChoice', choice: 'begin' });
    const rec = sim.state.colonies[0].lifecycle!.winters[0];
    const shown = new Set<number>();
    const stills = new Set<number>();
    for (let i = 0; i <= 100; i++) {
      const v = winterLapseView(rec, i / 100, true, false);
      shown.add(v.day);
      stills.add(v.still);
    }
    expect(stills.size).toBe(5);
    expect(shown.size).toBe(5);
    expect(Math.min(...shown)).toBe(1);
    expect(Math.max(...shown)).toBe(rec.days.length);
  });
});
