// The export container (architecture §7, GDD 08 §7.6): a `.foundress` file is gzip(encode({ format, formatVersion,
// meta, state })); the text form is `FOUNDRESS1:` + base64(file bytes) + `:` + CRC-32 of those bytes (8 hex digits).
// Parsing is strict and friendly: every rejection has a plain-words message the UI can show as it is.
import { decode, encode, fromBase64, gunzip, gzip, toBase64 } from '@/core/serialize';
import { MIN_SAVE_VERSION, SAVE_VERSION } from '@/sim/save/version';
import type { SimState } from '@/sim/types';
import {
  EXPORT_FORMAT_TAG, EXPORT_FORMAT_VERSION, EXPORT_TEXT_PREFIX, IMPORT_MAX_BYTES,
} from './constants';
import { crc32, crc32Hex } from './crc32';
import { frameProblem, lengthMatches, sealGzip } from './gzipFrame';
import { isValidMeta } from './meta';
import type { SaveCode, SaveMeta } from './types';

export interface ParsedSave {
  meta: SaveMeta;
  /** Decoded SimState (not migrated, not validated against a world yet). */
  state: SimState;
}

export type ParseResult = ({ ok: true } & ParsedSave) | { ok: false; code: SaveCode; message: string };

const bad = (code: SaveCode, message: string): ParseResult => ({ ok: false, code, message });

/** The `.foundress` bytes of a save. Throws (with the encoder's path message) when the state is not plain data. */
export function packContainer(meta: SaveMeta, state: SimState): Uint8Array {
  return sealGzip(gzip(encode({ format: EXPORT_FORMAT_TAG, formatVersion: EXPORT_FORMAT_VERSION, meta, state })));
}

export function bytesToText(bytes: Uint8Array): string {
  return `${EXPORT_TEXT_PREFIX}${toBase64(bytes)}:${crc32Hex(bytes)}`;
}

/** Suggested file name: foundress-<species>-<seed>-y<year>d<day>.foundress (no spaces, safe characters). */
export function exportFileName(meta: SaveMeta): string {
  const date = meta.dateLabel.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  return `foundress-${meta.species}-${meta.seedCode.toLowerCase()}-${date || `t${meta.tick}`}.foundress`;
}

export function parseText(input: string): ParseResult {
  const text = input.replace(/\s+/g, '');
  if (!text.startsWith(EXPORT_TEXT_PREFIX)) {
    return bad('foreign', `This text is not a FOUNDRESS save: it should start with ${EXPORT_TEXT_PREFIX}`);
  }
  if (text.length > IMPORT_MAX_BYTES * 1.4) return bad('too-large', 'This text is far too large to be a FOUNDRESS save.');
  const [b64, sum, ...rest] = text.slice(EXPORT_TEXT_PREFIX.length).split(':');
  if (rest.length > 0 || b64.length === 0) return bad('corrupt', 'The pasted text is incomplete or damaged. Copy the whole text again.');
  let bytes: Uint8Array;
  try {
    bytes = fromBase64(b64);
  } catch {
    return bad('corrupt', 'The pasted text is damaged (it is not valid base64). Copy the whole text again.');
  }
  if (sum !== undefined && sum.toLowerCase() !== crc32Hex(bytes)) {
    return bad('corrupt', 'The checksum does not match: part of the text was lost or changed. Copy the whole text again.');
  }
  return parseBytes(bytes);
}

/** Magic, size, frame (see gzipFrame.ts), gzip checksum, decode, format tag, version, meta and state shape, in that order. */
export function parseBytes(bytes: Uint8Array): ParseResult {
  if (bytes.length > IMPORT_MAX_BYTES) return bad('too-large', 'This file is far too large to be a FOUNDRESS save.');
  if (bytes.length < 18 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
    return bad('foreign', 'This is not a FOUNDRESS save file (it is not a .foundress file).');
  }
  if (frameProblem(bytes) !== null) return bad('corrupt', 'This save file is damaged: its header or contents were changed.');
  let raw: Uint8Array;
  try {
    raw = gunzip(bytes);
  } catch {
    return bad('corrupt', 'This save file is damaged: it cannot be unpacked.');
  }
  const t = bytes.length - 8;
  const stored = (bytes[t] | (bytes[t + 1] << 8) | (bytes[t + 2] << 16) | (bytes[t + 3] << 24)) >>> 0;
  if (stored !== crc32(raw) || !lengthMatches(bytes, raw.length)) return bad('corrupt', 'This save file is damaged: its checksum does not match.');
  let value: unknown;
  try {
    value = decode(raw);
  } catch {
    return bad('foreign', 'This file unpacks but is not a FOUNDRESS save.');
  }
  const o = value as { format?: unknown; formatVersion?: unknown; meta?: unknown; state?: unknown } | null;
  if (!o || typeof o !== 'object' || o.format !== EXPORT_FORMAT_TAG) return bad('foreign', 'This file is not a FOUNDRESS save.');
  if (typeof o.formatVersion !== 'number' || o.formatVersion > EXPORT_FORMAT_VERSION) {
    return bad('newer-version', 'This save is from a newer version of FOUNDRESS. Update the game to open it.');
  }
  if (!isValidMeta(o.meta)) return bad('corrupt', 'This save file is damaged: its description is missing or incomplete.');
  const state = o.state as Partial<SimState> | null;
  if (!state || typeof state !== 'object' || typeof state.version !== 'number' || !state.config || !Array.isArray(state.ants)) {
    return bad('corrupt', 'This save file is damaged: the colony data is missing or incomplete.');
  }
  if (state.version > SAVE_VERSION) return bad('newer-version', 'This save is from a newer version of FOUNDRESS. Update the game to open it.');
  if (state.version < MIN_SAVE_VERSION) return bad('too-old', 'This save is from a version of FOUNDRESS that can no longer be opened.');
  return { ok: true, meta: o.meta, state: state as SimState };
}
