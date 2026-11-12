// A 160 x 90 JPEG data URL of the current view for the slot card (GDD 06 §15 rule 5, GDD 08 §7.6). DOM only.
import { THUMB_HEIGHT, THUMB_JPEG_QUALITY, THUMB_WIDTH } from './constants';

/** Scales `source` to cover the thumbnail (centre crop) and returns a JPEG data URL, or null when it cannot. */
export function captureCanvasThumbnail(source: HTMLCanvasElement): string | null {
  try {
    const sw = source.width, sh = source.height;
    if (typeof document === 'undefined' || sw <= 0 || sh <= 0) return null;
    const c = document.createElement('canvas');
    c.width = THUMB_WIDTH;
    c.height = THUMB_HEIGHT;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    const k = Math.max(THUMB_WIDTH / sw, THUMB_HEIGHT / sh);
    const w = sw * k, h = sh * k;
    ctx.drawImage(source, (THUMB_WIDTH - w) / 2, (THUMB_HEIGHT - h) / 2, w, h);
    const url = c.toDataURL('image/jpeg', THUMB_JPEG_QUALITY);
    return url.startsWith('data:image/jpeg') ? url : null;
  } catch {
    return null;
  }
}
