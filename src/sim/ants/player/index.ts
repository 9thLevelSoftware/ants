// Player side of the ant module: possession, release inference, player control, prompts, inspect read-outs.

export { actionCommand, noteInput, playerControlSystem, setTrailCommand, startPlayerAction } from './control';
export { CTL, resetControlState } from './controlState';
export { inspectTarget, type InspectCard, type InspectKind, type InspectRow } from './inspect';
export { antForRole, possess, release, releasePossessed } from './possession';
export { currentPrompt, objectName, promptView, type PromptInput, type PromptLine, type PromptView } from './prompt';
export { applyInference, digFrontierDistance, inferRelease, reinferAfterLanding, type ReleaseInference } from './release';
export { promptCandidates, selectedCandidate, updatePromptSelection, type PromptCandidate, type PromptClass } from './targeting';
