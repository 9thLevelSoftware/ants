// Finish codes of the per-instance look (iLook.x) shared by the CPU classification (looks.ts) and the shader
// (finishGlsl.ts). A finish says how a primitive's surface is drawn on top of its MaterialId's texture set;
// it never changes the primitive's shape, size or collision (render-only dressing).

export const FINISH = {
  /** The material's texture and colour as they are (soil, wood, stone, bark ...). */
  natural: 0,
  /** Re-coloured dielectric: paint, enamel, plastic, glaze, fabric, rubber (texture keeps only its detail). */
  colour: 1,
  /** Bare metal: galvanised, stainless, chrome, cast iron (metalness 1, instance colour = metal colour). */
  metal: 2,
  /** Rusted metal: the scanned rust as it is (only where a template asks for it). */
  rust: 3,
  /** Car / can paint with a clear coat. */
  clearcoat: 4,
  /** Car cabin: dark glass on the sides, body paint on the roof. */
  cabin: 5,
  /** Tyre: black rubber with a metal hub on the side faces. */
  tyre: 6,
  /** Leaf blade: leaf silhouette, midrib, veins, slight curl, back-lit translucency. */
  leaf: 7,
  /** Flower heads (organic): daisy, dandelion flower, dandelion seed clock, clover head, generic umbel. */
  daisy: 8,
  dandelion: 9,
  seedClock: 10,
  cloverHead: 11,
  umbel: 12,
  /** Green stem with nodes and fine hairs. */
  stem: 13,
  /** Bark cylinder with cut ends showing growth rings (logs, stumps, branches). */
  cutWood: 14,
  /** Fungus: cap with gills underneath. */
  fungus: 15,
  /** Glass: dark, glossy, faintly smudged. */
  glass: 16,
  /** Car body: clear-coated paint with panel seams, a dark sill and wheel-arch shadows. */
  carBody: 17,
  /** Moulded plastic (water butts, compost bins, pots, bins): horizontal moulding ribs, a sun-bleached top. */
  moulded: 18,
  /** White goods: enamel with a ventilated plinth at the bottom and a door gap line. */
  appliance: 19,
  /**
   * Injection-moulded plastic parts (play equipment, garden furniture): fine stipple, a mould part line, a recessed rim on big flat faces, worn
   * light edges and dirt at the foot (look pass 5: large single-colour faces had no surface at ant height).
   */
  plastic: 20,
} as const;

export type FinishId = keyof typeof FINISH;

/** Leaf outline styles (iLook.y of the leaf finish). */
export const LEAF_STYLE = { lanceolate: 0, toothed: 1, spatulate: 2, obovate: 3, ovate: 4 } as const;
export type LeafStyle = keyof typeof LEAF_STYLE;
