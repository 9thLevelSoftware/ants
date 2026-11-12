# FOUNDRESS — module map and build stages (orchestrator plan)

Every task has: a key, exclusive owned paths, the GDD chapters it implements, what it depends on, a model tier, and whether verification is visual (harness screenshots).
Task specs live next to this file as `<key>.md` and are executed by `wf-build.js` (implement -> independent verify -> fix).
Model tiers: **O** = Opus 5.5, **S** = Sonnet 5.5. No Fable subagents.

## Foundation
| Key | Owned paths | Content | Tier |
| --- | --- | --- | --- |
| F1a-scaffold-core | config files, `src/core/**`, `tools/sim/run-ts.mjs` | build config, core maths/rng/noise/sdf/spatial/store/serialize | O |
| F1b-contracts | `src/sim/types/**`, `src/sim/balance/index.ts`, `src/sim/sim.ts`, `src/sim/systems.ts`, `src/sim/createGame.ts`, `src/sim/save/**`, `src/sim/testing/**`, stub `index.ts` of every sim module, `src/worldgen/index.ts` (flat test world) | contracts from the GDD digest, sim skeleton that ticks, snapshot/restore, test world | O |
| F2-kernel | `src/sim/world/{field,primHash}.ts`, `src/sim/nest/carve/**`, `src/sim/nest/nav/**`, `src/sim/locomotion/walker.ts` | port of the nest spike: field f(p), carve grid, marching cubes, breaches, BFS nest nav, surface walker | O |
| F3-appshell | `src/main.ts`, `src/game/**`, `src/input/**`, `src/render/app/**`, `src/render/index.ts`, `src/render/camera/**`, `src/render/debug/**`, `src/ui/App.tsx`, `src/ui/store.ts` | Game orchestrator, loop, quality presets, post chain, asset loader, input, third-person/observer camera port, debug API `window.__game`, minimal debug rendering | O |

## Stage 1A — core infrastructure (parallel, on real foundation)
| Key | Owned paths | GDD | Depends | Tier | Visual |
| --- | --- | --- | --- | --- | --- |
| loco | `src/sim/locomotion/**` (except `walker.ts` internals), `src/sim/world/navGrid.ts` | 01, 02, dir. §J nav model | F2 | O | no |
| phero | `src/sim/pheromones/**` | 02 | F1b | O | no |
| nestops | `src/sim/nest/{entrances,chambers,plans,pellets,mound,system}*.ts` | 03 | F2 | O | no |
| worldgen-terrain | `src/worldgen/{index,params,layout,terrain,maps,validate,kit}/**` | 04 | F1b, F2 | O | no |
| colony-core | `src/sim/colony/**` | 02 | F1b | O | no |
| actions | `src/sim/ants/actions/**`, `src/sim/ants/player/**`, `src/sim/ants/lifecycle.ts` | 01, 02 | F2 | O | no |
| env-core | `src/sim/environment/{calendar,temperature,weather,system}*.ts` | 06 | F1b | S | no |
| render-world | `src/render/world/{terrain,sky,lighting,primitives,materials}/**` | 04, 08, look spike | F3 | O | yes |
| render-nest | `src/render/nest/**` | 03, 08, nest + look spikes | F2, F3 | O | yes |
| render-ants | `src/render/ants/**` | 07, 08, ants spike | F3 | O | yes |
| ui-shell | `src/ui/{styles,components,screens}/**` (title, new game, settings, save/load, pause) | 08 | F3 | S | yes |
| save | `src/game/save/**`, `src/game/settings/**` | 06, arch §7 | F1b, F3 | S | no |

## Stage 1B — first playable colony loop
| Key | Owned paths | GDD | Depends | Tier | Visual |
| --- | --- | --- | --- | --- | --- |
| beh-forage | `src/sim/ants/behaviours/{scout,forage,tend,flee}*.ts`, `src/sim/ants/perception.ts` | 02 | loco, phero, actions, colony-core, sources-core | O | no |
| beh-nest | `src/sim/ants/behaviours/{nurse,queenCare,store,dig,haul,idle,guard,queen}*.ts` | 02, 03 | loco, nestops, actions, colony-core | O | no |
| sources-core | `src/sim/ecology/sources/**` | 05 | F1b | O | no |
| architect | `src/sim/nest/architect/**` | 03 | nestops | O | no |
| worldgen-outdoor | `src/worldgen/catalog/outdoor/**`, `src/worldgen/place/outdoor/**` | 04 | worldgen-terrain | O | yes |
| worldgen-interior | `src/worldgen/catalog/interior/**`, `src/worldgen/place/interior/**` | 04 | worldgen-terrain | O | yes |
| worldgen-life | `src/worldgen/populate/**` (resources, plants, creature territories, rival sites, micro-connections) | 04, 05 | worldgen-terrain | O | no |
| render-decor | `src/render/world/{vegetation,decor,water}/**` | 04, 08 | render-world | O | yes |
| founding | `src/sim/colony/founding/**`, `src/game/flows/founding/**`, `src/ui/screens/founding/**` | 06 (opening) | actions, nestops, colony-core | O | yes |
| views | `src/render/camera/**` (takes over from F3), `src/game/views/**`, `src/render/fx/markers/**` | 01 | F3, render-nest | O | yes |
| ui-hud | `src/ui/hud/**`, `src/ui/panels/{directives,roster}/**`, `src/game/uiBridge.ts` | 08, 02 | ui-shell, colony-core | S | yes |
| packaging | `tools/build/**`, asset-pack mode of the asset loader | arch §8 | F3 | S | yes |

## Stage 2 — full sandbox (Tier 2)
| Key | Owned paths | GDD | Tier | Visual |
| --- | --- | --- | --- | --- |
| ecology-plants | `src/sim/ecology/plants/**` (herds, nectar, seasonal cycle) | 05 | O | no |
| creatures | `src/sim/ecology/creatures/**` | 05 | O | no |
| render-creatures | `src/render/creatures/**` | 05, 08 | O | yes |
| combat | `src/sim/combat/**`, `src/sim/ants/behaviours/{fight,patrol}*.ts` | 05 | O | no |
| rivals | `src/sim/rivals/**` | 05 | O | no |
| weather-effects | `src/sim/environment/{effects,moisture,flooding}*.ts`, `src/render/world/weather/**` | 06, 03 | O | yes |
| human-events | `src/sim/environment/human/**`, `src/render/world/humans/**` | 04 | O | yes |
| overwinter-repro | `src/sim/colony/{overwinter,reproduction,succession}/**`, `src/game/flows/{overwinter,flight,epitaph}/**` | 06 | O | yes |
| progression | `src/sim/progression/**` (milestones, journal, stats, codex unlocks, diagnostics aggregation, lineage record) | 06, 02 | O | no |
| ui-panels | `src/ui/panels/{health,nest,journal,codex,lineage,epitaph,markers}/**`, `src/ui/overlays/**` | 08 | S | yes |
| scent-fx | `src/render/fx/{scent,particles,overlays}/**` | 08 | O | yes |
| audio | `src/audio/**` | 08 | O | no |
| onboarding | `src/game/onboarding/**`, `src/ui/hud/prompts/**` | 08, 06 | S | yes |
| photo | `src/game/views/photo/**`, `src/ui/screens/photo/**` | 01 | S | yes |

## Stage 3 — species breadth and polish (Tier 3)
| Key | Owned paths | GDD | Tier |
| --- | --- | --- | --- |
| species-data | `src/sim/species/data/**` (four `SpeciesDef`s, climates) | 07 | S |
| species-carpenter | `src/sim/species/modules/wood/**` + behaviours + render variant | 07 | O |
| species-harvester | `src/sim/species/modules/granary/**` + behaviours (`mill`) + render variant | 07 | O |
| species-leafcutter | `src/sim/species/modules/fungus/**` + behaviours (`cut`, `garden`) + render variant | 07 | O |
| species-lasius-honeydew | `src/sim/species/modules/honeydew/**` (ranching depth beyond Stage 2 herds) | 07 | O |
| difficulty-rules | `src/sim/balance/difficulty.ts`, custom rules plumbing | 06 | S |
| input-gamepad-a11y | gamepad, rebinding UI, UI scale, reduced motion, comfort mode | 01, 08 | S |
| codex-content | codex and journal text content, manual | 06, 08 | S |
| perf | quality presets, sim LOD, profiling fixes | arch §6 | O |

## Integration gates (orchestrator + one integrator agent, after every stage)
1. `npm run typecheck` clean, `npm test` green.
2. Headless soak: N game days of autonomous play in Node, invariants hold.
3. Harness playtest scripts with screenshots reviewed by the orchestrator.
4. Git commit; source archive sent to the user at first-playable and at each later gate.
