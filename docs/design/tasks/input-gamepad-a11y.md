# Task input-gamepad-a11y — Gamepad play, rebinding polish and accessibility (Stage 3, Sonnet implement / Opus verify, visual)

## Goal
The game fully playable on a gamepad, every binding remappable from Settings, and the accessibility options the design promises working end to end: UI scale, reduced motion, colour-blind-safe overlays, spider comfort mode, hold-to-toggle options.

## Read in full
GDD 01 §5 (gamepad table, rebinding and conflict rules, input edge cases), GDD 08 (accessibility requirements; Settings controls and accessibility tabs; focus navigation rules for panels). `src/input/**`, `src/ui/**`, the settings store, the creature renderer's comfort mode, the camera rigs' reduced-motion hooks, the overlays' palettes.

## You own
`src/game/accessibility/**` (applies settings to the systems that honour them), `src/ui/nav/**` (focus/gamepad navigation layer for all panels), `tests/e2e/a11y.mjs`. Minimal, reported edits in UI components to register with the navigation layer.

## Deliverables
1. Gamepad: every gameplay action reachable; menus and panels navigable with stick/D-pad and confirm/cancel; on-screen key hints switch to gamepad glyphs when the last input was a gamepad.
2. Rebinding polish: capture UI for keyboard, mouse and gamepad, conflicts, reset, persistence.
3. Accessibility options applied live: UI scale 80-150 %, reduced motion (camera sway, shake, depth-of-field strength, UI transitions), colour-blind-safe palettes for overlays and status colours, spider comfort mode, hold-to-toggle for held actions, pause anywhere.
4. A focus-order audit of every screen and panel with fixes.

## Acceptance criteria
1. Typecheck and tests green.
2. `tests/e2e/a11y.mjs` with a virtual gamepad: start a game, possess an ant, walk, dig, open Directives and change a slider, save — using only gamepad input.
3. Screenshots, looked at: gamepad glyph hints; UI at 80 % and 150 %; overlays in the colour-blind-safe palette; comfort mode on.
4. With reduced motion on, camera shake and sway amplitudes are zero and transitions are instant (asserted through the debug API).
5. No console errors.
