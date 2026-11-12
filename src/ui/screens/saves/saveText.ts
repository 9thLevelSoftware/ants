// The copy/paste text form of an export (GDD 08 7.6, architecture 7): "FOUNDRESS1:" + base64 of the same bytes the
// `.foundress` file holds. Pure helpers; the screens decide when the text fallback is needed.
export const EXPORT_PREFIX = 'FOUNDRESS1:';

/** base64 of a byte array without a giant argument list (btoa on chunks). */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function exportText(bytes: Uint8Array): string {
  return EXPORT_PREFIX + bytesToBase64(bytes);
}

export type ParsedImportText =
  | { ok: true; text: string; sizeKb: number }
  | { ok: false; error: string };

/**
 * Light check of pasted import text before it is handed to the loader: prefix, base64 alphabet, non-empty. The
 * loader does the real validation (magic, version, checksum, decode) and its message is shown as it comes.
 */
export function checkImportText(raw: string): ParsedImportText {
  const text = raw.trim();
  if (!text) return { ok: false, error: 'Paste the text of an exported colony first.' };
  if (!text.startsWith(EXPORT_PREFIX)) return { ok: false, error: `That text is not a FOUNDRESS save. It should begin with ${EXPORT_PREFIX}` };
  const body = text.slice(EXPORT_PREFIX.length).replace(/\s+/g, '');
  if (body.length === 0) return { ok: false, error: 'The text ends after the prefix; part of it was probably cut off.' };
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body) || body.length % 4 === 1) {
    return { ok: false, error: 'The text contains characters a save never has; part of it may have been altered.' };
  }
  return { ok: true, text: EXPORT_PREFIX + body, sizeKb: Math.max(1, Math.round((body.length * 3) / 4 / 1024)) };
}

export function sizeKb(bytes: number): number {
  return Math.max(1, Math.round(bytes / 1024));
}
