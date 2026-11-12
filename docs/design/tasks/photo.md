# Task photo — Photo mode (Stage 2, Sonnet implement / Opus verify, visual)

## Goal
A quiet tool for looking: freeze time, fly the camera, control lens and focus, hide the interface, and capture an image — including on hosts that block downloads.

## Read in full
GDD 08 (`docs/design/gdd/08-ui-ux-art-audio.md`): photo mode controls and options. GDD 01 §6 (photo rig limits and inputs; photo mode is F2). `src/render/camera/**` (the photo rig exists), `src/render/app/**` (post chain hooks for depth of field, exposure, vignette), `docs/03-architecture.md` §8 (downloads may be blocked: offer an in-page preview with "open in new tab" and copy-to-clipboard fallbacks, each guarded).

## You own
`src/game/views/photo/**`, `src/ui/screens/photo/**`, `tests/e2e/photo.mjs`. Minimal, reported changes to `src/game/views` wiring if required.

## Deliverables
1. Entering and leaving photo mode from any play view with time frozen and state restored on exit.
2. Controls: fly/orbit within the rig's limits, focal length, aperture (depth of field), focus distance with click-to-focus, exposure, roll, composition guides, HUD hidden, optional scent view and overlays toggles.
3. Capture at the canvas resolution and at a higher internal resolution when the GPU allows; output as PNG through download, with fallbacks (preview panel with open-in-new-tab link, clipboard write) when downloads are blocked.
4. Works with the possessed ant as the default subject and with any picked target.

## Acceptance criteria
1. Typecheck and tests green (state save/restore, parameter clamping).
2. `tests/e2e/photo.mjs`: enter photo mode, change lens and focus, capture; the captured image (looked at) is correctly exposed, shows depth of field on the subject and no HUD; exiting restores the previous view and resumes time.
3. With downloads blocked (simulated), the fallback path produces the image without errors.
4. No console errors; works in the classic single-file build.
