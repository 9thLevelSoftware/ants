// The intro card's generated place token (GDD 06 §5.3, e.g. "Hollow Verge"): two plain words picked from the
// world seed. Presentation only; deterministic per seed.

const FIRST = [
  'Hollow', 'Mossy', 'Low', 'Sunny', 'Quiet', 'Stony', 'Bramble', 'Clover', 'Dry', 'Elder', 'Fern', 'Hazel', 'Lark',
  'Long', 'Nettle', 'Old', 'Plover', 'Reed', 'Sedge', 'Thistle', 'Warren', 'Willow', 'Yarrow', 'Bracken',
];
const SECOND = [
  'Verge', 'Bank', 'Corner', 'Patch', 'Edge', 'Hollow', 'Rise', 'Strip', 'Margin', 'Bed', 'Step', 'Ledge', 'Hedge',
  'Border', 'Path', 'Furrow', 'Slope', 'Gap',
];

function mix(n: number): number {
  let h = (n | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export function placeName(seed: number): string {
  const h = mix(seed);
  const a = FIRST[h % FIRST.length];
  let b = SECOND[(h >>> 8) % SECOND.length];
  if (b === a) b = SECOND[((h >>> 8) + 1) % SECOND.length];
  return `${a} ${b}`;
}
