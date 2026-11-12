// Camera rigs: pure maths (Node-testable) plus one three adapter (applyPose).
export * from './types';
export * from './constants';
export { makeSphereTracer, type FieldFn, type TraceOptions } from './sphereTrace';
export { ThirdPersonRig, makeTarget, type ThirdPersonOptions, type ThirdPersonEnv, type ThirdPersonOutput } from './thirdPersonRig';
export { STATE_PARAMS, type Framing, type StateParams } from './possessionStates';
export { ObserverRig, type ObserverEnv, type ObserverInput, type ObserverOptions } from './observerRig';
export { ColonyRig, type ColonyEnv, type ColonyInput, type ColonyOptions, type CutawayMode, type CutawayParams } from './colonyRig';
export { PhotoRig, fNumberAt, focalForFov, fovForFocal, type PhotoInput, type PhotoOutput } from './photoRig';
export { CameraTransition, blendPoses, planTransition, poseDistance, type TransitionKind, type TransitionOutput, type TransitionPlan } from './transition';
export { cameraNear } from './near';
export { targetOpacity } from './fade';
export { applyPose } from './applyToThree';
