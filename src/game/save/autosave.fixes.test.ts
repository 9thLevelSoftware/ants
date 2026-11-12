// Regression tests for the review findings of the save layer (combat deferral of named triggers, the opening
// checkpoint's retirement, the quit gap exemption, the profile's codex wiring, download in a frame).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfileStore } from '../profile/profile';
import { AutosaveDriver } from './autosaveDriver';
import { AutosavePolicy } from './autosavePolicy';
import { AUTOSAVE_DEFER_MAX_S, AUTOSAVE_MIN_GAP_S } from './constants';
import { downloadBytes, maybeFramed } from './download';
import { attachProfileEvents } from './profileEvents';
import { makeRig } from './testkit';

const settle = () => new Promise((r) => setTimeout(r, 5));
const noTimers = { setTimer: () => 1, clearTimer: () => {} };

function driverRig(profile?: ProfileStore) {
  const rig = makeRig();
  const policy = new AutosavePolicy();
  const host = {
    getSim: () => rig.host.sim, context: () => ({ mode: rig.host.mode, view: rig.host.view }), visible: () => true, adopt: () => {},
  };
  const driver = new AutosaveDriver(rig.manager, policy, host, (sim) => (profile ? attachProfileEvents(sim, profile) : []));
  return { rig, policy, driver };
}

/** Puts the possessed ant into combat (only the fields autosave reads). */
function fight(rig: ReturnType<typeof makeRig>, on: boolean): void {
  const state = rig.host.sim!.state;
  const ant = state.ants.find((a) => a.alive)!;
  state.player.possessedAntId = ant.id;
  ant.combat = on ? ({} as never) : null;
}

describe('named autosave triggers and combat (GDD 08 §7.6)', () => {
  it('a season-change autosave waits for the possessed ant\'s fight to end', async () => {
    const { rig, driver } = driverRig();
    await rig.manager.init();
    rig.host.sim!.tick();
    fight(rig, true);
    expect(driver.trigger('season')).toBe(false);
    driver.frame(5);
    await settle();
    expect(driver.written).toHaveLength(0);
    fight(rig, false);
    driver.frame(1);
    await settle();
    expect(driver.written).toMatchObject([{ label: 'season', ok: true }]);
    driver.frame(60); // the deferral is spent: nothing more is written for it
    await settle();
    expect(driver.written).toHaveLength(1);
  });

  it('writes anyway after AUTOSAVE_DEFER_MAX_S of combat', async () => {
    const { rig, driver } = driverRig();
    await rig.manager.init();
    rig.host.sim!.tick();
    fight(rig, true);
    driver.trigger('season');
    driver.frame(AUTOSAVE_DEFER_MAX_S - 1);
    await settle();
    expect(driver.written).toHaveLength(0);
    driver.frame(2);
    await settle();
    expect(driver.written).toMatchObject([{ label: 'season', ok: true }]);
  });

  it('checkpoints, quit and hidden are never deferred', async () => {
    const { rig, driver } = driverRig();
    await rig.manager.init();
    rig.host.sim!.tick();
    fight(rig, true);
    expect(driver.trigger('pre-winter')).toBe(true);
    await settle();
    rig.host.sim!.tick();
    expect(driver.trigger('quit')).toBe(true);
  });

  it('a deferred trigger is forgotten when the game is replaced', async () => {
    const { rig, driver } = driverRig();
    await rig.manager.init();
    rig.host.sim!.tick();
    fight(rig, true);
    driver.trigger('season');
    driver.attachSim(null);
    fight(rig, false);
    driver.frame(5);
    await settle();
    expect(driver.written).toHaveLength(0);
  });
});

describe('quit autosave', () => {
  it('ignores the 5 s minimum gap (the game is about to go) but not the time-lapse block', async () => {
    const { rig, policy, driver } = driverRig();
    await rig.manager.init();
    rig.host.sim!.tick();
    expect(driver.trigger('hidden')).toBe(true);
    await settle();
    rig.host.sim!.tick();
    driver.frame(AUTOSAVE_MIN_GAP_S / 2);
    expect(driver.trigger('season')).toBe(false); // inside the gap
    expect(driver.trigger('quit')).toBe(true); // exempt from it
    await settle();
    expect(policy.disabled).toBe(false);
  });
});

describe('opening checkpoint', () => {
  it('is deleted at the first winter report and a later run is harmless', async () => {
    const { rig, driver } = driverRig();
    await rig.manager.init();
    const sim = rig.host.sim!;
    driver.attachSim(sim);
    sim.emit({ type: 'opening.phase', from: 'dealation', to: 'search' } as never);
    sim.events.flush();
    await settle();
    expect((await rig.manager.list({ includeHidden: true })).value!.map((l) => l.key)).toEqual(['opening-start']);
    sim.emit({ type: 'overwinter.report', report: {} } as never);
    sim.events.flush();
    await settle();
    expect((await rig.manager.list({ includeHidden: true })).value).toHaveLength(0);
    sim.emit({ type: 'overwinter.report', report: {} } as never);
    sim.events.flush();
    await settle();
    expect((await rig.manager.list({ includeHidden: true })).value).toHaveLength(0);
  });
});

describe('quota relief ordering for the ring', () => {
  it('a pinned `final` generation is never the one dropped', async () => {
    const r = makeRig();
    r.host.sim!.tick();
    await r.manager.autosave('interval');
    r.host.sim!.tick();
    await r.manager.autosave('final');
    r.host.sim!.tick();
    await r.manager.autosave('interval');
    r.host.sim!.tick();
    r.storage.failNextWrites = 1;
    r.storage.failStatus = 'quota';
    expect((await r.manager.autosave('interval')).ok).toBe(true);
    const list = (await r.manager.list()).value!;
    expect(list.filter((l) => l.pinned)).toHaveLength(1);
    expect(list).toHaveLength(3);
  });
});

describe('profile wiring', () => {
  it('a codex.unlocked event writes the unlock with the moment it happened', async () => {
    const profile = new ProfileStore({ ...noTimers });
    const { rig, driver } = driverRig(profile);
    const sim = rig.host.sim!;
    driver.attachSim(sim);
    sim.tick();
    sim.emit({ type: 'codex.unlocked', id: 'cx-dew' } as never);
    sim.events.flush();
    const entry = profile.get().codex['cx-dew'];
    expect(entry).toMatchObject({ tick: sim.state.tick, species: sim.state.config.species });
    expect(entry.year).toBeGreaterThanOrEqual(1);
    expect(profile.isCodexUnlocked('cx-dew')).toBe(true);
    sim.emit({ type: 'codex.unlocked', id: 'cx-dew' } as never); // a repeat changes nothing
    sim.events.flush();
    driver.attachSim(null);
    sim.emit({ type: 'codex.unlocked', id: 'cx-other' } as never);
    sim.events.flush();
    expect(profile.isCodexUnlocked('cx-other')).toBe(false);
  });
});

describe('export download inside a frame', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a framed page is treated as "downloads may be blocked" (no silent no-op)', () => {
    const click = vi.fn();
    vi.stubGlobal('window', { self: {}, top: {} });
    vi.stubGlobal('document', { createElement: () => ({ click, remove() {}, style: {} }), body: { appendChild() {} } });
    expect(maybeFramed()).toBe(true);
    expect(downloadBytes(new Uint8Array(3), 'a.foundress')).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });

  it('a cross-origin parent (window.top throws) counts as framed; an unframed page downloads', () => {
    vi.stubGlobal('window', { self: {}, get top(): never { throw new Error('cross-origin'); } });
    expect(maybeFramed()).toBe(true);
    const win = {} as Record<string, unknown>;
    win.self = win;
    win.top = win;
    const click = vi.fn();
    vi.stubGlobal('window', win);
    vi.stubGlobal('document', { createElement: () => ({ click, remove() {}, style: {} }), body: { appendChild() {} } });
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL() {} });
    expect(maybeFramed()).toBe(false);
    expect(downloadBytes(new Uint8Array(3), 'a.foundress')).toBe(true);
    expect(click).toHaveBeenCalledOnce();
  });
});
