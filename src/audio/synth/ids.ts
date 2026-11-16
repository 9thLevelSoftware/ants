// Ids of the procedurally synthesised sounds (GDD 08 §13.7). One-shots are built per play from Web Audio nodes
// (recipes.ts); beds are long-running layers (beds.ts). The documentation of each recipe sits next to its code.

export const SYNTH_ONESHOTS = [
  // ant-scale foley (§13.5)
  'step-click', 'grain-trickle', 'mandible-click', 'bite-click', 'scuffle', 'acid-hiss', 'liquid-tick', 'antenna-brush',
  'membrane-pop', 'alarm-shimmer', 'wood-drum', 'stridulation-rasp', 'leaf-tear', 'prey-flutter', 'creature-tap',
  'fly-buzz', 'wing-whoosh', 'sand-spray', 'gurgle', 'grain-slide', 'wood-gnaw', 'soil-tamp', 'low-rumble', 'trickle',
  'soft-brush', 'strike-snap', 'bird-whoosh', 'bird-landing', 'peck', 'gust',
  // fallbacks for file-based cues
  'soil-scrape', 'crunch', 'drip', 'splat', 'chirp', 'wood-creak', 'swarm-buzz', 'bird-call',
  // giants (§13.6)
  'sub-thump', 'sub-tremor', 'engine', 'reel-whirr', 'broom-swish', 'vacuum', 'tyre-roll', 'hose-hiss', 'sand-thump',
  'glug', 'plastic-clack', 'thunder', 'car-pass',
  // UI and alerts (§13.8)
  'ui-click', 'ui-hover', 'ui-switch', 'alert-notice', 'alert-warning', 'alert-critical', 'milestone-motif', 'page-turn', 'shutter-click',
  // granular ambience grains
  'droplet', 'heat-tick', 'ice-tick', 'nest-tick', 'crackle', 'patter',
] as const;
export type SynthOneShot = (typeof SYNTH_ONESHOTS)[number];

/** Continuous synthesised beds (ambience layers and fallbacks for missing bed files). */
export const SYNTH_BEDS = [
  'leaf-rustle', 'low-wind', 'distant-murmur', 'underground-tone',
  // fallbacks for every bed file
  'bed-birds', 'bed-crickets', 'bed-rain-light', 'bed-rain-heavy', 'bed-wind', 'bed-street', 'bed-traffic', 'bed-hum',
] as const;
export type SynthBed = (typeof SYNTH_BEDS)[number];
