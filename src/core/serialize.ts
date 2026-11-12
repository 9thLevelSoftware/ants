// Binary encoding of JSON-like values that may contain typed arrays at any depth (save files, export/import).
//
// Supported: null, booleans, finite numbers (incl. -0), strings, arrays, plain objects, and typed arrays
// (Int8/Uint8/Uint8Clamped/Int16/Uint16/Int32/Uint32/Float32/Float64Array; the exact type is preserved and the
// contents are copied bit-exactly, including any NaN inside float arrays).
//
// Policy (encode throws an Error naming the path, e.g. "$.ants[3].pos.x", for anything else):
//  - NaN and +-Infinity as plain numbers are REJECTED: they mean a bug upstream, and saves must stay JSON-able.
//  - undefined as an object property value is OMITTED (JSON semantics, so optional fields round-trip as missing);
//    undefined inside an array (or a hole) is rejected.
//  - functions, symbols, bigint, Map, Set, Date, class instances, ArrayBuffer/DataView and cycles are rejected.
//  - strings are UTF-8; lone surrogates are replaced by U+FFFD (TextEncoder behaviour).
// Typed arrays are written in the host byte order, which is little-endian on every supported platform
// (checked at load; a big-endian host throws instead of producing corrupt saves).
//
// Format: "FDS" + version byte, then one tagged value. Integers |n| <= 2^52 use zigzag LEB128 varints.

import { gunzipSync, gzipSync } from 'fflate';

const MAGIC0 = 0x46, MAGIC1 = 0x44, MAGIC2 = 0x53; // "FDS"
const FORMAT_VERSION = 1;
const MAX_VARINT_INT = 2 ** 52;
const INITIAL_BUFFER = 1 << 16;

/** Value tags (one byte each). */
const Tag = {
  Null: 0,
  False: 1,
  True: 2,
  Int: 3,
  F64: 4,
  Str: 5,
  Arr: 6,
  Obj: 7,
  Typed: 8,
} as const;

type TypedArray =
  | Int8Array | Uint8Array | Uint8ClampedArray | Int16Array | Uint16Array
  | Int32Array | Uint32Array | Float32Array | Float64Array;

type TypedCtor = { new (buffer: ArrayBuffer, byteOffset?: number, length?: number): TypedArray; BYTES_PER_ELEMENT: number };

const TYPED_CTORS: TypedCtor[] = [
  Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array,
];

const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

class Writer {
  buf = new Uint8Array(INITIAL_BUFFER);
  view = new DataView(this.buf.buffer);
  pos = 0;

  ensure(n: number): void {
    if (this.pos + n <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while (cap < this.pos + n) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.buf.subarray(0, this.pos));
    this.buf = next;
    this.view = new DataView(next.buffer);
  }
  byte(b: number): void {
    this.ensure(1);
    this.buf[this.pos++] = b;
  }
  /** Unsigned LEB128 for non-negative integers up to 2^53 (arithmetic, not 32-bit ops). */
  varuint(n: number): void {
    this.ensure(8);
    while (n >= 128) {
      this.buf[this.pos++] = (n % 128) | 128;
      n = Math.floor(n / 128);
    }
    this.buf[this.pos++] = n;
  }
  f64(x: number): void {
    this.ensure(8);
    this.view.setFloat64(this.pos, x, true);
    this.pos += 8;
  }
  bytes(src: Uint8Array): void {
    this.ensure(src.length);
    this.buf.set(src, this.pos);
    this.pos += src.length;
  }
}

function pathString(path: (string | number)[]): string {
  let s = '$';
  for (const p of path) s += typeof p === 'number' ? `[${p}]` : /^[A-Za-z_$][\w$]*$/.test(p) ? `.${p}` : `[${JSON.stringify(p)}]`;
  return s;
}

function typedIndex(v: object): number {
  for (let i = 0; i < TYPED_CTORS.length; i++) if (v instanceof TYPED_CTORS[i]) return i;
  return -1;
}

function isPlainObject(v: object): boolean {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** Encodes a JSON-like value (see header for the policy). */
export function encode(value: unknown): Uint8Array {
  if (!LITTLE_ENDIAN) throw new Error('serialize: big-endian hosts are not supported');
  const w = new Writer();
  w.byte(MAGIC0);
  w.byte(MAGIC1);
  w.byte(MAGIC2);
  w.byte(FORMAT_VERSION);
  const path: (string | number)[] = [];
  const ancestors: object[] = [];

  const fail = (why: string): never => {
    throw new Error(`serialize.encode: ${why} at ${pathString(path)}`);
  };

  const writeString = (s: string) => {
    const b = textEncoder.encode(s);
    w.varuint(b.length);
    w.bytes(b);
  };

  const writeValue = (v: unknown): void => {
    if (v === null) return w.byte(Tag.Null);
    switch (typeof v) {
      case 'boolean':
        return w.byte(v ? Tag.True : Tag.False);
      case 'number':
        if (!Number.isFinite(v)) return fail(`non-finite number ${v}`);
        if (Number.isInteger(v) && Math.abs(v) <= MAX_VARINT_INT && !Object.is(v, -0)) {
          w.byte(Tag.Int);
          return w.varuint(v >= 0 ? v * 2 : -v * 2 - 1); // zigzag
        }
        w.byte(Tag.F64);
        return w.f64(v);
      case 'string':
        w.byte(Tag.Str);
        return writeString(v);
      case 'object':
        break;
      default:
        return fail(`unsupported ${typeof v}`);
    }
    const obj = v as object;
    if (ancestors.includes(obj)) return fail('cycle');
    const ti = typedIndex(obj);
    if (ti >= 0) {
      const ta = obj as TypedArray;
      w.byte(Tag.Typed);
      w.byte(ti);
      w.varuint(ta.length);
      w.bytes(new Uint8Array(ta.buffer, ta.byteOffset, ta.byteLength));
      return;
    }
    ancestors.push(obj);
    if (Array.isArray(obj)) {
      w.byte(Tag.Arr);
      w.varuint(obj.length);
      for (let i = 0; i < obj.length; i++) {
        path.push(i);
        if (obj[i] === undefined) fail('undefined (or hole) in array');
        writeValue(obj[i]);
        path.pop();
      }
    } else {
      if (!isPlainObject(obj)) fail(`unsupported object ${Object.prototype.toString.call(obj)}`);
      const rec = obj as Record<string, unknown>;
      const keys = Object.keys(rec).filter((k) => rec[k] !== undefined);
      w.byte(Tag.Obj);
      w.varuint(keys.length);
      for (const k of keys) {
        path.push(k);
        writeString(k);
        writeValue(rec[k]);
        path.pop();
      }
    }
    ancestors.pop();
  };

  writeValue(value);
  return w.buf.slice(0, w.pos);
}

/** Decodes bytes produced by encode(). Throws on bad magic, unknown version, truncation or trailing bytes. */
export function decode(bytes: Uint8Array): unknown {
  if (!LITTLE_ENDIAN) throw new Error('serialize: big-endian hosts are not supported');
  let pos = 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fail = (why: string): never => {
    throw new Error(`serialize.decode: ${why} at byte ${pos}`);
  };
  const need = (n: number) => {
    if (pos + n > bytes.length) fail('truncated data');
  };
  const byte = () => {
    need(1);
    return bytes[pos++];
  };
  const varuint = (): number => {
    let n = 0, mul = 1;
    for (;;) {
      const b = byte();
      n += (b & 127) * mul;
      if (b < 128) return n;
      mul *= 128;
      if (mul > 2 ** 56) fail('varint too long');
    }
  };
  const readString = (): string => {
    const len = varuint();
    need(len);
    const s = textDecoder.decode(bytes.subarray(pos, pos + len));
    pos += len;
    return s;
  };

  const readValue = (): unknown => {
    const tag = byte();
    switch (tag) {
      case Tag.Null: return null;
      case Tag.False: return false;
      case Tag.True: return true;
      case Tag.Int: {
        const z = varuint();
        return z % 2 === 0 ? z / 2 : -(z + 1) / 2;
      }
      case Tag.F64: {
        need(8);
        const x = view.getFloat64(pos, true);
        pos += 8;
        return x;
      }
      case Tag.Str: return readString();
      case Tag.Arr: {
        const n = varuint();
        if (n > bytes.length - pos) fail('array length exceeds data');
        const arr: unknown[] = new Array(n);
        for (let i = 0; i < n; i++) arr[i] = readValue();
        return arr;
      }
      case Tag.Obj: {
        const n = varuint();
        const obj: Record<string, unknown> = {};
        for (let i = 0; i < n; i++) {
          const k = readString();
          const v = readValue();
          // Plain assignment of "__proto__" would change the prototype instead of creating a property.
          if (k === '__proto__') Object.defineProperty(obj, k, { value: v, enumerable: true, writable: true, configurable: true });
          else obj[k] = v;
        }
        return obj;
      }
      case Tag.Typed: {
        const ti = byte();
        const Ctor = TYPED_CTORS[ti];
        if (!Ctor) fail(`unknown typed array kind ${ti}`);
        const len = varuint();
        const byteLen = len * Ctor.BYTES_PER_ELEMENT;
        need(byteLen);
        const copy = bytes.slice(pos, pos + byteLen); // fresh, aligned buffer
        pos += byteLen;
        return new Ctor(copy.buffer, 0, len);
      }
      default:
        return fail(`unknown tag ${tag}`);
    }
  };

  if (bytes.length < 4 || bytes[0] !== MAGIC0 || bytes[1] !== MAGIC1 || bytes[2] !== MAGIC2) fail('not a FOUNDRESS data block (bad magic)');
  pos = 3;
  const version = byte();
  if (version !== FORMAT_VERSION) fail(`unsupported format version ${version}`);
  const value = readValue();
  if (pos !== bytes.length) fail('trailing bytes');
  return value;
}

/** gzip (level 0-9, default 6). */
export function gzip(bytes: Uint8Array, level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 = 6): Uint8Array {
  return gzipSync(bytes, { level });
}

export function gunzip(bytes: Uint8Array): Uint8Array {
  return gunzipSync(bytes);
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

/** Standard base64 (RFC 4648, with '=' padding). */
export function toBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  const CHUNK = 3 * 4096; // build in chunks to avoid huge intermediate strings from concatenation
  for (let start = 0; start < bytes.length; start += CHUNK) {
    const end = Math.min(start + CHUNK, bytes.length);
    let s = '';
    for (let i = start; i < end; i += 3) {
      const b0 = bytes[i], b1 = i + 1 < end ? bytes[i + 1] : 0, b2 = i + 2 < end ? bytes[i + 2] : 0;
      const n = (b0 << 16) | (b1 << 8) | b2;
      s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
      s += i + 1 < end ? B64[(n >> 6) & 63] : '=';
      s += i + 2 < end ? B64[n & 63] : '=';
    }
    parts.push(s);
  }
  return parts.join('');
}

/** Decodes base64; whitespace (line breaks from copy/paste) is ignored. Throws on any other invalid character. */
export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/\s+/g, '');
  if (clean.length % 4 !== 0) throw new Error('fromBase64: length is not a multiple of 4');
  let pad = 0;
  if (clean.endsWith('==')) pad = 2;
  else if (clean.endsWith('=')) pad = 1;
  const out = new Uint8Array((clean.length / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    let n = 0;
    for (let k = 0; k < 4; k++) {
      const c = clean.charCodeAt(i + k);
      const isPad = c === 61 && i + k >= clean.length - pad; // '=' only allowed in the padding positions
      const v = isPad ? 0 : c < 128 ? B64_LOOKUP[c] : -1;
      if (v < 0) throw new Error(`fromBase64: invalid character at ${i + k}`);
      n = (n << 6) | v;
    }
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

/** encode + gzip + base64: one copy/paste-able line of text (save fallback when downloads are blocked). */
export function encodeToText(value: unknown): string {
  return toBase64(gzip(encode(value)));
}

/** Inverse of encodeToText. */
export function decodeFromText(text: string): unknown {
  return decode(gunzip(fromBase64(text)));
}
