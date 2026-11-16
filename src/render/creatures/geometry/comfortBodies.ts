/**
 * Comfort-mode substitute (GDD 08 §12, GDD 05 §2.1): the `abstract` level draws a legless smooth ovoid of the same
 * size as the animal, with no limbs, eyes or hairs, and keeps the wind-up as a body squash (uMisc.w). Nothing of
 * the spider's silhouette survives: no legs, no waist between the body halves.
 */
import { lin } from '@/render/ants/geometry/meshBuilder';
import { CreatureBuilder, PART, body, type Detail } from './builder';
import { row, type Built } from './types';

export interface OvoidSize { length: number; halfWidth: number; halfHeight: number }

/** Ovoid sizes per substituted kind (mm): spiders at their catalogue size, optional mite and centipede. */
export const OVOID_SIZES: Record<string, OvoidSize> = {
  'jumping-spider': { length: 6, halfWidth: 1.4, halfHeight: 1.0 },
  'wolf-spider': { length: 10, halfWidth: 2.2, halfHeight: 1.5 },
  'ant-spider': { length: 3, halfWidth: 0.7, halfHeight: 0.5 },
  mite: { length: 0.5, halfWidth: 0.2, halfHeight: 0.15 },
  centipede: { length: 20, halfWidth: 1.3, halfHeight: 0.6 },
};

export function buildOvoid(size: OvoidSize) {
  return (d: Detail): Built => {
    const b = new CreatureBuilder();
    const c = lin('#857b6c');
    const L = size.length, w = size.halfWidth, h = size.halfHeight;
    body(b, d, {
      zTail: -L / 2, zHead: L / 2, rings: 14, radial: [16, 10, 6], part: PART.BODY,
      rows: [row(0, 0.05 * w, 0.05 * h, h), row(0.2, 0.8 * w, 0.8 * h, h), row(0.55, w, h, h), row(0.9, 0.7 * w, 0.7 * h, h), row(1, 0.05 * w, 0.05 * h, h)],
      color: () => c,
    });
    return { body: b };
  };
}
