# look-pass-4 impl progress (started 2026-11-18 10:38 UTC)
## Scripts (mine, in tests/e2e): look4-recon.mjs (hide named parts via layers; HIDE_PARTS=prefixes), look4-pose.mjs (opening + from-above shots), look4-prims.mjs (scratch)
Harness run ~60-90 s each: node tools/harness/play.mjs --root . --query "test=1&seed=3&autostart=1&quality=high" --script <s> --out test-output/look4/<dir> --timeout 600000 --script-timeout 900000
## Findings
- Item 1 cause: the pale slab is a single draped LEAF (decor:draped mesh, kind 0 fresh maple atlas, len 60-110 mm) in src/render/world/decor/drapedMaterial.ts (dcItem leaf branch). Atlas is 256 px/cell so at ant eye it is a blurry flat green, edge from alpha is smooth. Fix = procedural veins + ragged edge + high-frequency mottle in the leaf branch (not terrain, not prim).
- Hiding unnamed meshes by visible= does not stick; use o.layers.set(5).
- orbit(0,-75) looks down; KeepHUD: KeyH did not hide HUD in my scripts.
## Done
(nothing finished yet)
## Remaining
1 fix leaf, check other ground patch kinds x5 archetypes (med+high); 2 far structures; 3 bare ground low tier; 4 minimap; 5 possession camera; 6 wording/overlap; 7 first read-out; 8 README; 9 e2e; report docs/design/tasks/look-pass-4-report.md
