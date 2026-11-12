// Browser side of export: a Blob download and the clipboard copy. Both may be refused (sandboxed iframe without
// allow-downloads, `?nodownload=1`, no user gesture), so they report a boolean and the caller shows the text form.
// DOM only: not used by the pure parts of the save layer.

/** Triggers a file download. Returns false when it threw or the environment is known to block downloads. */
export function downloadBytes(bytes: Uint8Array, filename: string, opts: { noDownload?: boolean } = {}): boolean {
  if (opts.noDownload) return false;
  try {
    if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') return false;
    const blob = new Blob([bytes as BlobPart], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* ignore */ } }, 30000);
    return true;
  } catch {
    return false;
  }
}

/** Copies text with the Clipboard API; false when refused (the UI then selects the text and shows "Press Ctrl+C"). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Reads a user-picked file (file input / drop) into bytes. Null when the browser refuses. */
export async function readFileBytes(file: Blob): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
}
