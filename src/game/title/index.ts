// The title screen's live backdrop (GDD 08 §3.3, render-integration) and scripted look-check read-outs.
export { TitleHost, titleQualityCap, titleSceneWanted, TITLE_STILL_SETTLE_FRAMES, type TitleHostDeps } from './titleHost';
export { makeTitleSim, makeTitleWorld, titleSubject, TITLE_LAYOUT, TITLE_SEED } from './titleWorld';
export { titlePose, driftOffsetBU, TITLE_CAMERA } from './titleCamera';
export { registerScenicQueries, lawnSpot, edgeView } from './scenicQueries';
