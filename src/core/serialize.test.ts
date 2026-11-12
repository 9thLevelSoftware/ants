import { describe, expect, it } from 'vitest';
import { decode, decodeFromText, encode, encodeToText, fromBase64, gunzip, gzip, toBase64 } from './serialize';

const roundTrip = (v: unknown) => decode(encode(v));

describe('serialize encode/decode', () => {
  it('round-trips JSON-like scalars, strings, arrays and objects', () => {
    const value = {
      a: null, t: true, f: false, zero: 0, int: 42, neg: -17, big: 2 ** 52, bigNeg: -(2 ** 52), huge: 2 ** 60,
      max: Number.MAX_SAFE_INTEGER, frac: 0.1, tiny: 5e-324, s: '', list: [1, 'two', [3, [4]], { five: 5 }],
      nested: { deeper: { deepest: [true, null] } },
    };
    expect(roundTrip(value)).toEqual(value);
    for (const v of [null, true, 0, -1, 3.25, 'x', [], {}]) expect(roundTrip(v)).toEqual(v);
  });

  it('preserves -0', () => {
    const out = roundTrip({ z: -0, arr: [-0, 0] }) as { z: number; arr: number[] };
    expect(Object.is(out.z, -0)).toBe(true);
    expect(Object.is(out.arr[0], -0)).toBe(true);
    expect(Object.is(out.arr[1], 0)).toBe(true);
  });

  it('round-trips unicode strings, including astral characters and keys', () => {
    const value = { 'clé': 'Fourmi 🐜 – 蟻 – ñ', '': 'empty key', '🍯': ['é', '\u0000', 'line\nbreak'] };
    expect(roundTrip(value)).toEqual(value);
  });

  it('preserves typed arrays of every kind at any depth, with exact type and contents', () => {
    const value = {
      i8: new Int8Array([-128, 0, 127]),
      u8: new Uint8Array([0, 255]),
      u8c: new Uint8ClampedArray([1, 2, 3]),
      i16: new Int16Array([-32768, 32767]),
      u16: new Uint16Array([65535]),
      i32: new Int32Array([-(2 ** 31), 2 ** 31 - 1]),
      u32: new Uint32Array([2 ** 32 - 1]),
      f32: new Float32Array([1.5, -0, Number.NaN, Infinity]),
      f64: new Float64Array([Math.PI, -1e300]),
      deep: [{ chunks: [new Uint8Array(4096).fill(7), { grid: new Float32Array([0.1, 0.2]) }] }],
      empty: new Float64Array(0),
    };
    const out = roundTrip(value) as typeof value;
    for (const key of Object.keys(value) as (keyof typeof value)[]) {
      if (key === 'deep') continue;
      expect(out[key].constructor).toBe(value[key].constructor);
      expect(Array.from(out[key] as ArrayLike<number>)).toEqual(Array.from(value[key] as ArrayLike<number>));
    }
    expect(Object.is(out.f32[1], -0)).toBe(true);
    expect(Number.isNaN(out.f32[2])).toBe(true); // raw bits copied, not inspected
    const deep = out.deep[0].chunks as [Uint8Array, { grid: Float32Array }];
    expect(deep[0]).toBeInstanceOf(Uint8Array);
    expect(deep[0].length).toBe(4096);
    expect(deep[1].grid).toBeInstanceOf(Float32Array);
    expect(deep[1].grid[1]).toBe(Math.fround(0.2));
  });

  it('encodes typed-array views (subarray) without leaking the rest of the buffer', () => {
    const base = new Int16Array([1, 2, 3, 4, 5, 6]);
    const view = base.subarray(2, 4);
    const out = roundTrip(view) as Int16Array;
    expect(Array.from(out)).toEqual([3, 4]);
    expect(out.buffer.byteLength).toBe(4);
  });

  it('handles large values (1M-element arrays, long strings) quickly', () => {
    const big = new Float32Array(1_000_000);
    for (let i = 0; i < big.length; i++) big[i] = i * 0.5;
    const plain = Array.from({ length: 100_000 }, (_, i) => i - 50_000);
    const long = 'ant'.repeat(200_000);
    const out = roundTrip({ big, plain, long }) as { big: Float32Array; plain: number[]; long: string };
    expect(out.big[999_999]).toBe(499_999.5);
    expect(out.plain).toEqual(plain);
    expect(out.long.length).toBe(600_000);
  });

  it('policy: rejects NaN / Infinity numbers with the path of the offending value', () => {
    expect(() => encode({ ants: [{ pos: { x: 1 } }, { pos: { x: Number.NaN } }] })).toThrow('$.ants[1].pos.x');
    expect(() => encode([Infinity])).toThrow(/non-finite/);
    expect(() => encode({ 'odd key': -Infinity })).toThrow('$["odd key"]');
  });

  it('policy: omits undefined object properties, rejects undefined/holes in arrays', () => {
    expect(roundTrip({ a: 1, b: undefined })).toEqual({ a: 1 });
    expect(Object.keys(roundTrip({ a: undefined }) as object)).toEqual([]);
    expect(() => encode([1, undefined])).toThrow('$[1]');
    expect(() => encode([1, , 3])).toThrow(/hole/);
  });

  it('policy: rejects functions, bigint, symbols, Map/Set/Date/class instances, ArrayBuffer and cycles', () => {
    class Thing { x = 1 }
    const cyc: Record<string, unknown> = { a: 1 };
    cyc.self = cyc;
    for (const bad of [() => 1, 10n, Symbol('s'), new Map(), new Set(), new Date(0), new Thing(), new ArrayBuffer(4), new DataView(new ArrayBuffer(2)), cyc]) {
      expect(() => encode({ v: bad })).toThrow(/serialize\.encode/);
    }
    // shared (non-cyclic) references are fine: they are simply written twice
    const shared = { k: 1 };
    expect(roundTrip([shared, shared])).toEqual([{ k: 1 }, { k: 1 }]);
    expect(roundTrip(Object.create(null))).toEqual({});
  });

  it('decodes "__proto__" keys as own data properties, never as a prototype change', () => {
    const src = JSON.parse('{"__proto__": {"polluted": true}, "ok": 1}');
    const out = roundTrip(src) as Record<string, unknown>;
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect((out as { polluted?: boolean }).polluted).toBeUndefined();
    expect(Object.keys(out)).toEqual(['__proto__', 'ok']);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('decode rejects bad magic, unknown versions, truncation and trailing bytes', () => {
    const good = encode({ a: [1, 2, 3], s: 'text' });
    expect(() => decode(new Uint8Array([1, 2, 3, 4]))).toThrow(/magic/);
    const v2 = good.slice();
    v2[3] = 99;
    expect(() => decode(v2)).toThrow(/version/);
    for (let cut = 4; cut < good.length; cut++) expect(() => decode(good.subarray(0, cut))).toThrow();
    const longer = new Uint8Array(good.length + 1);
    longer.set(good);
    expect(() => decode(longer)).toThrow(/trailing/);
    expect(() => decode(new Uint8Array([0x46, 0x44, 0x53, 1, 250]))).toThrow(/unknown tag/);
  });

  it('decodes from an unaligned view into a larger buffer', () => {
    const enc = encode({ f: new Float64Array([1.25, 2.5]) });
    const host = new Uint8Array(enc.length + 3);
    host.set(enc, 3);
    const out = decode(host.subarray(3)) as { f: Float64Array };
    expect(Array.from(out.f)).toEqual([1.25, 2.5]);
  });
});

describe('gzip and base64', () => {
  it('gzip / gunzip round-trip and actually compress repetitive data', () => {
    const data = encode({ chunks: Array.from({ length: 50 }, () => new Uint8Array(4096).fill(255)) });
    const z = gzip(data);
    expect(z.length).toBeLessThan(data.length / 20);
    expect(gunzip(z)).toEqual(data);
    expect(gunzip(gzip(new Uint8Array(0)))).toEqual(new Uint8Array(0));
  });

  it('base64 round-trips every length and byte value and matches the standard encoding', () => {
    for (let n = 0; n < 40; n++) {
      const bytes = new Uint8Array(n);
      for (let i = 0; i < n; i++) bytes[i] = (i * 73 + n * 11) & 255;
      expect(fromBase64(toBase64(bytes))).toEqual(bytes);
    }
    const all = new Uint8Array(256).map((_, i) => i);
    expect(fromBase64(toBase64(all))).toEqual(all);
    const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
    expect(toBase64(ascii('foobar'))).toBe('Zm9vYmFy');
    expect(toBase64(ascii('fooba'))).toBe('Zm9vYmE=');
    expect(toBase64(ascii('foob'))).toBe('Zm9vYg==');
    expect(toBase64(ascii('ant colony'))).toBe(btoa('ant colony'));
  });

  it('fromBase64 ignores whitespace from copy/paste and rejects invalid text', () => {
    expect(fromBase64(' Zm9v\nYmFy\r\n')).toEqual(new Uint8Array([102, 111, 111, 98, 97, 114]));
    expect(() => fromBase64('Zm9v!mFy')).toThrow(/invalid character/);
    expect(() => fromBase64('Zm9')).toThrow(/multiple of 4/);
    expect(() => fromBase64('Zm=v')).toThrow(/invalid character/);
  });

  it('encodeToText / decodeFromText round-trip a save-like value through one line of text', () => {
    const save = { meta: { version: 1, name: 'Colonia' }, state: { tick: 1234, carve: [new Uint8Array(4096).fill(3)] } };
    const text = encodeToText(save);
    expect(/^[A-Za-z0-9+/=]+$/.test(text)).toBe(true);
    const back = decodeFromText(text) as typeof save;
    expect(back.meta).toEqual(save.meta);
    expect(back.state.carve[0]).toEqual(save.state.carve[0]);
  });
});
