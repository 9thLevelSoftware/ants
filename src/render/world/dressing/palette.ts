// Colour palettes of the render-only dressing (GDD 08 11: naturalistic, everyday objects at ant scale). sRGB hex in,
// linear RGB out (three's working space), so the numbers here can be compared with a photo or a paint chart.

export type Rgb = [number, number, number];

function toLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** sRGB '#rrggbb' -> linear RGB 0..1. */
export function lin(hex: string): Rgb {
  const v = parseInt(hex.replace('#', ''), 16);
  return [toLinear(((v >> 16) & 255) / 255), toLinear(((v >> 8) & 255) / 255), toLinear((v & 255) / 255)];
}

const L = (list: string[]): Rgb[] => list.map(lin);

export const PALETTE = {
  /** Car body colours of a European car park (silver, grey, black and white dominate). */
  carPaint: L(['#9a9da1', '#5d6166', '#1c1d20', '#e4e5e2', '#7a1518', '#1d2f55', '#2f4a3a', '#b8b2a2']),
  canPaint: L(['#b3121b', '#1d5f2c', '#1a3d8f', '#c9a227', '#c0c4c8']),
  capPaint: L(['#a8161c', '#c79a1f', '#1b3f8a', '#c3c6c8', '#2a2a2a']),
  toyPlastic: L(['#d62a1e', '#f2c318', '#1f5fc4', '#2f9a3a', '#f07a1a']),
  chairPaint: L(['#2f6f73', '#a23b2c', '#e2dccb', '#3b3f45']),
  binLid: L(['#e8e6df', '#c22b25', '#2b2d30']),
  potPlastic: L(['#1e1e1e', '#a4512d', '#2e4b2a']),
  mat: L(['#2c3e5c', '#6b2b2b', '#45484c']),
  /** Enamel and laminate whites. */
  enamel: lin('#e9e8e3'),
  laminate: lin('#bdbab2'),
  upvc: lin('#ecebe6'),
  /** Metals (base reflectance, linear). */
  stainless: lin('#c9cbcc'),
  chrome: lin('#e6e8ea'),
  galvanised: lin('#a9adb0'),
  castIron: lin('#2a2827'),
  blackPaint: lin('#1d1e1f'),
  greenPaint: lin('#1f3a2b'),
  greyPaint: lin('#6e7276'),
  darkGlass: lin('#151b1d'),
  hobGlass: lin('#0b0b0c'),
  rubber: lin('#1b1b1b'),
  hoseGreen: lin('#2f6b2a'),
  pipeBlack: lin('#232425'),
  pipeGrey: lin('#8d8f8e'),
  butGreen: lin('#24402a'),
  bucketGreen: lin('#1f4a2a'),
  filter: lin('#e8dcc0'),
  /** Living plant parts. */
  leaf: L(['#365d1d', '#426a28', '#2f5419', '#4b7232']),
  dandelionLeaf: lin('#365e20'),
  stem: lin('#5a7a3e'),
  dandelionStem: lin('#7d8f5a'),
  dandelionFlower: lin('#f2b90f'),
  seedClock: lin('#e9e6dc'),
  daisyPetal: lin('#f4f2ec'),
  cloverHead: lin('#ead9de'),
  umbel: L(['#efeae0', '#c9b6d8', '#e9d7a8']),
  moss: lin('#4f6f23'),
  deadLeaf: L(['#8a5a2b', '#a0612a', '#6e4a2a', '#b07a3a']),
  fungusCap: L(['#a8724a', '#c9a77a', '#7a4b2e']),
  fungusStem: lin('#d9cdb4'),
  nut: lin('#7a5230'),
} as const;
