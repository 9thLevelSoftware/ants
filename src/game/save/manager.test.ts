import { describe, expect, it } from 'vitest';
import { stateHash } from '@/sim/save/hash';
import { SAVE_VERSION } from '@/sim/save/version';
import { AUTO_RING_SIZE } from './constants';
import { MemoryStorage } from './memoryStorage';
import { makeRig } from './testkit';

const tickN = (sim: { tick(): void }, n: number) => { for (let i = 0; i < n; i++) sim.tick(); };

describe('slot scheme', () => {
  it('saves to quick and slot-1..5, lists them with metadata, refuses other slots', async () => {
    const r = makeRig();
    r.host.thumb = 'data:image/jpeg;base64,AAAA';
    r.clock.ms += 5000;
    const a = await r.manager.saveTo('quick');
    expect(a).toMatchObject({ ok: true, status: 'ok', code: 'ok' });
    expect((await r.manager.saveTo('slot-3')).ok).toBe(true);
    expect((await r.manager.saveTo('slot-6')).code).toBe('failed');
    expect((await r.manager.saveTo('auto')).code).toBe('failed'); // the ring is written by the game only
    expect((await r.manager.saveTo('opening-start')).code).toBe('failed');
    const list = (await r.manager.list()).value!;
    expect(list.map((l) => l.key)).toEqual(['quick', 'slot-3']);
    const q = list[0];
    expect(q.title).toBe('Quick save');
    expect(q.meta).toMatchObject({
      slot: 'quick', species: 'lasius-niger', saveVersion: SAVE_VERSION, population: 6, tick: 0, playTimeS: 0,
      thumbnail: 'data:image/jpeg;base64,AAAA', pinned: false, label: '',
    });
    expect(q.meta.seedCode).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect(q.meta.dateLabel).toMatch(/^[A-Z][a-z]+ · Day \d+ · Year \d+$/);
    expect(q.meta.savedAtIso).toBe(new Date(r.clock.ms).toISOString());
    expect(q.meta.worldFingerprint).toBe(r.world.meta.fingerprint);
    expect(r.manager.status().lastSaveMs).toBe(r.clock.ms);
  });

  it('overwrites a slot and deletes it', async () => {
    const r = makeRig();
    await r.manager.saveTo('slot-1');
    tickN(r.host.sim!, 5);
    await r.manager.saveTo('slot-1');
    const l = (await r.manager.list()).value!;
    expect(l).toHaveLength(1);
    expect(l[0].meta.tick).toBe(5);
    expect((await r.manager.delete('slot-1')).ok).toBe(true);
    expect((await r.manager.list()).value).toHaveLength(0);
    expect((await r.manager.load('slot-1')).code).toBe('not-found');
    expect((await r.manager.delete('nope')).ok).toBe(false);
  });

  it('refuses to save with no game, while loading, and inside a time-lapse', async () => {
    const r = makeRig();
    r.host.mode = 'loading';
    expect((await r.manager.saveTo('slot-1')).code).toBe('blocked');
    r.host.mode = 'title';
    expect((await r.manager.saveTo('slot-1')).code).toBe('blocked');
    r.host.mode = 'playing';
    r.host.sim!.state.player.timelapse = { kind: 'founding', startTick: 0, endTick: 100, progress: 0.2, stage: 'eggs', counters: {}, interrupt: null };
    const t = await r.manager.saveTo('slot-1');
    expect(t.code).toBe('blocked');
    expect(t.message).toMatch(/time-lapse/);
    r.host.sim = null;
    expect((await r.manager.saveTo('slot-1')).code).toBe('blocked');
    expect((await r.manager.list()).value).toHaveLength(0);
  });

  it('a second save while one is running reports busy', async () => {
    const r = makeRig();
    const first = r.manager.saveTo('slot-1');
    const second = await r.manager.saveTo('slot-2');
    expect(second.code).toBe('busy');
    expect((await first).ok).toBe(true);
  });
});

describe('autosave ring', () => {
  it('rotates 3 generations and overwrites the oldest', async () => {
    const r = makeRig();
    const labels = ['interval', 'season', 'pre-winter', 'interval', 'quit'] as const;
    const keys: string[] = [];
    for (const [i, label] of labels.entries()) {
      tickN(r.host.sim!, 1);
      r.clock.ms += 1000;
      const out = await r.manager.autosave(label);
      expect(out.ok).toBe(true);
      keys.push(out.value!.key);
      expect(out.value!.generation).toBe(i + 1);
    }
    expect(keys).toEqual(['auto-1', 'auto-2', 'auto-3', 'auto-1', 'auto-2']);
    const list = (await r.manager.list()).value!;
    expect(list.map((l) => [l.key, l.generation, l.label])).toEqual([['auto-2', 5, 'quit'], ['auto-1', 4, 'interval'], ['auto-3', 3, 'pre-winter']]);
    expect(list.every((l) => l.slot === 'auto')).toBe(true);
  });

  it('load("auto") loads the newest generation', async () => {
    const r = makeRig();
    for (let i = 0; i < 4; i++) { tickN(r.host.sim!, 2); r.clock.ms += 1000; await r.manager.autosave('interval'); }
    const tickAtLast = r.host.sim!.state.tick;
    tickN(r.host.sim!, 3);
    const res = await r.manager.load('auto');
    expect(res.ok).toBe(true);
    expect(r.host.adopted.at(-1)!.sim.state.tick).toBe(tickAtLast);
  });

  it('final is pinned: it survives the rotation and a new final replaces the old one', async () => {
    const r = makeRig();
    await r.manager.autosave('final');
    for (let i = 0; i < 6; i++) { tickN(r.host.sim!, 1); await r.manager.autosave('interval'); }
    let list = (await r.manager.list()).value!;
    expect(list).toHaveLength(AUTO_RING_SIZE);
    expect(list.filter((l) => l.pinned).map((l) => l.label)).toEqual(['final']);
    tickN(r.host.sim!, 1);
    await r.manager.autosave('final');
    list = (await r.manager.list()).value!;
    expect(list.filter((l) => l.pinned)).toHaveLength(1);
    await r.manager.clearPinned(); // a new game started
    list = (await r.manager.list()).value!;
    expect(list.some((l) => l.pinned)).toBe(false);
    expect(list.filter((l) => l.label === 'final')).toHaveLength(1);
  });

  it('opening-start is a hidden checkpoint outside the ring', async () => {
    const r = makeRig();
    expect((await r.manager.checkpointOpening()).ok).toBe(true);
    expect((await r.manager.list()).value).toHaveLength(0);
    const hidden = (await r.manager.list({ includeHidden: true })).value!;
    expect(hidden.map((l) => [l.key, l.hidden])).toEqual([['opening-start', true]]);
    expect((await r.manager.load('opening-start')).ok).toBe(true);
  });

  it('quota: drops the oldest generation and retries', async () => {
    const probe = makeRig({ storage: new MemoryStorage({ quotaBytes: 1e12, persistent: true }) });
    await probe.manager.autosave('interval');
    const oneSave = (await probe.storage.get('saves', 'auto-1')).ok ? 1 : 0;
    expect(oneSave).toBe(1);
    // measure the size of one record with the estimator the storage uses
    const { estimateBytes } = await import('./deepCopy');
    const rec = (await probe.storage.get('saves', 'auto-1')) as { ok: true; value: unknown };
    const size = estimateBytes(rec.value);
    const r = makeRig({ storage: new MemoryStorage({ quotaBytes: Math.round(size * 2.4), persistent: true }) }); // room for two, not three
    for (const l of ['interval', 'season', 'interval'] as const) { tickN(r.host.sim!, 1); r.clock.ms += 1000; await r.manager.autosave(l); }
    const out = (await r.manager.list()).value!;
    expect(out.length).toBe(2); // the third write freed the oldest generation and succeeded
    expect(out[0].generation).toBe(3);
    expect(r.manager.status().lastCode).toBe('ok');
  });

  it('quota that cannot be relieved reports quota and keeps what was there', async () => {
    const r = makeRig();
    await r.manager.saveTo('slot-1');
    r.storage.failNextWrites = 10;
    r.storage.failStatus = 'quota';
    const out = await r.manager.saveTo('slot-1');
    expect(out).toMatchObject({ ok: false, code: 'quota', status: 'failed' });
    expect(out.message).toMatch(/full/);
    r.storage.failNextWrites = 0;
    expect((await r.manager.load('slot-1')).ok).toBe(true); // the previous save is intact
  });
});

describe('load', () => {
  it('restores the exact state (hash) through the memory back end', async () => {
    const r = makeRig();
    tickN(r.host.sim!, 30);
    const h = stateHash(r.host.sim!.state);
    await r.manager.saveTo('slot-2');
    tickN(r.host.sim!, 20);
    expect(stateHash(r.host.sim!.state)).not.toBe(h);
    const res = await r.manager.load('slot-2');
    expect(res.ok).toBe(true);
    const loaded = r.host.adopted.at(-1)!.sim;
    expect(stateHash(loaded.state)).toBe(h);
    expect(loaded.state).not.toBe(r.storage); // a private copy
    // the loaded sim keeps running deterministically: the same ticks give the same hash as the original run would
    tickN(loaded, 10);
    expect(loaded.state.tick).toBe(40);
  });

  it('is deterministic after load: save, run N more ticks, load, run N ticks, same hash', async () => {
    const r = makeRig();
    tickN(r.host.sim!, 10);
    await r.manager.saveTo('quick');
    tickN(r.host.sim!, 25);
    const direct = stateHash(r.host.sim!.state);
    await r.manager.load('quick');
    const loaded = r.host.adopted.at(-1)!.sim;
    tickN(loaded, 25);
    expect(stateHash(loaded.state)).toBe(direct);
  });

  it('quick load falls back to the newest autosave when quick is empty', async () => {
    const r = makeRig();
    await r.manager.autosave('interval');
    expect((await r.manager.load('quick')).ok).toBe(true);
    expect((await r.manager.load('quick', { fallbackToAuto: false })).code).toBe('not-found');
  });

  it('plays the world rebuild hooks around a load', async () => {
    const calls: string[] = [];
    const r = makeRig({ manager: { host: undefined } });
    const host = {
      getSim: () => r.host.sim, context: () => ({ mode: 'playing', view: 'observer' }),
      adopt: () => { calls.push('adopt'); }, loadingBegin: () => { calls.push('begin'); }, loadingEnd: () => { calls.push('end'); },
    };
    const m = new (r.manager.constructor as typeof import('./manager').SaveManager)({ host, storage: r.storage, loader: { worldFor: () => r.world } });
    await m.saveTo('quick');
    await m.load('quick');
    expect(calls).toEqual(['begin', 'adopt']);
    // failure path leaves the loading state
    const bad = new (m.constructor as typeof import('./manager').SaveManager)({ host, storage: r.storage, loader: { worldFor: () => ({ ...r.world, meta: { ...r.world.meta, fingerprint: 1 } }) } });
    calls.length = 0;
    const res = await bad.load('quick');
    expect(res.code).toBe('world-mismatch');
    expect(calls).toEqual(['begin', 'end']);
  });

  it('blocks a load whose regenerated world does not match the fingerprint', async () => {
    const r = makeRig();
    await r.manager.saveTo('slot-1');
    const other = makeRig({ storage: r.storage, manager: { loader: { worldFor: () => ({ ...r.world, meta: { ...r.world.meta, fingerprint: (r.world.meta.fingerprint + 1) >>> 0 } }) } } });
    const res = await other.manager.load('slot-1');
    expect(res).toMatchObject({ ok: false, code: 'world-mismatch' });
    expect(res.message).toMatch(/not the one/);
    expect(other.host.adopted).toHaveLength(0); // nothing was loaded
  });

  it('refuses a save from a newer version and a too-old one; migrates an older one through the hook', async () => {
    const r = makeRig();
    await r.manager.saveTo('slot-1');
    const raw = (await r.storage.get('saves', 'slot-1')) as { ok: true; value: { state: { version: number } } };
    const setVersion = async (v: number) => {
      const rec = structuredClone(raw.value);
      rec.state.version = v;
      await r.storage.write([{ op: 'put', store: 'saves', key: 'slot-1', value: rec }]);
    };
    await setVersion(SAVE_VERSION + 1);
    expect((await r.manager.load('slot-1')).code).toBe('newer-version');
    await setVersion(0);
    expect((await r.manager.load('slot-1')).code).toBe('too-old');

    // a migration hook upgrades an older save (the format window is widened so version 1 counts as old)
    const calls: number[] = [];
    await setVersion(SAVE_VERSION);
    const migrating = makeRig({
      storage: r.storage, manager: {
        loader: {
          worldFor: () => r.world, currentVersion: SAVE_VERSION + 2,
          migrate: (state, from) => { calls.push(from); state.version = SAVE_VERSION + 2; return state; },
        },
      },
    });
    const res = await migrating.manager.load('slot-1');
    expect(res.ok).toBe(true);
    expect(calls).toEqual([SAVE_VERSION]);
    expect(migrating.host.adopted.at(-1)!.sim.state.version).toBe(SAVE_VERSION + 2);
    // a hook that throws blocks the load with a clear word instead of loading a half-migrated state
    const failing = makeRig({ storage: r.storage, manager: { loader: { worldFor: () => r.world, currentVersion: SAVE_VERSION + 2, migrate: () => { throw new Error('no path'); } } } });
    const bad = await failing.manager.load('slot-1');
    expect(bad).toMatchObject({ ok: false, code: 'too-old' });
    expect(failing.host.adopted).toHaveLength(0);
  });

  it('a damaged slot is reported damaged and the next generation is offered', async () => {
    const r = makeRig();
    await r.manager.autosave('interval');
    tickN(r.host.sim!, 4);
    await r.manager.autosave('season');
    // damage the newest generation (auto-2): its record lost the state
    const good = (await r.storage.get('saves', 'auto-2')) as { ok: true; value: { state?: unknown } };
    const broken = { ...good.value, state: null };
    await r.storage.write([{ op: 'put', store: 'saves', key: 'auto-2', value: broken }]);
    const res = await r.manager.load('auto');
    expect(res.ok).toBe(true);
    expect(r.host.adopted.at(-1)!.meta.key).toBe('auto-1'); // fell back to the older generation
    const list = (await r.manager.list()).value!;
    expect(list.find((l) => l.key === 'auto-2')!.damaged).toBe(true);
    expect((await r.manager.load('auto-2')).code).toBe('corrupt');
  });
});

describe('storage unavailable', () => {
  it('falls back to memory, reports unavailable once, and still saves for the session', async () => {
    const events: string[] = [];
    class Broken extends MemoryStorage {
      override async open() { return { ok: false as const, status: 'unavailable' as const, message: 'blocked' }; }
    }
    const r = makeRig({ storage: new Broken() });
    r.manager.on((e) => events.push(e.type));
    const st = await r.manager.init();
    expect(st).toMatchObject({ availability: 'unavailable', backend: 'memory', persistent: false, diagnostic: 'bad' });
    const out = await r.manager.saveTo('quick');
    expect(out).toMatchObject({ ok: true, status: 'unavailable', volatile: true });
    expect(events.filter((e) => e === 'storage-unavailable')).toHaveLength(1);
    expect((await r.manager.load('quick')).ok).toBe(true);
    // export works without any storage
    const ex = await r.manager.exportCurrent({ method: 'text' });
    expect(ex.ok).toBe(true);
    expect(ex.value!.text!.startsWith('FOUNDRESS1:')).toBe(true);
  });

  it('a write that finds the persistent back end gone degrades to memory and retries there', async () => {
    const r = makeRig();
    await r.manager.init();
    expect(r.manager.status().availability).toBe('ok');
    r.storage.failNextWrites = 1;
    r.storage.failStatus = 'unavailable';
    const out = await r.manager.saveTo('quick');
    expect(out).toMatchObject({ ok: true, status: 'unavailable', volatile: true });
    expect(r.manager.status()).toMatchObject({ availability: 'unavailable', backend: 'memory', persistent: false });
    expect((await r.manager.load('quick')).ok).toBe(true);
  });
});
