import { describe, expect, it } from 'vitest';
import { dataUrlToBlob, encodeCanvas } from './capture';

const B64 = 'iVBORw0KGgo='; // the PNG signature

describe('data URL to blob', () => {
  it('decodes base64', async () => {
    const b = dataUrlToBlob(`data:image/png;base64,${B64}`);
    expect(b?.type).toBe('image/png');
    expect([...new Uint8Array(await b!.arrayBuffer())].slice(0, 4)).toEqual([137, 80, 78, 71]);
  });
  it('refuses junk', () => {
    expect(dataUrlToBlob('nope')).toBeNull();
    expect(dataUrlToBlob('data:image/png;base64,@@@')).toBeNull();
  });
});

describe('encodeCanvas', () => {
  const canvas = (o: Partial<HTMLCanvasElement>) => o as HTMLCanvasElement;
  it('uses toBlob', async () => {
    const png = new Blob(['x'], { type: 'image/png' });
    const r = await encodeCanvas(canvas({ toBlob: (cb: BlobCallback) => cb(png) }));
    expect(r).toEqual({ blob: png, method: 'canvas-blob' });
  });
  it('falls back to the data URL when toBlob throws or is missing', async () => {
    const throwing = canvas({ toBlob: () => { throw new DOMException('tainted', 'SecurityError'); }, toDataURL: () => `data:image/png;base64,${B64}` });
    expect((await encodeCanvas(throwing))?.method).toBe('data-url');
    expect((await encodeCanvas(canvas({ toDataURL: () => `data:image/png;base64,${B64}` })))?.method).toBe('data-url');
  });
  it('gives null when nothing can encode', async () => {
    expect(await encodeCanvas(canvas({ toBlob: (cb: BlobCallback) => cb(null) }))).toBeNull();
    expect(await encodeCanvas(canvas({ toBlob: () => { throw new Error('x'); }, toDataURL: () => { throw new Error('y'); } }))).toBeNull();
  });
});
