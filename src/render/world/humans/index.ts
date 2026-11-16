// Human-event rendering (GDD 04 §15, GDD 08 §11.7): the HumansRenderer sub-renderer, its pure pose sampling and the
// camera tremor helper for possession views and demos.
export { HumansRenderer } from './HumansRenderer';
export { samplePose, planTime, type ActorPose } from './pose';
export { tremorShake, type TremorShake } from './tremor';
