import { NoColorSpace, RepeatWrapping, ClampToEdgeWrapping, SRGBColorSpace } from 'three';
import { describe, expect, it } from 'vitest';
import { AssetLoader } from './assetLoader';
import { EmbeddedBackend, FetchBackend, decodeBase64, type AssetGlobals, type FetchFn } from './backends';
import { parseManifest } from './manifest';
import REAL_MANIFEST from '../../../public/assets/manifest.json';


const MINI = {
  root: 'public/',
  materials: {
    soil: { title: 'Soil', atlas: false, maps: { albedo: 'assets/t/soil/albedo.jpg', normal: 'assets/t/soil/normal.jpg' }, size: [4, 4] },
    blades: { title: 'Blades', atlas: true, maps: { albedo: 'assets/t/blades/albedo.png' }, size: [4, 4] },
    ghost: { title: 'Missing', atlas: false, maps: { albedo: 'assets/t/ghost/albedo.jpg' }, size: [4, 4] },
  },
  assets: [
    { id: 'tex/soil/albedo', path: 'assets/t/soil/albedo.jpg', kind: 'texture', map: 'albedo', material: 'soil', bytes: 3 },
    { id: 'tex/soil/normal', path: 'assets/t/soil/normal.jpg', kind: 'texture', map: 'normal', material: 'soil', bytes: 3 },
    { id: 'audio/sfx/step', path: 'assets/a/step.mp3', kind: 'audio', bytes: 4 },
  ],
};

const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
const b64 = (s: string) => btoa(s); // test payloads are ASCII

function files(): Record<string, string> {
  return {
    'assets/manifest.json': JSON.stringify(MINI),
    'assets/t/soil/albedo.jpg': 'JPG1',
    'assets/t/soil/normal.jpg': 'JPG2',
    'assets/t/blades/albedo.png': 'PNG1',
    'assets/a/step.mp3': 'MP3!',
  };
}

function fetchMock(fs: Record<string, string>, log: string[]): FetchFn {
  return async (url) => {
    const path = new URL(url).pathname.replace(/^\/game\//, '');
    log.push(path);
    const body = fs[path];
    return { ok: body !== undefined, status: body === undefined ? 404 : 200, arrayBuffer: async () => enc(body ?? '') };
  };
}

function loaderWith(backends: ConstructorParameters<typeof AssetLoader>[0]['backends'], warnings: string[]) {
  return new AssetLoader({
    backends,
    decodeImage: async (bytes, mime) => ({ width: 4, height: 4, tag: new TextDecoder().decode(bytes), mime }) as unknown as { width: number; height: number },
    makeImage: async (_rgba, w, h) => ({ width: w, height: h, placeholder: true }) as unknown as { width: number; height: number },
    warn: (m) => warnings.push(m),
    anisotropy: 4,
  });
}

describe('manifest parsing', () => {
  it('parses the real manifest', () => {
    const { manifest, warnings } = parseManifest(REAL_MANIFEST);
    expect(warnings).toEqual([]);
    expect(manifest.materials.size).toBe(25);
    expect(manifest.assets.size).toBe(123);
    expect(manifest.materials.get('soil_garden')?.maps.albedo).toBe('assets/textures/soil_garden/albedo.jpg');
    expect(manifest.materials.get('grass_blades_atlas')?.atlas).toBe(true);
    expect(manifest.assets.get('audio/ambience/birdsong_day')?.kind).toBe('audio');
  });

  it('rejects malformed input with a readable error and skips bad entries', () => {
    expect(() => parseManifest(null)).toThrow(/not an object/);
    expect(() => parseManifest({ materials: {}, assets: {} })).toThrow(/assets/);
    const { manifest, warnings } = parseManifest({ materials: { a: { maps: null } }, assets: [{ id: 'x' }] });
    expect(manifest.materials.size).toBe(0);
    expect(warnings.length).toBe(2);
  });
});

describe('AssetLoader with the fetch back end', () => {
  it('loads textures with the right colour space, wrapping, anisotropy and caching', async () => {
    const log: string[] = [], warnings: string[] = [];
    const L = loaderWith([new FetchBackend('http://h/game/index.html', fetchMock(files(), log))], warnings);
    const albedo = await L.textureAsync('soil', 'albedo');
    const normal = await L.textureAsync('soil', 'normal');
    const blades = await L.textureAsync('blades', 'albedo');
    expect((albedo.image as unknown as { tag: string }).tag).toBe('JPG1');
    expect(albedo.colorSpace).toBe(SRGBColorSpace);
    expect(normal.colorSpace).toBe(NoColorSpace);
    expect(albedo.wrapS).toBe(RepeatWrapping);
    expect(blades.wrapS).toBe(ClampToEdgeWrapping);
    expect(albedo.anisotropy).toBe(4);
    expect(albedo.generateMipmaps).toBe(true);
    expect(L.texture('soil', 'albedo')).toBe(albedo); // cached
    expect(log.filter((p) => p.endsWith('soil/albedo.jpg')).length).toBe(1);
    expect(log).toContain('assets/manifest.json'); // relative to the page, never root-absolute
    expect(warnings).toEqual([]);
  });

  it('returns audio bytes as fresh copies and JSON', async () => {
    const L = loaderWith([new FetchBackend('http://h/game/', fetchMock(files(), []))], []);
    const a = await L.audioData('audio/sfx/step');
    const b = await L.audioData('audio/sfx/step');
    expect(new TextDecoder().decode(a)).toBe('MP3!');
    expect(a).not.toBe(b);
    expect(await L.json<{ root: string }>('assets/manifest.json')).toMatchObject({ root: 'public/' });
  });

  it('a missing texture becomes a placeholder with exactly one warning, never an exception', async () => {
    const warnings: string[] = [];
    const L = loaderWith([new FetchBackend('http://h/game/', fetchMock(files(), []))], warnings);
    const t1 = await L.textureAsync('ghost', 'albedo'); // listed in the manifest but 404
    const t2 = await L.textureAsync('nope', 'albedo'); // unknown material
    await L.textureAsync('ghost', 'albedo');
    expect((t1.image as unknown as { placeholder: boolean }).placeholder).toBe(true);
    expect((t2.image as unknown as { placeholder: boolean }).placeholder).toBe(true);
    expect(L.isPlaceholder('ghost', 'albedo')).toBe(true);
    expect(warnings.length).toBe(2);
    await expect(L.audioData('audio/none')).rejects.toThrow();
    const pre = await L.preload(['tex/soil/albedo', 'audio/sfx/step', 'audio/none']);
    expect(pre.loaded.sort()).toEqual(['audio/sfx/step', 'tex/soil/albedo']);
    expect(pre.failed).toEqual(['audio/none']);
  });

  it('without any manifest every texture is a placeholder and init never rejects', async () => {
    const warnings: string[] = [];
    const L = loaderWith([new FetchBackend('http://h/game/', fetchMock({}, []))], warnings);
    await L.init();
    expect(L.manifest).toBeNull();
    const t = await L.textureAsync('soil', 'albedo');
    expect((t.image as unknown as { placeholder: boolean }).placeholder).toBe(true);
    expect(warnings.length).toBe(2); // manifest + this texture
    expect(L.placeholder('normal').image!.data![2]).toBe(255);
  });
});

describe('AssetLoader with embedded packs', () => {
  it('reads registered payloads and injects pack scripts lazily, once', async () => {
    const fs = files();
    const g: AssetGlobals = {
      __FOUNDRESS_ASSETS__: { 'assets/manifest.json': b64(fs['assets/manifest.json']) },
      __FOUNDRESS_ASSET_INDEX__: {
        version: 1,
        packs: [
          { src: 'packs/a.js', paths: ['assets/t/soil/albedo.jpg', 'assets/t/soil/normal.jpg'] },
          { src: 'packs/b.js', paths: ['assets/a/step.mp3'] },
        ],
      },
    };
    const injected: string[] = [];
    const inject = async (src: string) => {
      injected.push(src);
      for (const p of g.__FOUNDRESS_ASSET_INDEX__!.packs.find((x) => x.src === src)!.paths) g.__FOUNDRESS_ASSETS__![p] = b64(fs[p]);
    };
    const fetchLog: string[] = [];
    const warnings: string[] = [];
    const L = loaderWith([new EmbeddedBackend(g, inject), new FetchBackend('http://h/game/', fetchMock({}, fetchLog))], warnings);
    const [a, n] = await Promise.all([L.textureAsync('soil', 'albedo'), L.textureAsync('soil', 'normal')]);
    expect((a.image as unknown as { tag: string }).tag).toBe('JPG1');
    expect((n.image as unknown as { tag: string }).tag).toBe('JPG2');
    expect(injected).toEqual(['packs/a.js']);
    expect(new TextDecoder().decode(await L.audioData('audio/sfx/step'))).toBe('MP3!');
    expect(injected).toEqual(['packs/a.js', 'packs/b.js']);
    expect(fetchLog).toEqual([]); // nothing went to the network
    expect(L.backendFor('assets/t/soil/albedo.jpg')).toBe('embedded');
    expect(warnings).toEqual([]);
  });

  it('a failing pack falls back to fetch, then to a placeholder', async () => {
    const g: AssetGlobals = { __FOUNDRESS_ASSET_INDEX__: { version: 1, packs: [{ src: 'packs/x.js', paths: ['assets/manifest.json'] }] } };
    const warnings: string[] = [];
    const L = loaderWith([
      new EmbeddedBackend(g, async () => { throw new Error('blocked'); }),
      new FetchBackend('http://h/game/', fetchMock(files(), [])),
    ], warnings);
    await L.init();
    expect(L.manifest?.materials.size).toBe(3); // came from fetch
    expect(warnings).toEqual([]);
  });

  it('decodes base64 with or without a data-URL prefix', () => {
    expect(new TextDecoder().decode(decodeBase64(b64('hello')))).toBe('hello');
    expect(new TextDecoder().decode(decodeBase64('data:application/octet-stream;base64,' + b64('hi')))).toBe('hi');
  });
});
