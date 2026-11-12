// Scene resource helpers: free everything under an object (geometries, materials, their textures), and force
// program recompiles (after shadow-setting changes or a restored WebGL context).
import type { Material, Object3D, Texture } from 'three';

function materialsOf(o: Object3D): Material[] {
  const m = (o as Object3D & { material?: Material | Material[] }).material;
  return !m ? [] : Array.isArray(m) ? m : [m];
}

function texturesOf(m: Material): Texture[] {
  const out: Texture[] = [];
  for (const v of Object.values(m as unknown as Record<string, unknown>)) {
    if (v && typeof v === 'object' && (v as Texture).isTexture) out.push(v as Texture);
  }
  return out;
}

/** Dispose geometries, materials and textures used under `root`. Shared resources are disposed once. */
export function disposeObject(root: Object3D, opts: { textures?: boolean } = {}): void {
  const seen = new Set<object>();
  root.traverse((o) => {
    const g = (o as Object3D & { geometry?: { dispose(): void } }).geometry;
    if (g && !seen.has(g)) { seen.add(g); g.dispose(); }
    for (const m of materialsOf(o)) {
      if (seen.has(m)) continue;
      seen.add(m);
      if (opts.textures !== false) for (const t of texturesOf(m)) if (!seen.has(t)) { seen.add(t); t.dispose(); }
      m.dispose();
    }
    const d = (o as Object3D & { dispose?: () => void }).dispose;
    if (typeof d === 'function' && !(o as Object3D & { isScene?: boolean }).isScene) d.call(o);
  });
}

export function markMaterialsDirty(root: Object3D): void {
  root.traverse((o) => { for (const m of materialsOf(o)) m.needsUpdate = true; });
}
