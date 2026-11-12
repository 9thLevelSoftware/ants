import { describe, expect, it } from 'vitest';
import { AutosaveDriver } from './autosaveDriver';
import { AutosavePolicy } from './autosavePolicy';
import { AUTOSAVE_DEFER_MAX_S, AUTOSAVE_INTERVAL_REAL_S, AUTOSAVE_MIN_GAP_S, AUTOSAVE_RETRY_S } from './constants';
import { MemoryStorage } from './memoryStorage';
import { makeRig } from './testkit';

const ctx = (over: Partial<{ block: string | null; combat: boolean; tick: number }> = {}) => ({ block: null, combat: false, tick: 100, ...over });
const play = (p: AutosavePolicy, seconds: number, playing = true, visible = true) => p.advance({ dtS: seconds, playing, visible });

describe('AutosavePolicy (GDD 06 §15)', () => {
  it('fires after the interval of unpaused visible play, not before', () => {
    const p = new AutosavePolicy();
    play(p, AUTOSAVE_INTERVAL_REAL_S - 1);
    expect(p.poll(ctx())).toBeNull();
    play(p, 1);
    expect(p.poll(ctx())).toBe('interval');
    expect(p.poll(ctx())).toBeNull(); // the attempt restarted the timer
  });

  it('paused, menu and hidden time does not count', () => {
    const p = new AutosavePolicy();
    play(p, 1000, false, true); // paused / in a menu
    play(p, 1000, true, false); // tab hidden
    expect(p.poll(ctx())).toBeNull();
    expect(p.secondsToNext()).toBe(AUTOSAVE_INTERVAL_REAL_S);
  });

  it('the setting changes the interval; off disables it', () => {
    const p = new AutosavePolicy();
    p.setIntervalMinutes(2);
    play(p, 120);
    expect(p.poll(ctx())).toBe('interval');
    p.setIntervalMinutes(0);
    play(p, 10000);
    expect(p.poll(ctx())).toBeNull();
    expect(p.secondsToNext()).toBe(Infinity);
  });

  it('test mode (enabled = false) never fires', () => {
    const p = new AutosavePolicy({ enabled: false });
    play(p, 10000);
    expect(p.poll(ctx())).toBeNull();
    expect(p.allow('season', ctx())).toBe(false);
  });

  it('stays due while blocked (time-lapse, flight, photo mode) and fires when the block lifts', () => {
    const p = new AutosavePolicy();
    play(p, AUTOSAVE_INTERVAL_REAL_S);
    expect(p.poll(ctx({ block: 'A time-lapse is running.' }))).toBeNull();
    play(p, 30);
    expect(p.poll(ctx({ block: 'A time-lapse is running.' }))).toBeNull();
    expect(p.poll(ctx())).toBe('interval');
  });

  it('combat defers up to the cap, then it writes anyway', () => {
    const p = new AutosavePolicy();
    play(p, AUTOSAVE_INTERVAL_REAL_S);
    expect(p.poll(ctx({ combat: true }))).toBeNull();
    play(p, AUTOSAVE_DEFER_MAX_S - 1);
    expect(p.poll(ctx({ combat: true }))).toBeNull();
    play(p, 2);
    expect(p.poll(ctx({ combat: true }))).toBe('interval');
  });

  it('skips an autosave when the tick equals the last saved tick, and when two come within the minimum gap', () => {
    const p = new AutosavePolicy();
    expect(p.allow('season', ctx({ tick: 100 }))).toBe(true);
    p.noteResult(true, 100);
    play(p, AUTOSAVE_MIN_GAP_S - 1);
    expect(p.allow('season', ctx({ tick: 150 }))).toBe(false); // gap
    play(p, 2);
    expect(p.allow('season', ctx({ tick: 100 }))).toBe(false); // same tick
    expect(p.allow('season', ctx({ tick: 160 }))).toBe(true);
  });

  it('checkpoint labels bypass the gap and the lapse blocks are decided by the caller', () => {
    const p = new AutosavePolicy();
    expect(p.allow('opening-sealed', ctx({ tick: 1 }))).toBe(true);
    expect(p.allow('pre-timelapse', ctx({ tick: 2 }))).toBe(true); // immediately after: no gap for checkpoints
    expect(p.allow('interval', ctx({ tick: 3 }))).toBe(false);
  });

  it('first failure retries once after 30 s; a second failure disables autosave for the session', () => {
    const p = new AutosavePolicy();
    play(p, AUTOSAVE_INTERVAL_REAL_S);
    expect(p.poll(ctx())).toBe('interval');
    expect(p.noteResult(false, 100)).toBe('retry');
    play(p, AUTOSAVE_RETRY_S - 1);
    expect(p.poll(ctx())).toBeNull();
    play(p, 1);
    expect(p.poll(ctx())).toBe('interval'); // the retry
    expect(p.noteResult(false, 100)).toBe('disabled');
    expect(p.disabled).toBe(true);
    play(p, 100000);
    expect(p.poll(ctx())).toBeNull();
    p.resetSession();
    expect(p.disabled).toBe(false);
  });

  it('a success clears the failure count', () => {
    const p = new AutosavePolicy();
    p.noteResult(false, 1);
    p.noteResult(true, 2);
    expect(p.noteResult(false, 3)).toBe('retry');
  });

  it('asks for a thumbnail shortly before the autosave is due', () => {
    const p = new AutosavePolicy();
    expect(p.wantsThumbnail()).toBe(false);
    play(p, AUTOSAVE_INTERVAL_REAL_S - 1);
    expect(p.wantsThumbnail()).toBe(true);
  });
});

describe('AutosaveDriver', () => {
  const driverRig = (opts: { autosave?: boolean } = {}) => {
    const rig = makeRig();
    const policy = new AutosavePolicy({ enabled: opts.autosave !== false });
    let visible = true;
    const host = {
      getSim: () => rig.host.sim, context: () => ({ mode: rig.host.mode, view: rig.host.view }), visible: () => visible, adopt: () => {},
      thumbnail: () => rig.host.thumb,
    };
    const driver = new AutosaveDriver(rig.manager, policy, host);
    return { rig, policy, driver, setVisible: (v: boolean) => { visible = v; } };
  };
  const settle = () => new Promise((r) => setTimeout(r, 5));

  it('writes one `interval` generation after 300 s of play (Appendix E check 25)', async () => {
    const { rig, driver } = driverRig();
    await rig.manager.init();
    for (let i = 0; i < 29; i++) driver.frame(10);
    await settle();
    expect(driver.written).toHaveLength(0);
    rig.host.sim!.tick(); // something to save
    driver.frame(10);
    await settle();
    expect(driver.written).toMatchObject([{ label: 'interval', ok: true }]);
    const list = (await rig.manager.list()).value!;
    expect(list.map((l) => [l.slot, l.label])).toEqual([['auto', 'interval']]);
    expect(rig.manager.playTimeS).toBeCloseTo(300, 0);
    expect(list[0].meta.playTimeS).toBe(300);
  });

  it('never writes during a time-lapse; pre-winter checkpoint is written anyway', async () => {
    const { rig, driver } = driverRig();
    await rig.manager.init();
    rig.host.sim!.state.player.timelapse = { kind: 'founding', startTick: 0, endTick: 9, progress: 0.1, stage: 'eggs', counters: {}, interrupt: null };
    driver.frame(400);
    await settle();
    expect(driver.written).toHaveLength(0);
    rig.host.sim!.state.env.winter.phase = 'banner';
    expect(driver.trigger('pre-winter')).toBe(true);
    await settle();
    expect(driver.written).toMatchObject([{ label: 'pre-winter', ok: true }]);
  });

  it('the intro card blocks an autosave only while the game is young', async () => {
    const { rig, driver } = driverRig();
    await rig.manager.init();
    const sim = rig.host.sim!;
    sim.state.player.opening = { ...(sim.state.player.opening ?? ({} as never)), phase: 'intro-card' } as never;
    expect((await rig.manager.autosave('interval')).code).toBe('blocked');
    expect(driver.trigger('season')).toBe(false);
    sim.state.tick = 700; // a module that never leaves the intro card must not block autosave for ever
    expect((await rig.manager.autosave('interval')).ok).toBe(true);
  });

  it('listens to the sim events that name a checkpoint', async () => {
    const { rig, driver } = driverRig();
    await rig.manager.init();
    const sim = rig.host.sim!;
    driver.attachSim(sim);
    sim.emit({ type: 'time.season', season: 'summer', year: 1 } as never);
    sim.events.flush();
    await settle();
    rig.host.sim!.tick();
    sim.emit({ type: 'overwinter.banner' } as never);
    sim.events.flush();
    await settle();
    sim.tick();
    sim.emit({ type: 'opening.phase', from: 'dig', to: 'lay' } as never);
    sim.events.flush();
    await settle();
    sim.tick();
    sim.emit({ type: 'colony.extinct', colonyId: 1, cause: 'x', causeChain: [] } as never);
    sim.events.flush();
    await settle();
    expect(driver.written.map((w) => w.label)).toEqual(['season', 'pre-winter', 'opening-sealed', 'final']);
    const list = (await rig.manager.list()).value!;
    expect(list.find((l) => l.label === 'final')!.pinned).toBe(true);
    driver.attachSim(null);
    sim.emit({ type: 'time.season', season: 'autumn', year: 1 } as never);
    sim.events.flush();
    await settle();
    expect(driver.written).toHaveLength(4);
  });

  it('opening-search writes the hidden checkpoint, not a ring generation', async () => {
    const { rig, driver } = driverRig();
    await rig.manager.init();
    driver.attachSim(rig.host.sim!);
    rig.host.sim!.emit({ type: 'opening.phase', from: 'dealation', to: 'search' } as never);
    rig.host.sim!.events.flush();
    await settle();
    expect((await rig.manager.list()).value).toHaveLength(0);
    expect((await rig.manager.list({ includeHidden: true })).value!.map((l) => l.key)).toEqual(['opening-start']);
  });

  it('two failures disable autosave and raise one notice; the game is not touched', async () => {
    const { rig, driver, policy } = driverRig();
    await rig.manager.init();
    const notices: string[] = [];
    rig.manager.on((e) => { if (e.type === 'autosave-disabled') notices.push(e.message); });
    rig.storage.failNextWrites = 99;
    rig.storage.failStatus = 'failed';
    driver.frame(300);
    await settle();
    expect(policy.disabled).toBe(false);
    driver.frame(AUTOSAVE_RETRY_S);
    await settle();
    expect(policy.disabled).toBe(true);
    expect(notices).toHaveLength(1);
    driver.frame(1000);
    await settle();
    expect(driver.written).toHaveLength(2);
  });

  it('does nothing when autosave is off (test mode)', async () => {
    const off = driverRig({ autosave: false });
    await off.rig.manager.init();
    off.driver.frame(1000);
    expect(off.driver.trigger('season')).toBe(false);
    off.driver.checkpointOpening();
    await settle();
    expect(off.driver.written).toHaveLength(0);
  });

  it('skips autosaves silently when persistent storage is unavailable', async () => {
    class Broken extends MemoryStorage {
      override async open() { return { ok: false as const, status: 'unavailable' as const, message: 'blocked' }; }
    }
    const rig = makeRig({ storage: new Broken() });
    const policy = new AutosavePolicy();
    const driver = new AutosaveDriver(rig.manager, policy, {
      getSim: () => rig.host.sim, context: () => ({ mode: 'playing', view: 'observer' }), visible: () => true, adopt: () => {},
    });
    await rig.manager.init();
    expect(rig.manager.status().availability).toBe('unavailable');
    driver.frame(1000);
    expect(driver.trigger('season')).toBe(false);
    await settle();
    expect(driver.written).toHaveLength(0);
    expect(rig.storage.writes).toBe(0);
  });

  it('the quit trigger is muted while a load replaces the game', async () => {
    const { rig, driver } = driverRig();
    await rig.manager.init();
    driver.withoutQuitSave(() => { expect(driver.trigger('quit')).toBe(false); });
    expect(driver.trigger('quit')).toBe(true);
    await settle();
    expect(driver.written).toMatchObject([{ label: 'quit', ok: true }]);
  });
});
