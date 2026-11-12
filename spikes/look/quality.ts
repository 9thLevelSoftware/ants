/**
 * Quality presets. Everything that scales cost lives here (resolution, shadow map, post chain, densities, tessellation).
 * Target (design seed): integrated-GPU laptop, 1080p, 60 fps at Medium.
 */
export type QualityName = 'low' | 'medium' | 'high' | 'ultra';
export interface QualityPreset {
  name: QualityName;
  resScale: number;                       // render resolution relative to the canvas CSS size (x devicePixelRatio=1)
  shadow: { enabled: boolean; size: number; radius: number; half: number }; // half = shadow frustum half-width (mm) around the subject
  post: { dof: boolean; dofRes: number; bokehFrac: number /* max blur radius as a fraction of the frame height */; bloom: boolean; bloomLevels: number; aa: 'none' | 'fxaa' | 'smaa'; smaaPreset: 'high' | 'ultra' };
  grass: { count: number; rows: number; folded: boolean };
  pebbles: number; leaves: number; droplets: number;
  terrainSegs: number; terrainLayers: 1 | 2; dualScale: boolean; triplanar: boolean;
  anisotropy: number; envSize: number; ugCell: number;
}

export const QUALITY: Record<QualityName, QualityPreset> = {
  low: {
    name: 'low', resScale: 0.5,
    shadow: { enabled: false, size: 512, radius: 1, half: 180 },
    post: { dof: false, dofRes: 0.5, bokehFrac: 0.03, bloom: false, bloomLevels: 4, aa: 'fxaa', smaaPreset: 'high' },
    grass: { count: 2500, rows: 4, folded: false }, pebbles: 300, leaves: 14, droplets: 120,
    terrainSegs: 160, terrainLayers: 1, dualScale: false, triplanar: false, anisotropy: 1, envSize: 64, ugCell: 1.2,
  },
  medium: {
    name: 'medium', resScale: 0.75,
    shadow: { enabled: true, size: 1024, radius: 2, half: 220 },
    post: { dof: true, dofRes: 0.35, bokehFrac: 0.032, bloom: true, bloomLevels: 4, aa: 'fxaa', smaaPreset: 'high' },
    grass: { count: 6000, rows: 5, folded: true }, pebbles: 700, leaves: 26, droplets: 250,
    terrainSegs: 240, terrainLayers: 2, dualScale: false, triplanar: false, anisotropy: 4, envSize: 128, ugCell: 1.0,
  },
  high: {
    name: 'high', resScale: 1.0,
    shadow: { enabled: true, size: 2048, radius: 3, half: 260 },
    post: { dof: true, dofRes: 0.5, bokehFrac: 0.035, bloom: true, bloomLevels: 6, aa: 'smaa', smaaPreset: 'high' },
    grass: { count: 12000, rows: 7, folded: true }, pebbles: 1400, leaves: 45, droplets: 450,
    terrainSegs: 320, terrainLayers: 2, dualScale: true, triplanar: false, anisotropy: 8, envSize: 256, ugCell: 0.8,
  },
  ultra: {
    name: 'ultra', resScale: 1.0,
    shadow: { enabled: true, size: 4096, radius: 4, half: 320 },
    post: { dof: true, dofRes: 0.75, bokehFrac: 0.035, bloom: true, bloomLevels: 7, aa: 'smaa', smaaPreset: 'ultra' },
    grass: { count: 20000, rows: 9, folded: true }, pebbles: 2600, leaves: 70, droplets: 700,
    terrainSegs: 420, terrainLayers: 2, dualScale: true, triplanar: true, anisotropy: 16, envSize: 256, ugCell: 0.6,
  },
};
