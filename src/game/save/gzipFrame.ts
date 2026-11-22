// The gzip frame of a `.foundress` file, made tamper-evident.
//
// A gzip member only checksums the uncompressed data (CRC-32 + length in the trailer). Everything else is
// unprotected: the MTIME/XFL/OS header bytes, and the deflate stream itself (a deflate bit flip can decode to the
// same output, e.g. the two spellings of match length 258), so a damaged file could still parse as a valid save.
//
// Saves written from now on ("sealed") are an ordinary gzip member with one FEXTRA subfield `FC` holding the CRC-32
// of the deflate body, a fixed header (MTIME 0, so exports are also reproducible) and the usual trailer. Any
// single-byte change then fails one of: header equality, body CRC, data CRC, data length.
//
// Saves written before this change ("legacy": FLG 0, wall-clock MTIME, no subfield) are still accepted. For those only
// the header's fixed bytes, the data CRC and the data length can be checked; MTIME and the deflate-equivalent bit
// flips cannot, because nothing in the file covers them.
import { crc32 } from './crc32';

const FLG_NONE = 0;
const FLG_EXTRA = 4;
const OS_UNIX = 3;
const EXTRA_BYTES = 8; // subfield: 'F' 'C' len(2) crc(4)
const SEALED_HEADER = 10 + 2 + EXTRA_BYTES;
const TRAILER = 8;
const u32 = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const put32 = (b: Uint8Array, i: number, v: number) => { b[i] = v & 255; b[i + 1] = (v >>> 8) & 255; b[i + 2] = (v >>> 16) & 255; b[i + 3] = v >>> 24; };

/** Rewrites the header of a plain fflate gzip member into the sealed form (the deflate body and trailer are kept). */
export function sealGzip(gz: Uint8Array): Uint8Array {
  const body = gz.subarray(10, gz.length - TRAILER);
  const out = new Uint8Array(SEALED_HEADER + body.length + TRAILER);
  out.set([0x1f, 0x8b, 8, FLG_EXTRA, 0, 0, 0, 0, 0, OS_UNIX, EXTRA_BYTES, 0, 0x46, 0x43, 4, 0]);
  put32(out, 16, crc32(body));
  out.set(body, SEALED_HEADER);
  out.set(gz.subarray(gz.length - TRAILER), SEALED_HEADER + body.length);
  return out;
}

/** Null when the frame is acceptable (before unpacking), else why not. Needs at least 18 bytes. */
export function frameProblem(b: Uint8Array): string | null {
  if (b[2] !== 8 || b[8] !== 0 || b[9] !== OS_UNIX) return 'header';
  if (b[3] === FLG_NONE) return null; // legacy frame: nothing more that can be checked before unpacking
  if (b[3] !== FLG_EXTRA || b.length < SEALED_HEADER + TRAILER) return 'header';
  const fixed = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, EXTRA_BYTES, 0, 0x46, 0x43, 4, 0];
  for (let i = 4; i < 16; i++) if (i !== 8 && i !== 9 && b[i] !== fixed[i]) return 'header';
  return u32(b, 16) === crc32(b.subarray(SEALED_HEADER, b.length - TRAILER)) ? null : 'body';
}

/** The length the trailer claims for the unpacked data matches (gunzip itself does not look at it). */
export function lengthMatches(b: Uint8Array, rawLength: number): boolean {
  return u32(b, b.length - 4) === rawLength >>> 0;
}
