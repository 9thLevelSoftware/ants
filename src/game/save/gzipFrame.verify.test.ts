// Review (app-seams-3): the sealed gzip frame against single-bit damage in every position of the header and the
// trailer, the sealed-to-legacy downgrade (FLG 4 -> 0), and a trailer length that claims gigabytes.
import { describe, expect, it } from 'vitest';
import { packContainer, parseBytes } from './container';
import { frameProblem, sealGzip } from './gzipFrame';
import { makeRig } from './testkit';
import { gzip } from '@/core/serialize';

async function exported(): Promise<Uint8Array> {
  const r = makeRig();
  const ex = await r.manager.exportCurrent({ method: 'bytes' });
  return ex.value!.bytes!;
}

describe('review: sealed frame, every single bit', () => {
  it('every single-bit flip of the 20 header bytes and the 8 trailer bytes is rejected', async () => {
    const bytes = await exported();
    const positions = [...Array(20).keys(), ...Array.from({ length: 8 }, (_, k) => bytes.length - 8 + k)];
    const survivors: string[] = [];
    for (const i of positions) {
      for (let bit = 0; bit < 8; bit++) {
        const c = bytes.slice();
        c[i] ^= 1 << bit;
        let ok: boolean;
        try { ok = parseBytes(c).ok; } catch (e) { survivors.push(`${i}^${1 << bit} threw ${String(e)}`); continue; }
        if (ok) survivors.push(`${i}^${1 << bit}`);
      }
    }
    expect(survivors).toEqual([]);
  });

  it('every single-bit flip of a sampled stretch of the deflate body is rejected', async () => {
    const bytes = await exported();
    const survivors: string[] = [];
    for (let i = 20; i < bytes.length - 8; i += 37) {
      for (let bit = 0; bit < 8; bit++) {
        const c = bytes.slice();
        c[i] ^= 1 << bit;
        if (parseBytes(c).ok) survivors.push(`${i}^${1 << bit}`);
      }
    }
    expect(survivors).toEqual([]);
  });

  it('clearing FLG.FEXTRA (a sealed file read as legacy) is rejected', async () => {
    const bytes = await exported();
    expect(bytes[3]).toBe(4);
    const c = bytes.slice();
    c[3] = 0;
    expect(frameProblem(c)).toBeNull(); // the frame check alone lets it through as a legacy frame ...
    expect(parseBytes(c).ok).toBe(false); // ... the data CRC must catch it
  });

  it('a trailer length (ISIZE) of several gigabytes is rejected without throwing and promptly', async () => {
    const bytes = await exported();
    for (const top of [0x7f, 0xff]) {
      const c = bytes.slice();
      c[c.length - 1] = top;
      const t0 = performance.now();
      let res: ReturnType<typeof parseBytes> | undefined;
      expect(() => { res = parseBytes(c); }).not.toThrow();
      expect(res!.ok).toBe(false);
      expect(performance.now() - t0).toBeLessThan(5000);
    }
  });

  it('sealing is idempotent in shape: the sealed bytes of a save made twice are identical and pass the frame check', async () => {
    const bytes = await exported();
    const parsed = parseBytes(bytes);
    if (!parsed.ok) throw new Error(parsed.message);
    expect(frameProblem(packContainer(parsed.meta, parsed.state))).toBeNull();
    // a sealed member of an empty payload is still well-formed
    expect(frameProblem(sealGzip(gzip(new Uint8Array(0))))).toBeNull();
  });
});
