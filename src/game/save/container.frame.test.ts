// The gzip frame of an exported save: any single-byte change or trailing byte is rejected, and a save written by the
// build before the frame was sealed still opens (see gzipFrame.ts for what can and cannot be checked on those).
import { describe, expect, it } from 'vitest';
import { gzip } from '@/core/serialize';
import { bytesToText, packContainer, parseBytes, parseText } from './container';
import { LEGACY_SAVE_TEXT } from './fixtures/legacySave.fixture';
import { makeRig } from './testkit';

async function exported(): Promise<Uint8Array> {
  const r = makeRig();
  const ex = await r.manager.exportCurrent({ method: 'bytes' });
  return ex.value!.bytes!;
}

describe('sealed save frame', () => {
  it('rejects every single-byte change, at every position, and any trailing bytes', async () => {
    const bytes = await exported();
    expect(parseBytes(bytes).ok).toBe(true);
    const survivors: string[] = [];
    for (let i = 0; i < bytes.length; i++) {
      for (const mask of [0x01, 0xff]) {
        const c = bytes.slice();
        c[i] ^= mask;
        if (parseBytes(c).ok) survivors.push(`${i}^${mask}`);
      }
    }
    expect(survivors).toEqual([]);
    for (const extra of [[0], [1, 2, 3, 4, 5], [0x1f, 0x8b]]) {
      const longer = new Uint8Array(bytes.length + extra.length);
      longer.set(bytes);
      longer.set(extra, bytes.length);
      expect(parseBytes(longer).ok, `+${extra.length}`).toBe(false);
    }
    expect(parseBytes(bytes.subarray(0, bytes.length - 1)).ok).toBe(false);
  });

  it('is reproducible: the same save packs to the same bytes (no wall-clock time in the header)', async () => {
    const r = makeRig();
    const a = r.manager.exportCurrent({ method: 'bytes' });
    const first = (await a).value!.bytes!;
    expect(Array.from(first.slice(4, 8))).toEqual([0, 0, 0, 0]);
    const parsed = parseBytes(first);
    if (!parsed.ok) throw new Error(parsed.message);
    expect(packContainer(parsed.meta, parsed.state)).toEqual(first);
  });
});

describe('saves written before the frame was sealed', () => {
  it('still open, by file bytes and by pasted text, and keep their wall-clock header time', () => {
    const viaText = parseText(LEGACY_SAVE_TEXT);
    // if the simulation ever raises its minimum save version this fixture becomes 'too-old': the container still reads it
    expect(viaText.ok || (!viaText.ok && viaText.code === 'too-old')).toBe(true);
    const bytes = Uint8Array.from(atob(LEGACY_SAVE_TEXT.slice('FOUNDRESS1:'.length).split(':')[0]), (c) => c.charCodeAt(0));
    expect(bytes[3]).toBe(0); // plain header, no extra field
    expect(bytes[4] | bytes[5] | bytes[6] | bytes[7]).not.toBe(0); // fflate wrote the wall clock
    const viaBytes = parseBytes(bytes);
    expect(viaBytes.ok === viaText.ok).toBe(true);
  });

  it('still reject damage that the old checks caught, and the header bytes and trailer length the old code ignored', () => {
    const bytes = Uint8Array.from(atob(LEGACY_SAVE_TEXT.slice('FOUNDRESS1:'.length).split(':')[0]), (c) => c.charCodeAt(0));
    const flip = (i: number) => { const c = bytes.slice(); c[i] ^= 0x01; return parseBytes(c).ok; };
    for (const i of [0, 1, 2, 3, 8, 9, 20, 5000, bytes.length - 8, bytes.length - 4, bytes.length - 1]) expect(flip(i), `byte ${i}`).toBe(false);
  });

  it('a gzip of foreign data is still refused', () => {
    expect(parseBytes(gzip(new TextEncoder().encode('not a save, just some text to pack'))).ok).toBe(false);
  });
});

describe('text form', () => {
  it('carries the sealed bytes and rejects a wrong checksum', async () => {
    const bytes = await exported();
    const text = bytesToText(bytes);
    expect(parseText(text).ok).toBe(true);
    expect(parseText(text.replace(/:[0-9a-f]{8}$/, ':00000000')).ok).toBe(false);
  });
});
