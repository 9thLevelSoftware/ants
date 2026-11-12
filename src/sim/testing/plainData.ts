// Checks that a value is plain persisted data: primitives, plain objects, arrays and typed arrays only.

/** Returns the paths of every violation (empty = plain). */
export function findNonPlain(value: unknown, path = '$', out: string[] = []): string[] {
  if (value === null) return out;
  const t = typeof value;
  if (t === 'undefined') { out.push(`${path}: undefined`); return out; }
  if (t === 'number') {
    if (!Number.isFinite(value as number)) out.push(`${path}: non-finite number`);
    return out;
  }
  if (t === 'string' || t === 'boolean') return out;
  if (t !== 'object') { out.push(`${path}: ${t}`); return out; }
  if (ArrayBuffer.isView(value)) {
    if (value instanceof DataView) out.push(`${path}: DataView`);
    return out;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (!(i in value)) out.push(`${path}[${i}]: hole`);
      else findNonPlain(value[i], `${path}[${i}]`, out);
    }
    return out;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    out.push(`${path}: instance of ${(proto as { constructor?: { name?: string } }).constructor?.name ?? 'unknown'}`);
    return out;
  }
  for (const k of Object.keys(value as object)) findNonPlain((value as Record<string, unknown>)[k], `${path}.${k}`, out);
  return out;
}
