// State shared by the body-part builders while one variant x LOD is assembled.
import type { AntMorphology } from '../morph/types';
import { lin, type MeshBuilder, type V3 } from './meshBuilder';
import type { Lod } from './rig';

export interface PartColors {
  head: V3; meso: V3; gaster: V3; legs: V3; tarsi: V3; ant: V3; mand: V3; teeth: V3; eye: V3; hair: V3; mem: V3; callow: V3;
}

/** Mesosoma section at s (0 front .. 1 back): centre height, half height b, half width a, top and bottom y. */
export interface MesoSection { yc: number; b: number; a: number; top: number; bot: number }

export interface Assembly {
  p: AntMorphology;
  lod: Lod;
  /** Nominal body length during assembly (the result is scaled to p.bodyLength afterwards). */
  BL: number;
  col: PartColors;
  rnd: () => number;
  body: MeshBuilder;
  hairLen: number;
  hairR: number;
  /** Mesosoma frame: front and back z, bottom y, height, width. */
  zF: number; zB: number; yb: number; MH: number; MW: number;
  mesoAt: (s: number) => MesoSection;
}

export function partColors(p: AntMorphology): PartColors {
  const C = p.colors;
  return {
    head: lin(C.head), meso: lin(C.mesosoma), gaster: lin(C.gaster), legs: lin(C.legs), tarsi: lin(C.tarsi),
    ant: lin(C.antenna), mand: lin(C.mandible), teeth: lin(C.teeth), eye: lin(C.eye), hair: lin(C.hair),
    mem: lin(C.membrane), callow: lin(C.callow),
  };
}
