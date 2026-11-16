// Onboarding without dialogue (GDD 08 §9): the hint engine, its table and the glue to the running game. The hint card
// itself is drawn by src/ui/hud/prompts.
export * from './balance';
export { OnboardingController, type ControllerOptions, type OnboardingGame } from './controller';
export { HintEngine, type EngineOptions } from './engine';
export { noFacts, readFacts, type FactSource, type UiFacts } from './facts';
export { EVENT_RULES } from './rules';
export { LiveHintStore, MemoryHintStore, ProfileHintStore, registerHintProfile } from './store';
export { HINT_TABLE, hintDef } from './table';
export type * from './types';
