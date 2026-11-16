// Creatures renderer (task render-creatures): prey, neutral fauna, aphid herds, aphid predators, ant predators, the
// antlion pit, the bird event's beak and shadow, and the spider comfort substitutes. See CreatureRenderer.ts.
export { CreatureRenderer, type CreatureFrameInfo, type CreatureLookInfo, type CreatureRenderContext, type CreatureRenderStats } from './CreatureRenderer';
export { CreaturesRenderer, creatureSource } from './CreaturesRenderer';
export { COMFORT_LEVELS, LOOKS, SPIDER_KINDS, comfortFor, lookKeyFor, type ComfortLevel, type ComfortSettingsLike } from './looks';
export { creaturePose, newPose, type CreaturePose, type LocoStyle } from './locomotion';
export { herdSpots, type AphidSpot } from './herds';
export { birdPose, newBirdPose } from './birdPose';
export type { CreatureSimSource, CreatureView, HerdView, HazardView, BirdView } from './simAdapter';
export { creatureLodFor, type CreatureLodSettings } from './tuning';
export { pitHeightOverlay, pitProfileUnit, pitSurfaceY, type PitOverlay, type PitShape } from './pitProfile';
