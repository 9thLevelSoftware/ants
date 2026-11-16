// UI-only state of the hint card: the hint the engine wants drawn, and the controller behind it (null until the game
// exists). Nothing here is game state and nothing is persisted (hint progress is the profile's).
import { signal } from '@preact/signals';
import type { HintView, OnboardingController } from '@/game/onboarding';

export const hintView = signal<HintView | null>(null);
export const onboarding = signal<OnboardingController | null>(null);
