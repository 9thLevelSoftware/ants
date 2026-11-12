// URL flags the render layer reads (architecture section 5): ?test=1, &quality=..., &post=0|1.
import { isQualityId, type QualitySetting } from './quality';

export interface RenderFlags {
  test: boolean;
  /** Requested quality; `test=1` without a quality means 'test'. */
  quality: QualitySetting;
  /** Explicit post override (null = preset decides). */
  post: boolean | null;
}

export function parseRenderFlags(search: string): RenderFlags {
  const q = new URLSearchParams(search);
  const test = q.get('test') === '1';
  const raw = q.get('quality');
  const quality: QualitySetting = raw === 'auto' ? 'auto' : isQualityId(raw) ? raw : test ? 'test' : 'auto';
  const post = q.has('post') ? q.get('post') !== '0' : null;
  return { test, quality, post };
}
