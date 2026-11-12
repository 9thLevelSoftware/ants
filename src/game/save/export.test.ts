import { describe, expect, it } from 'vitest';
import { encode, gzip, toBase64 } from '@/core/serialize';
import { stateHash } from '@/sim/save/hash';
import { EXPORT_FORMAT_TAG, EXPORT_TEXT_PREFIX } from './constants';
import { crc32Hex } from './crc32';
import { bytesToText, exportFileName, parseBytes, parseText } from './container';
import { importInto } from './facade';
import { makeRig } from './testkit';

const tickN = (sim: { tick(): void }, n: number) => { for (let i = 0; i < n; i++) sim.tick(); };

describe('export and import', () => {
  it('file round trip: export a slot, import it into another slot, load it: same hash', async () => {
    const r = makeRig();
    tickN(r.host.sim!, 12);
    const h = stateHash(r.host.sim!.state);
    await r.manager.saveTo('slot-1');
    const ex = await r.manager.exportSlot('slot-1', { method: 'bytes' });
    expect(ex.ok).toBe(true);
    const bytes = ex.value!.bytes!;
    expect(bytes[0]).toBe(0x1f); // gzip
    expect(bytes[1]).toBe(0x8b);
    expect(ex.value!.filename).toMatch(/^foundress-lasius-niger-[0-9a-f]{4}-[0-9a-f]{4}-.+\.foundress$/);

    const fresh = makeRig();
    const parsed = fresh.manager.parseImport(bytes);
    expect(parsed.ok).toBe(true);
    expect(parsed.value!.meta.tick).toBe(12);
    const stored = await fresh.manager.importToSlot(parsed.value!, 'slot-4');
    expect(stored.ok).toBe(true);
    expect((await fresh.manager.list()).value!.map((l) => l.key)).toEqual(['slot-4']);
    expect((await fresh.manager.load('slot-4')).ok).toBe(true);
    expect(stateHash(fresh.host.adopted.at(-1)!.sim.state)).toBe(h);
  });

  it('"load now": an import is loaded without being stored', async () => {
    const r = makeRig();
    tickN(r.host.sim!, 7);
    const h = stateHash(r.host.sim!.state);
    const ex = await r.manager.exportCurrent({ method: 'bytes' });
    const fresh = makeRig();
    const res = await importInto(fresh.manager, ex.value!.bytes!, 'now');
    expect(res.ok).toBe(true);
    expect(stateHash(fresh.host.adopted.at(-1)!.sim.state)).toBe(h);
    expect((await fresh.manager.list()).value).toHaveLength(0);
  });

  it('text fallback round trip: FOUNDRESS1: header, base64, checksum', async () => {
    const r = makeRig();
    tickN(r.host.sim!, 9);
    const h = stateHash(r.host.sim!.state);
    const ex = await r.manager.exportCurrent({ method: 'text' });
    expect(ex.ok).toBe(true);
    const text = ex.value!.text!;
    expect(text.startsWith(EXPORT_TEXT_PREFIX)).toBe(true);
    expect(text).toMatch(/^FOUNDRESS1:[A-Za-z0-9+/=]+:[0-9a-f]{8}$/);
    expect(ex.value!.method).toBe('text');
    // line breaks from copy/paste are tolerated
    const wrapped = text.replace(/(.{76})/g, '$1\n');
    const fresh = makeRig();
    const res = await importInto(fresh.manager, wrapped, 'now');
    expect(res.ok).toBe(true);
    expect(stateHash(fresh.host.adopted.at(-1)!.sim.state)).toBe(h);
  });

  it('auto export falls back to text where downloads are blocked (?nodownload=1 or no DOM)', async () => {
    const r = makeRig({ manager: { noDownload: true } });
    const ex = await r.manager.exportCurrent({ method: 'auto' });
    expect(ex.value!.method).toBe('text');
    const r2 = makeRig(); // Node has no document: the download attempt fails and the text form is offered
    expect((await r2.manager.exportCurrent({ method: 'auto' })).value!.method).toBe('text');
  });

  it('export of an empty or damaged slot fails with a word, never throws', async () => {
    const r = makeRig();
    expect((await r.manager.exportSlot('slot-2')).code).toBe('not-found');
    expect((await makeRig().manager.exportCurrent({ method: 'text' })).ok).toBe(true);
    r.host.sim = null;
    expect((await r.manager.exportCurrent()).code).toBe('blocked');
  });

  it('export reports a failure (NaN in the state) instead of throwing', async () => {
    const r = makeRig();
    r.host.sim!.state.ants[0].pos.x = Number.NaN;
    const ex = await r.manager.exportCurrent({ method: 'text' });
    expect(ex).toMatchObject({ ok: false, code: 'failed' });
    expect(ex.message).toMatch(/NaN|non-finite/);
  });
});

describe('corrupt and foreign imports are rejected in plain words', () => {
  const m = () => makeRig().manager;

  it('random bytes and text are foreign', () => {
    expect(m().parseImport(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]))).toMatchObject({ ok: false, code: 'foreign' });
    expect(m().parseImport(new Uint8Array(0))).toMatchObject({ ok: false, code: 'foreign' });
    expect(m().parseImport('hello world')).toMatchObject({ ok: false, code: 'foreign' });
    expect(m().parseImport('')).toMatchObject({ ok: false, code: 'foreign' });
  });

  it('a gzip of something else is foreign', () => {
    const other = gzip(new TextEncoder().encode('{"not":"a save"}'));
    expect(parseBytes(other)).toMatchObject({ ok: false, code: 'foreign' });
    const wrongTag = gzip(encode({ format: 'something-else', formatVersion: 1 }));
    expect(parseBytes(wrongTag)).toMatchObject({ ok: false, code: 'foreign' });
  });

  it('a truncated or bit-flipped file is corrupt', async () => {
    const r = makeRig();
    const bytes = (await r.manager.exportCurrent({ method: 'bytes' })).value!.bytes!;
    const cut = bytes.slice(0, Math.floor(bytes.length / 2));
    expect(parseBytes(cut)).toMatchObject({ ok: false, code: 'corrupt' });
    const flipped = bytes.slice();
    flipped[Math.floor(flipped.length / 2)] ^= 0x55;
    const out = parseBytes(flipped);
    expect(out.ok).toBe(false);
    expect(['corrupt', 'foreign']).toContain((out as { code: string }).code);
    const badCrc = bytes.slice();
    badCrc[badCrc.length - 8] ^= 0xff;
    expect(parseBytes(badCrc)).toMatchObject({ ok: false, code: 'corrupt' });
  });

  it('text with a wrong checksum, bad base64, or a missing part is corrupt', async () => {
    const r = makeRig();
    const text = (await r.manager.exportCurrent({ method: 'text' })).value!.text!;
    const [head, sum] = [text.slice(0, text.lastIndexOf(':')), text.slice(text.lastIndexOf(':') + 1)];
    const wrongSum = `${head}:${sum === '00000000' ? '00000001' : '00000000'}`;
    expect(parseText(wrongSum)).toMatchObject({ ok: false, code: 'corrupt' });
    expect(parseText(`${EXPORT_TEXT_PREFIX}!!!not base64!!!`)).toMatchObject({ ok: false, code: 'corrupt' });
    expect(parseText(EXPORT_TEXT_PREFIX)).toMatchObject({ ok: false, code: 'corrupt' });
    expect(parseText(`${head.slice(0, 200)}:${sum}`)).toMatchObject({ ok: false });
  });

  it('a newer container or save version is refused with the update message', async () => {
    const r = makeRig();
    const sim = r.host.sim!;
    // container version from the future
    const info = await r.manager.saveTo('quick');
    const future = gzip(encode({ format: EXPORT_FORMAT_TAG, formatVersion: 99, meta: info.value, state: sim.state }));
    expect(parseBytes(future)).toMatchObject({ ok: false, code: 'newer-version' });
    expect(parseBytes(future)).toMatchObject({ message: expect.stringContaining('newer version') });
    // sim save version from the future
    const newerState = { ...sim.state, version: 99 };
    const futureState = gzip(encode({ format: EXPORT_FORMAT_TAG, formatVersion: 1, meta: info.value, state: newerState }));
    expect(parseBytes(futureState)).toMatchObject({ ok: false, code: 'newer-version' });
    // missing pieces
    const noMeta = gzip(encode({ format: EXPORT_FORMAT_TAG, formatVersion: 1, state: sim.state }));
    expect(parseBytes(noMeta)).toMatchObject({ ok: false, code: 'corrupt' });
    const noState = gzip(encode({ format: EXPORT_FORMAT_TAG, formatVersion: 1, meta: info.value, state: { version: 1 } }));
    expect(parseBytes(noState)).toMatchObject({ ok: false, code: 'corrupt' });
  });

  it('a failed import changes nothing: no slot written, game not replaced', async () => {
    const r = makeRig();
    const res = await importInto(r.manager, 'FOUNDRESS1:AAAA:00000000', 'slot-1');
    expect(res.ok).toBe(false);
    expect(res.status).toBe('failed');
    expect((await r.manager.list()).value).toHaveLength(0);
    expect(r.host.adopted).toHaveLength(0);
  });

  it('importing into a non-manual slot is refused', async () => {
    const r = makeRig();
    const bytes = (await r.manager.exportCurrent({ method: 'bytes' })).value!.bytes!;
    const parsed = r.manager.parseImport(bytes).value!;
    expect((await r.manager.importToSlot(parsed, 'auto')).ok).toBe(false);
    expect((await r.manager.importToSlot(parsed, 'opening-start')).ok).toBe(false);
  });
});

describe('container helpers', () => {
  it('crc32 matches the standard check value and the text round-trips bytes', () => {
    expect(crc32Hex(new TextEncoder().encode('123456789'))).toBe('cbf43926');
    const bytes = Uint8Array.from({ length: 1000 }, (_, i) => (i * 37) & 255);
    expect(bytesToText(bytes)).toBe(`${EXPORT_TEXT_PREFIX}${toBase64(bytes)}:${crc32Hex(bytes)}`);
  });

  it('file names are safe', () => {
    const meta = { species: 'lasius-niger', seedCode: '4F7A-21C9', dateLabel: 'Summer · Day 5 · Year 2', tick: 5 } as never;
    expect(exportFileName(meta)).toBe('foundress-lasius-niger-4f7a-21c9-summer-day-5-year-2.foundress');
  });
});
