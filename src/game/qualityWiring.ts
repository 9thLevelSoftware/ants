// Where a quality preset goes once the render app has taken it: the sub-renderers and the asset loader's own
// textures (scanned texture sets of primitives, mounds and decor sample with the loader's anisotropy; the material
// library only re-filters its procedural sets). One function so boot and every switch apply the same set.
import type { QualityPreset } from '@/render/app/quality';

export interface QualityTargets {
  registry: { setQuality(q: QualityPreset): void } | null;
  assets: { setAnisotropy(n: number): void };
}

export function applyQualityToServices(q: QualityPreset, t: QualityTargets): void {
  t.assets.setAnisotropy(q.anisotropy);
  t.registry?.setQuality(q);
}
