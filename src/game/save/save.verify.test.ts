// Independent review tests for the save layer (task save). Comments marked BUG describe the defect a test found;
// all of them are fixed now and the tests guard against a return.
import { describe, expect, it } from 'vitest';
import { stateHash } from '@/sim/save/hash';
import { AutosaveDriver } from './autosaveDriver';
import { AutosavePolicy } from './autosavePolicy';
import { bytesToText, parseBytes, parseText } from './container';
import { seedCodeOf } from './meta';
import { MemoryStorage } from './memoryStorage';
import { makeRig } from './testkit';

const tickN = (sim: { tick(): void }, n: number) => { for (let i = 0; i < n; i++) sim.tick(); };
const settle = () => new Promise((r) => setTimeout(r, 5));

function driverRig() {
  const rig = makeRig();
  const policy = new AutosavePolicy();
  const host = {
    getSim: () => rig.host.sim, context: () => ({ mode: rig.host.mode, view: rig.host.view }), visible: () => true, adopt: () => {},
  };
  return { rig, policy, driver: new AutosaveDriver(rig.manager, policy, host) };
}

describe('review: autosave ring under quota', () => {
  // BUG: the spec says "drop the oldest autosave generation and retry". For an autosave the write target is already the
  // oldest cell, so oldestDroppable(cache, key) picks the SECOND oldest; the retry then writes into that freed cell and
  // the oldest generation survives while a newer one is lost.
  it('quota relief during an autosave drops the oldest generation, not a newer one', async () => {
    const r = makeRig();
    for (let i = 0; i < 3; i++) { tickN(r.host.sim!, 1); r.clock.ms += 1000; expect((await r.manager.autosave('interval')).ok).toBe(true); }
    r.storage.failNextWrites = 1; // the next write fails with quota, the delete + retry succeed
    r.storage.failStatus = 'quota';
    tickN(r.host.sim!, 1);
    r.clock.ms += 1000;
    const out = await r.manager.autosave('interval');
    expect(out.ok).toBe(true);
    const gens = (await r.manager.list()).value!.map((l) => l.generation).sort();
    // Ring [1,2,3] + new 4: only the oldest (1) goes. (The reviewer's draft expected [3, 4], i.e. two drops for one
    // write, which is more than "drop the oldest generation and retry"; the bug was [1, 3, 4]: 2 dropped, 1 kept.)
    expect(gens).toEqual([2, 3, 4]);
  });

  it('quota relief for a manual save drops the oldest generation', async () => {
    const r = makeRig();
    for (let i = 0; i < 3; i++) { tickN(r.host.sim!, 1); await r.manager.autosave('interval'); }
    r.storage.failNextWrites = 1;
    r.storage.failStatus = 'quota';
    expect((await r.manager.saveTo('slot-2')).ok).toBe(true);
    const autos = (await r.manager.list()).value!.filter((l) => l.slot === 'auto').map((l) => l.generation).sort();
    expect(autos).toEqual([2, 3]);
  });
});

describe('review: autosave timing rules', () => {
  // BUG: 'quit' is in CHECKPOINT_LABELS, and checkpoint labels skip the lapse/flight/intro blocks in blockReason.
  // GDD 06 §6/§15: "A save made inside the lapse is impossible (autosave blocks)". Returning to the title during the
  // winter or founding time-lapse writes a mid-lapse autosave into the ring.
  it('returning to the title during a time-lapse does not autosave', async () => {
    const { rig, driver } = driverRig();
    await rig.manager.init();
    tickN(rig.host.sim!, 1);
    rig.host.sim!.state.player.timelapse = { kind: 'founding', startTick: 0, endTick: 100, progress: 0.3, stage: 'eggs', counters: {}, interrupt: null } as never;
    expect(driver.trigger('quit')).toBe(false); // actual: true, and a generation labelled `quit` is written
    await settle();
    expect((await rig.manager.list()).value).toHaveLength(0);
  });

  it('a page-hidden autosave respects the time-lapse block', async () => {
    const { rig, driver } = driverRig();
    await rig.manager.init();
    tickN(rig.host.sim!, 1);
    rig.host.sim!.state.player.timelapse = { kind: 'founding', startTick: 0, endTick: 100, progress: 0.3, stage: 'eggs', counters: {}, interrupt: null } as never;
    expect(driver.trigger('hidden')).toBe(false);
  });

  // BUG: the policy resets its interval timer when it decides to write (markAttempt), and the driver ignores a `busy`
  // result. If a manual save is running at the moment the interval autosave falls due, that autosave is silently
  // skipped and the next one comes a full interval later (10 min of play without an autosave at the default 5 min).
  it('an interval autosave that met a running manual save is written soon after', async () => {
    const { rig, driver } = driverRig();
    await rig.manager.init();
    tickN(rig.host.sim!, 1);
    const manual = rig.manager.saveTo('slot-1'); // still running when the autosave falls due
    driver.frame(300);
    await manual;
    await settle();
    expect(driver.written.map((w) => w.ok)).toEqual([false]); // the busy attempt
    tickN(rig.host.sim!, 1);
    driver.frame(10); // well past the 5 s minimum gap
    await settle();
    expect(driver.written.filter((w) => w.ok)).toHaveLength(1); // actual: 0 until another 300 s of play
  });

  it('autosave never fires while the page is hidden or the game paused, and play time does not count then', async () => {
    const rig = makeRig();
    const policy = new AutosavePolicy();
    let visible = false;
    const driver = new AutosaveDriver(rig.manager, policy, {
      getSim: () => rig.host.sim, context: () => ({ mode: rig.host.mode, view: 'observer' }), visible: () => visible, adopt: () => {},
    });
    await rig.manager.init();
    tickN(rig.host.sim!, 1);
    driver.frame(1000);
    rig.host.mode = 'paused';
    visible = true;
    driver.frame(1000);
    await settle();
    expect(driver.written).toHaveLength(0);
    expect(rig.manager.playTimeS).toBe(0);
  });
});

describe('review: load', () => {
  // GDD 06 §15 rule 6: a failed integrity check marks the slot damaged. When every ring cell has damaged metadata, load('auto')
  // reports "no save" instead of "damaged".
  it('MINOR: load("auto") with every generation damaged says damaged, not empty', async () => {
    const storage = new MemoryStorage({ persistent: true });
    const a = makeRig({ storage });
    await a.manager.autosave('interval');
    await storage.write([{ op: 'put', store: 'meta', key: 'auto-1', value: { junk: true } }]);
    const b = makeRig({ storage });
    const out = await b.manager.load('auto');
    expect(out.ok).toBe(false);
    expect(out.code).toBe('corrupt'); // actual: not-found
  });

  it('a loaded sim is independent of the stored save: loading twice gives the saved tick both times', async () => {
    const r = makeRig();
    tickN(r.host.sim!, 3);
    const h = stateHash(r.host.sim!.state);
    await r.manager.saveTo('slot-1');
    expect((await r.manager.load('slot-1')).ok).toBe(true);
    tickN(r.host.sim!, 7);
    expect((await r.manager.load('slot-1')).ok).toBe(true);
    expect(r.host.sim!.state.tick).toBe(3);
    expect(stateHash(r.host.sim!.state)).toBe(h);
  });

  it('a failed load leaves the running game in place', async () => {
    const r = makeRig();
    await r.manager.saveTo('slot-1');
    const before = r.host.sim;
    const wrongWorld = { ...r.world, meta: { ...r.world.meta, fingerprint: (r.world.meta.fingerprint + 1) >>> 0 } };
    const m2 = makeRig({ storage: r.storage, manager: { loader: { worldFor: () => wrongWorld } } });
    m2.host.sim = before;
    const out = await m2.manager.load('slot-1');
    expect(out.code).toBe('world-mismatch');
    expect(m2.host.sim).toBe(before);
    expect(m2.host.adopted).toHaveLength(0);
  });

  it('save and load never change the live state (hash before == after)', async () => {
    const r = makeRig({ workers: 40 });
    tickN(r.host.sim!, 5);
    const h = stateHash(r.host.sim!.state);
    await r.manager.saveTo('quick');
    await r.manager.autosave('interval');
    await r.manager.exportCurrent({ method: 'bytes' });
    expect(stateHash(r.host.sim!.state)).toBe(h);
  });
});

describe('review: import robustness', () => {
  it('pasted text with line breaks and spaces (mail clients wrap long lines) is accepted', async () => {
    const r = makeRig();
    const ex = await r.manager.exportCurrent({ method: 'text' });
    const text = ex.value!.text!;
    const wrapped = text.replace(/(.{76})/g, '$1\r\n  ');
    const p = parseText(`  ${wrapped}\n`);
    expect(p.ok).toBe(true);
  });

  it('bytes with trailing garbage, an empty input and a lone prefix are rejected without throwing', async () => {
    const r = makeRig();
    const ex = await r.manager.exportCurrent({ method: 'bytes' });
    const bytes = ex.value!.bytes!;
    const longer = new Uint8Array(bytes.length + 5);
    longer.set(bytes);
    longer.set([1, 2, 3, 4, 5], bytes.length);
    expect(parseBytes(longer).ok).toBe(false);
    expect(parseBytes(new Uint8Array(0)).ok).toBe(false);
    expect(parseText('').ok).toBe(false);
    expect(parseText('FOUNDRESS1:').ok).toBe(false);
    expect(parseText('FOUNDRESS1::').ok).toBe(false);
    // each single-byte corruption anywhere is rejected (gzip CRC / text checksum), sampled across the file
    for (let i = 0; i < bytes.length; i += Math.max(1, Math.floor(bytes.length / 40))) {
      const c = bytes.slice();
      c[i] ^= 0x5a;
      const res = parseBytes(c);
      expect(res.ok, `byte ${i}`).toBe(false);
      expect(parseText(bytesToText(bytes).replace(/:[0-9a-f]{8}$/, `:${'0'.repeat(8)}`)).ok).toBe(false);
    }
  });
});

describe('review: metadata', () => {
  it('seed codes cover the whole uint32 range', () => {
    expect(seedCodeOf(0)).toBe('0000-0000');
    expect(seedCodeOf(0xffffffff)).toBe('FFFF-FFFF');
    expect(seedCodeOf(-1)).toBe('FFFF-FFFF');
    expect(seedCodeOf(0x4f7a21c9)).toBe('4F7A-21C9');
  });
});
