// Generated placeholder pixels for textures that could not be loaded: a neutral checker for colour maps (visible but
// not alarming), flat values for data maps so lighting stays sane.
import type { TextureMap } from './manifest';

export const PLACEHOLDER_SIZE = 8;

/** RGBA8 pixels for a placeholder of the given map kind. */
export function placeholderPixels(map: TextureMap, size = PLACEHOLDER_SIZE): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let r: number, g: number, b: number;
      if (map === 'normal') { r = 128; g = 128; b = 255; } // flat tangent-space normal
      else if (map === 'rough') { r = g = b = 200; } // fairly rough
      else if (map === 'opacity') { r = g = b = 255; } // opaque
      else { const c = (x + y) % 2 === 0 ? 120 : 96; r = c + 8; g = c; b = c - 10; } // warm grey checker
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  return data;
}
