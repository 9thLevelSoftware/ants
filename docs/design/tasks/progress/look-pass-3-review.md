# look-pass-3 review — progress

Started 2026-11-18 02:30 UTC. Reviewer (adversarial), no production edits. Base commit of the task: 3475a5f (spec launch); code is in HEAD.

## Done
- read spec, seed, architecture, tech-stack s7, impl report; read full diff 3475a5f..HEAD on owned paths
- typecheck clean (02:35); vitest on touched folders: 90 files, 682 passed / 1 skipped

- photo quick PASS (02:41, test-output/look3-review/photo, photo.json); looked at 00-possession, crops crop-leaf-queen*.png
- look3 shots rev-* (02:5x, test-output/look3-review/shots): noon observerlow/close, night surface/close/gyne, night-rain close, night close test; all looked at

## In progress
- stage1a strict full (no SKIP_HIGH) -> test-output/look3-review/stage1a.log/json (background); meanwhile write verify tests (do NOT run vitest while it runs)

## Remaining (in order)
1. photo quick; stage1a strict (no SKIP_HIGH); look3 shots (night surface/close, gyne night, noon observerlow) and look at them
2. verify tests (*.verify.test.ts) in src/render/camera, src/ui/nav, src/input, src/ui/screens/newgame
3. StructuredOutput

## Findings so far (candidate)
- CONFIRMED visual: leaf contact fringe = black salt-and-pepper stipple filling lobe sinuses (crop-leaf-queen.png vs crop-leaf-queen-old.png)
- CONFIRMED visual: gyne wings at night = bright white blob (look3/after/after2-night-gyne-high.png, crop-gyne-after2.png)
- CONFIRMED: founding queen at day still glass-bulb/see-through (photo 00-possession, same before/after; gate S14 remainder)
- stage1a strict not passing; textures-growth cause is in src/render/** which the implementer OWNS (deferred to "render-app owner")
- report defers leaf hug rule / dry-leaf night albedo / prim material to "other owners" but src/render/** is theirs
- mound rag: discard up to 1.35 mm of pile -> visible mound foot below collision height (ants float); sin-hash on world mm coords
- radiusMm redefined to shrunk radius: GDD 01 6.1 CAM_RADIUS deviation; report says "eased back 0.5 s" but code has no easing
- observerAfterColony test checks follow flag only, not the camera pose (the actual bug)
- wing alpha x2.4 at night: membrane 0.07 -> 0.168 (their own comment: 0.16 read as milky)
- time.auto-slow GDD 06 payload {trigger, action}; contract type has alertKind/level/action (OK by contract)
