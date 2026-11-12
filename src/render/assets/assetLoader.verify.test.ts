// Adversarial review tests for src/render/assets (F3a review).
import { describe, expect, it } from 'vitest';
import { AssetLoader } from './assetLoader';
import { EmbeddedBackend, FetchBackend, type AssetGlobals, type FetchFn } from './backends';
import { parseManifest } from './manifest';

const MINI = {
  materials: {
    soil: { title: 'Soil', atlas: false, maps: { albedo: 'assets/t/soil/albedo.jpg', rough: 'assets/t/soil/rough.jpg' }, size: [4, 4] },
  },
  assets: [
    { id: 'tex/soil/albedo', path: 'assets/t/soil/albedo.jpg', kind: 'texture', map: 'albedo', material: 'soil', bytes: 3 },
    { id: 'tex/soil/rough', path: 'assets/t/soil/rough.jpg', kind: 'texture', map: 'rough', material: 'soil', bytes: 3 },
    { id: 'audio/a', path: 'assets/a.mp3', kind: 'audio', bytes: 3 },
  ],
};
const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

function fetchFrom(fs: Record<string, string>, log: string[] = []): FetchFn {
  return async (url) => {
    const p = new URL(url).pathname.slice(1);
    log.push(p);
    return { ok: p in fs, status: p in fs ? 200 : 404, arrayBuffer: async () => enc(fs[p] ?? '') };
  };
}

function loader(backends: ConstructorParameters<typeof AssetLoader>[0]['backends'], warnings: string[], decodeFails = false) {
  return new AssetLoader({
    backends,
    decodeImage: async (bytes) => {
      if (decodeFails) throw new Error('corrupt image');
      return { width: 4, height: 4, tag: new TextDecoder().decode(bytes) } as unknown as { width: number; height: number };
    },
    makeImage: async (_r, w, h) => ({ width: w, height: h, placeholder: true }) as unknown as { width: number; height: number },
    warn: (m) => warnings.push(m),
  });
}

describe('AssetLoader (verify)', () => {
  it('the same texture requested twice concurrently is fetched once and is the same object', async () => {
    const log: string[] = [];
    const fs = { 'assets/manifest.json': JSON.stringify(MINI), 'assets/t/soil/albedo.jpg': 'A' };
    const l = loader([new FetchBackend('http://h/', fetchFrom(fs, log))], []);
    const [a, b] = await Promise.all([l.textureAsync('soil', 'albedo'), l.textureAsync('soil', 'albedo')]);
    expect(a).toBe(b);
    expect(log.filter((p) => p.endsWith('albedo.jpg')).length).toBe(1);
  });

  it('a corrupt image (decode throws) becomes a placeholder with one warning, never a rejection', async () => {
    const warnings: string[] = [];
    const fs = { 'assets/manifest.json': JSON.stringify(MINI), 'assets/t/soil/albedo.jpg': 'A' };
    const l = loader([new FetchBackend('http://h/', fetchFrom(fs))], warnings, true);
    const t = await l.textureAsync('soil', 'albedo');
    await l.textureAsync('soil', 'albedo');
    expect(l.isPlaceholder('soil', 'albedo')).toBe(true);
    expect((t.image as { placeholder?: boolean }).placeholder).toBe(true);
    expect(warnings.length).toBe(1);
  });

  it('no back end at all: init resolves, textures become placeholders, preload reports failures', async () => {
    const warnings: string[] = [];
    const l = loader([], warnings);
    await expect(l.init()).resolves.toBeUndefined();
    const res = await l.preload(['tex/soil/albedo', 'nope']);
    expect(res.loaded).toEqual([]);
    expect(res.failed.sort()).toEqual(['nope', 'tex/soil/albedo'].sort());
    expect(await l.textureAsync('soil', 'albedo')).toBeTruthy();
    await expect(l.audioData('audio/a')).rejects.toThrow();
  });

  it('a pack script that fails to load can be retried, then the embedded payload is used', async () => {
    const g: AssetGlobals = { __FOUNDRESS_ASSET_INDEX__: { version: 1, packs: [{ src: 'p.js', paths: ['assets/manifest.json'] }] } };
    let calls = 0;
    const inject = async () => {
      calls++;
      if (calls === 1) throw new Error('network');
      g.__FOUNDRESS_ASSETS__ = { 'assets/manifest.json': btoa(JSON.stringify(MINI)) };
    };
    const e = new EmbeddedBackend(g, inject);
    await expect(e.bytes('assets/manifest.json')).rejects.toThrow();
    const buf = await e.bytes('assets/manifest.json');
    expect(JSON.parse(new TextDecoder().decode(buf)).materials.soil.title).toBe('Soil');
    expect(calls).toBe(2);
  });

  it('embedded first, fetch as fallback for paths no pack holds', async () => {
    const g: AssetGlobals = { __FOUNDRESS_ASSETS__: { 'assets/manifest.json': btoa(JSON.stringify(MINI)) } };
    const log: string[] = [];
    const l = loader([new EmbeddedBackend(g, async () => {}), new FetchBackend('http://h/', fetchFrom({ 'assets/t/soil/rough.jpg': 'R' }, log))], []);
    await l.init();
    expect(l.manifest?.materials.has('soil')).toBe(true);
    expect(log).not.toContain('assets/manifest.json');
    await l.textureAsync('soil', 'rough');
    expect(l.isPlaceholder('soil', 'rough')).toBe(false);
  });

  it('audioData returns independent copies (decodeAudioData detaches its input)', async () => {
    const fs = { 'assets/manifest.json': JSON.stringify(MINI), 'assets/a.mp3': 'MP3' };
    const l = loader([new FetchBackend('http://h/', fetchFrom(fs))], []);
    const a = await l.audioData('audio/a');
    const b = await l.audioData('audio/a');
    expect(a).not.toBe(b);
    expect(new TextDecoder().decode(b)).toBe('MP3');
  });

  it('manifest parser rejects junk with readable errors and skips bad entries', () => {
    expect(() => parseManifest(null)).toThrow(/not an object/);
    expect(() => parseManifest({ materials: {}, assets: {} })).toThrow(/assets/);
    const { manifest, warnings } = parseManifest({ materials: { x: { maps: null } }, assets: [{ id: 1 }, null] });
    expect(manifest.materials.size).toBe(0);
    expect(warnings.length).toBe(3);
  });
});
