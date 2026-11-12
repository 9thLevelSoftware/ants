# FOUNDRESS TDD 01 — Contracts map (F1b, synchronised and FROZEN by F1c)

**Status.** F1b wrote sections (a)-(d) from the GDD digests. F1c applied every contract-affecting decision of
`docs/design/gdd/00-index.md` §D and the orchestrator's rulings; section (a)-(c) entries were updated in place where a
name changed, sections (d)-(g) are F1c's record. After F1c the contracts are FROZEN: additive changes only (new
optional fields, new union members appended, new helpers); renames and removals need the orchestrator.

Maps every "state required", command, event and diagnostic item of the eight GDD digests (`docs/design/gdd/digests/`;
digest 07 did not exist yet when `types/species.ts` was written, so GDD 07 §3 and Appendices A–D were read directly; the
digest has since appeared and a field-by-field cross-check against it is left to species-data) to the type or field that represents it in
`src/sim/types/**`, or marks it **deferred** with a reason. Then: naming conflicts resolved (b), PROVISIONAL items (c),
the systems in tick order (d) and questions for the orchestrator (e).

Code map (all under `src/sim/` unless stated):

| Concern | Files |
| --- | --- |
| Identifier sets (union + `as const` array each) | `types/ids.ts` (directions §J), `types/ids/{ants,nest,world,ecology,progression,species}.ts` |
| Entities | `types/{ant,brood,item,source,plant,creature,nest,marker,colony,colonyModules}.ts`, shared `types/{refs,walker}.ts` |
| Root state | `types/state.ts` (`SimState`), `types/{environment,player,progression,diagnostics,ecology,pheromone,world}.ts` |
| Static data / config | `types/world.ts` (`WorldData`, `WorldDelta`), `types/species.ts`, `types/config.ts` |
| Messages | `types/commands.ts`, `types/commandsCheat.ts`, `types/events*.ts`, `types/intent.ts` |
| Runtime | `types/services.ts` (`Sim`, `System`, services), `types/moduleApi.ts` (shapes passed between module APIs) |
| Skeleton | `sim.ts`, `systems.ts`, `services.ts`, `commands.ts`, `createGame.ts`, `time.ts`, `entities/**`, `save/**`, `testing/**`, `balance/**`, `species/**`, `../worldgen/{index,params}.ts` |

Conventions applied everywhere: plain data only; `-1` = no id, `null` = absent value (never `undefined`, never missing keys
in persisted objects); ticks for durations; units in field comments; additive evolution only.

---

## (a) Coverage

Legend: `→ X` = represented by X. **deferred** = intentionally not in the contracts yet, with the reason and the owner.

### GDD 01 — modes, possession, controls, camera, actions

State (App. A)

| Item | Representation |
| --- | --- |
| `state.player.possessedAntId`, `previousAntId`, `returnAntId` | `PlayerState.possessedAntId / previousAntId / returnAntId` |
| `state.player.intent` | `PlayerState.intent: PlayerIntent { dir, hurry, grip, held: ActionId[], flight: FlightIntent \| null }`. `mag` is folded into `|dir|`; `held.{dig,bite,special,interact,inspect}` becomes the list of held ActionIds (the game layer maps keys to the species' action ids). |
| `state.player.lastInputTick`, `promptLearned` | `PlayerState.lastInputTick`, `PlayerState.promptLearned` |
| `state.time.speed` / `.paused` | `env.time.speed: RunSpeed` (1/2/4/8) + `env.time.paused` (`TimeControlState`, owned by GDD 06; ruling 6) |
| `ant.controlled` | `Ant.flags & AntFlag.POSSESSED` |
| `ant.suspendedTask` | `Ant.suspendedTask: Task \| null` |
| `ant.action` | `Ant.action: ActionInProgress { id, phase, startTick, durationTicks, target, repeat, secondary, reason }` (`t` derives from `startTick`) |
| `ant.trailOn` | `Ant.flags & AntFlag.TRAIL_ON` |
| `ant.acid`, `ant.acidRegenT` | `Ant.acid`, `Ant.acidRegenTick` (absolute tick, D2.11) |
| `ant.layCooldownT` | `Ant.layCooldownUntilTick` (D2.11) |
| `ant.dirt` | `Ant.dirt` |
| Game view, camera rig, input, settings | **deferred**: game layer (`src/game`, `meta.view`, `meta.camera`, localStorage), not SimState |

Commands (App. B)

| Item | Representation |
| --- | --- |
| `possess {antId}` | `{ type: 'possess', antId?, role?, nearPos?, via?, dropTo1x? }` (D4.7: exactly one of antId / role; the sim resolves a role to the nearest suitable ant to `nearPos`). Possession start (not a switch between ants) forces 1x, or clamps to 4x when the game passes the player's `dropTo1xOnPossess = false`; a pause stays a pause; `requested` follows (release does not restore) → `time.speed-changed` reason `possession` |
| `release {reason}` | `{ type: 'release', reason: ReleaseReason }` |
| `set-intent` | `{ type: 'setIntent', intent }` and `sim.setPlayerIntent(intent)` |
| `act {action, target, secondary, phase}` | `{ type: 'action', action, target: TargetRef \| null, secondary, phase }` |
| `set-trail {on}` | `{ type: 'setTrail', on }` |
| `set-speed {level}` | `{ type: 'setSpeed', speed: 0\|1\|2\|4\|8 }` (0 sets `paused`; 8x refused while possessing and > 2x in opening phases search..lay → `speed-refused`) |
| `skip-ahead` | `{ type: 'skipToNextEvent' }` (GDD 06 name; the loop itself is game-level) |
| `view.set`, `camera.*`, `photo.capture`, `bindings.*`, `settings.set` | **deferred**: game-level intents, not sim commands |
| Commands while paused | `sim.applyPendingCommands()` |

Events (App. C)

| Item | Representation |
| --- | --- |
| `possession-started`, `possession-ended`, `possess-rejected`, `possessed-ant-died` | same names, `eventsColony.ts` |
| `action-started/-completed/-failed/-cancelled` | same names (`result` = loads moved or voxels carved, a number) |
| `trail-toggled`, `speed-refused`, `ant-unstuck` | same names |
| `speed-changed` | → `time.speed-changed` (GDD 06 owns time) |
| `view-changed`, `camera-state-changed`, input/pointer/gamepad, `photo-captured`, `inspect-opened` | **deferred**: game-level events |

Diagnostics (App. D): `diag-possessed-movement`, `diag-possessed-action`, `diag-possession-availability`,
`diag-released-ant`; input and time speed are merged into GDD 08's `diag-input` / `diag-perf` (D6.7). All in `DIAGNOSTIC_IDS`, record shape `Diagnostic`.

Identifiers: action ids `ACTION_IDS`, phases `ACTION_PHASES`, failure reasons `ACTION_FAIL_REASONS`, possess rejected
`POSSESS_REJECT_REASONS`, release `RELEASE_REASONS`, possession end `POSSESSION_END_REASONS`, `POSES`, death causes
`lost`/`dispersed` in `DEATH_CAUSES`, item kinds in `ITEM_KINDS`. Screens, views, camera states, cutaway modes, input
contexts, input action ids, settings keys, storage keys, `sfx.*` file names: **deferred** to the game/UI/audio layers
(not simulation data). `sfx.*` cues map to `CUE_IDS` + `cue.variant` (material / item class).

### GDD 02 — colony simulation

State (App. A)

| Item | Representation |
| --- | --- |
| `colonies[]` `id, speciesId, queenId` | `Colony.id, species, queenId` |
| `entranceIds[]` | via `Colony.nestIds` → `Nest.entrances` (entrances belong to nests) |
| `stores {C,P,toxin,inCrops}` | `Colony.stores: ColonyStores { c, p, toxin, inCrops: {c, p}, cap: {c, p} }` (D2.15) |
| `ledger {in, out, transit}` | `Colony.ledger: ColonyLedger` (flattened per nutrient) |
| `needs {rateC,rateP,needC,needP,sP}` | `Colony.needs: ColonyNeeds` (+ `proteinDeficit`, GDD 05) |
| `starvationStage`, `starvationSince` | `Colony.starvationStage`, `starvationSinceTick` |
| `directives {allocation,diet,production,architect,stockTarget,stayIn,stayInUntil}` | `Colony.directives: Directives` |
| `alloc {demand Float32Array(17), target, actual, lastTick}` | `Colony.alloc: AllocationState` (arrays sized `TASKS.length`, now 18 with `raid`) |
| `yieldPerForager`, `news[5]`, `knownSourceIds`, `exploredBits` | `Colony.yieldPerForager`, `news: SourceNews[]`, `knownSourceIds`, `exploredBits` (empty until the scouting module sizes it) |
| `jobBoard` | **deferred**: derived runtime cache of colony-core |
| `counters` | `Colony.counters: ColonyCounters` |
| `series` | `ProgressionState.history` (`HistoryState`: hourly ring of 168 per series, daily unbounded `number[]`; ids `HISTORY_SERIES_IDS`) |
| `ants[]` fields | `Ant`: `colonyId`→`colony`, `scale`→`lengthBu`, `physioAge`→`physioAgeGd`, `lifespan`→`lifespanGd`, `health`→`hp/maxHp`, `crop`→`cropC/cropP`, `reserve`→`energy` (C loads, 0..RESERVE_CAP of the age band), `fatigue`, `task`, `state`, `stateT`→`stateTick`, `target`, `carry`, `thresholds: Float32Array`, `activation`, `lead`→`mem.lead`, `homeVec`→`mem.homeVec`+`homeVecErr`, `crumbs`→`mem.crumbs/crumbHead/crumbLen`, `routes`→`mem.routes: RouteMemory[]`, `depleted`→`mem.depleted`, `decisions`→`mem.decisions` |
| queen extras | `Ant.queen: QueenState { mode, gut: {c, p}, reserve, reserveP, fecundity, eggBudget, layingLog: Int16Array(days per year), clutchLaid, founding }` (D1.18) |
| `brood[]` | `Brood` (`progress` is 0..1 within the stage, not DU; `hungerT`→`hungerTicks`, `pStarveT`→`pStarveTicks`; `pos` + `carriedBy`) |
| `items[]` | `Item` (kinds reconciled, see (b)); `carrierIds` (D2.19; no separate `carriedBy`); `diedTick`→`createdTick` of the corpse item |
| `markers[]` | `Marker` (`params.targetChamberId / sourceChamberId`, `expiresTick`) |
| `phero` | `PheromoneState { cell, chunkCells, layers: PheromoneLayer[] (colony, channel, keys, chunks), lastDecayTick }` |
| `colonyRng` | `SimState.rngStreams` (named streams `RNG_STREAMS`, `sim.stream(name)`) |
| Derived caches (ant hash, job board, brood scores, capacity) | `EntityIndex` service; the rest **deferred** to their module runtime caches |

Commands (App. B): `setDirectives` → flat directive keys (D4.9); `placeMarker` → `{ kind, pos, radius?, chamberIds?, params? }`; `removeMarker {markerId}`; possession commands as GDD 01; cheats `cheat.addFood`,
`cheat.spawnAnts` (+ `caste`), `cheat.spawnBrood`, `cheat.setChamberClimate`, `cheat.setQueen`, `cheat.injectReturn`
(each takes the colony id). Queries `query.ant/brood/colony/phero/ledger` and `summary().colony`: **deferred** to the
debug API (read-only views over state; F3 app shell).

Events (App. C): `ant-eclosed`, `ant-died` (payload merged with GDD 05: `antId, colonyId, cause, pos, task, caste`),
`egg-laid`, `brood-stage`, `brood-died`, `brood-moved`, `feed` (`broodId` −1 when the receiver is an ant), `trophallaxis`,
`delivery` (+ `colonyId`, `toxin`), `recruit`, `forager-departed`, `food-source-discovered` (D5.1),
`trail-established`, `trail-lost`, `route-learned`, `task-changed`, `stores-full`, `starvation-stage`, `cannibalism`,
`corpse-removed`, `waste-dumped`, `alarm-raised` (merged with GDD 05: `colonyId, pos, strength, by, source`),
`coop-transport` (phases + `stalled`), `marker-response`; `diagnostic-changed {id, status, topCause}` (D5.2).

Diagnostics (App. D): `food-intake-c`, `food-intake-p`, `stores`, `brood-growth`, `egg-laying`, `queen-condition`,
`workforce`, `foraging-trails`, `defence`, `mortality`, `hygiene`. Alerts `food-c-low`, `food-p-low`, `brood-stalled`,
`trail-lost`, `source-found`, `colony-starving`, `stores-full`, `queen-died` in `ALERT_KINDS`. Time-series ids: string
`HISTORY_SERIES_IDS` (registry B6; series are created lazily).

Identifiers: `ALLOCATION_GROUPS`, `AGE_BANDS`, ant flags → `AntFlag`, brood flags → `BroodFlag`, `QUEEN_MODES`,
`METABOLIC_CLASSES`, `BEHAVIOUR_STATES`, `NURSERY_JOBS`, `STARVATION_STAGES`, `BROOD_DEATH_CAUSES`, `DEATH_CAUSES`,
`WASTE_KINDS`, `REASON_CODES` (+ template forms `deficit:<task>`, `marker:<kind>`, `job:<kind>`), `STOCK_TARGETS`. Remedy ids:
template type `RemedyId` (`remedy.<kind>.<value>`), values chosen by the publishing module.

### GDD 03 — nest and excavation

State (App. A)

| Item | Representation |
| --- | --- |
| `worldDelta.carve.chunks` | `WorldDelta.carve: CarveData` (geom.ts: parallel `keys` / `chunks` + `breaches`; kernel-owned encoding). Per-voxel `flags` array: **deferred** to F2-kernel/nestops (see question 2) |
| `worldDelta.naturalOwners` | `WorldDelta.naturalOwners: Record<string, number>` |
| `nests[]` | `Nest { colony, kind, parentNestId, origin, substrate, entrances, chambers, digPlans, moundIds, architect, flood, founding, collapse, volumeOpen }` |
| `Entrance` | `Entrance { kind, status, pos, dir, radius, moundId, rimTarget, plugVoxelCount, createdTick, trafficIn, trafficOut }` |
| `Chamber` | `Chamber` (all App. A fields; `capacity`/`occupancy: ChamberLoad`; `flags` = `CHAMBER_FLAGS` bits from GDD 07) |
| `DigPlan` | `DigPlan` (7.1 record; `spheres: PlanSphere[]`, `slots: DigSlot[]`, `geom: PlanGeom`) |
| `ArchitectState`, `FloodState`, `FoundingDigState`, `CollapseWarning` | `ArchitectState`, `FloodState`, `FoundingDig`, `CollapseWarning` (`region` flattened to `center, radius`) |
| `mounds` | `WorldDelta.mounds: Mound` (`center [x,z]` → `centerX, centerZ`) |
| soil-pellet / frass item extras | `Item.volume, material, droppedTick, inNest, spoilPlanId, reservedBy` |
| `Ant.bb` dig keys | `Ant.bb` (`planId, slotIdx, spoilTarget, pelletId` as numbers) |
| `world.naturalCavities` | `WorldData.cavities: NaturalCavity` (`bbox` → `min/max`; owner → `WorldDelta.naturalOwners`) |
| `world.soilProfiles` | `WorldData.ground: GroundLayers` (surface + crust + subsoil). Multi-layer profiles **deferred** to worldgen-terrain (add `soilProfiles` additively if needed) |
| Caches (clearance, distance fields, H*, pellet index) | **deferred**: derived caches of F2-kernel / nestops |

Commands (App. B): `planDig {spec: PlanSpec}`, `cancelPlan`, `setPlanPriority`, `pausePlan`, `resumePlan`, `acceptPlan`,
`designateChamber {chamberId, chamberType}`, `setAutoExpand {nestId, mode}`, `setArchitectNeed`, `sealEntrance`,
`reopenEntrance`; player actions through `action`. Queries: `validatePlan` → `nest.validatePlan(sim, spec):
PlanValidation`; `siteAt` → `nest.siteAt(sim, p): SiteReport | null`; `nest(id)`, `voxel(p)`, `field(...)`,
`microclimate(p)`, `flood(nestId)`, `mound(id)`: **deferred** to module query functions / debug API. Cheats:
`cheat.carveSphere`, `cheat.carveEllipsoid`, `cheat.fillSphere`, `cheat.instantPlan`, `cheat.setSoilMoisture`,
`cheat.setRain`, `cheat.setDrainScale`, `cheat.setChamberClimate`, `cheat.spawnPellets`, `cheat.completeFounding`,
`cheat.setFoundingState`.

Events (App. C): all present in `eventsNest.ts`: `carve-chunks-dirty`, `breach`, `pellet-created`, `pellet-expelled`,
`pellet-dumped`, `mound-changed` (`bbox` → `min/max`), `entrance-opened`, `entrance-state-changed`, `plan-created`,
`plan-rejected`, `plan-status-changed`, `plan-progress`, `plan-complete`, `architect-proposal`, `chamber-registered`,
`chamber-changed`, `chamber-removed`, `chamber-designated`, `command-rejected`, `natural-cavity-joined`,
`foreign-cavity-contact`, `founding-readiness`, `founding-ready`, `founding-sealed`, `founding-reopened`, `flood-started`,
`flood-level`, `flood-ended`, `ant-submerged`, `brood-drowned` (drowning deaths are `ant-died {cause: 'drowning'}`, D5.5), `collapse-warning`, `collapse`,
`nest-milestone`, and `cue` (`eventsProgression.ts`).

Diagnostics (App. D): `diag-dig-progress` (per plan: id `diag-dig-progress:<planId>`), `diag-nest-space`, `diag-nest-climate`, `diag-nest-flood`,
`nest-stability`, `nest-traffic`. Alerts `entrance-breached`, `dig-stalled`, `nest-crowded`, `nest-flooding`,
`nest-collapse-risk`.

Identifiers: `insulation` material (appended to geom `MATERIAL_IDS`), item kinds `soil-pellet`, `frass`; `VoxelFlag`;
`CAVITY_KINDS` (see (b)); `ENTRANCE_KINDS`, `ENTRANCE_STATUSES`, `NEST_KINDS`, `PLAN_KINDS`, `PLAN_STATUSES`,
`PLAN_SOURCES`, `PLAN_PRIORITIES` (weights in `balance/nest.ts`), `CHAMBER_SIZES`, `PLAN_VALIDATION_CODES`,
`PLAN_BLOCKED_REASONS`, `ARCHITECT_NEEDS`, `FOUNDING_DIG_STATES`, digger/hauler states in `BEHAVIOUR_STATES`
(`dig.*`, `haul.*`), `PELLET_DUMP_TARGETS`, `NEST_MILESTONE_KINDS`, `DESIGNATED_BY`, `NEST_FIELD_KINDS`
(`D_exit/D_seal/D_ch/D_plan`). Cue ids `seal-tamp`, `mound-slump`, `water-trickle` in `CUE_IDS`; `dig-bite.<material>`
→ `cue: 'dig-bite', variant: material`; `collapse-rumble` → `collapse`, `pellet-drop` kept.

### GDD 04 — world, habitats, generation, human activity

State (App. A)

| Item | Representation |
| --- | --- |
| `WorldParams` | `types/config.ts WorldParams { generatorVersion, seedText, seed, speciesId, archetype, region, sizeClass, difficulty, rivalCount, incipientCount, humanActivity }`; `startSeason/startDoy` → `GameConfig.startSeason/startDayOfSeason/startHour`; `rules{}` → `GameConfig.rules: CustomRules` |
| `WorldMeta` | `WorldData.meta { fingerprint, attempts, repairs, disabledEvents }`; `timingsMs` **deferred** (wall-clock data is non-deterministic; log it, do not store it) |
| `WorldStatic.zones` | `WorldData.zones: ZoneDef[]` + `maps.zone: ByteMap` |
| `.height` + `terrainHole` | `WorldData.terrain: HeightField` + `terrainHoles?: ByteMap` (kernel contract) |
| `.strata` | **deferred** to worldgen-terrain (T1 uses `GroundLayers`) |
| `.prims` (SoA) | `WorldData.prims: Primitive[]` (orchestrator's geom.ts, AoS); the kernel builds its SoA spatial hash (`primHash`) |
| `.objects` | `WorldObject { templateId, pos, rot, primStart, primCount, tags, routeIds, poiIds }`; `socketIds` **deferred** (worldgen catalogue) |
| `.routes`, `.pois` | `WorldData.climbRoutes: ClimbRoute[]`, `pois: Poi[]` |
| `.micro` | `WorldData.micro: MicroConn` (`mouths[2]` → `posA/posB`) |
| `.nav` | `WorldData.nav { cls, cost }`; `groundY`, per-cell flags and route/portal edge lists **deferred** to loco / worldgen-terrain |
| `.maps` | `WorldMaps { zone, moisture, shade, shelter, floodRisk, exposure, suitability }`. Time-slotted shade (`shade u8[7×cells]`), `catchArea`, `puddleCapMm`, access maps: **deferred** to worldgen-terrain (additive fields) |
| `.lanes`, `humanNodes` | **deferred** to human-events / worldgen-terrain (add `WorldData.lanes` additively) |
| `.waterBodies` | `WorldData.waterBodies: WaterBody` |
| `SimState.world.heightDeltas`, `.grassHeightMm`, `.dynPrims`, `.microState`, `.waterLevels` | `WorldDelta.heightDeltas`, `grassHeightMm` (Uint16Array), `dynPrims` (+ `objectStates` for moved/opened objects), `microState`, `waterLevels` |
| `SimState.human`, `HumanEventInst`, `HumanEventRun`, `Cue` | `env.human: HumanState`, `HumanEventInst`, `HumanEventRun`, `HumanCue` |
| Initial entities: `FoodAnchor`, `Territory`, rival seeds, queen start | `WorldData.placements { foodAnchors, plants, territories, rivalSites }`, `WorldData.queenStart: StartPose` |
| Pre-existing cavities / copy-on-write chunks | `WorldData.preCarve: PreCarveOp[]` applied by `createNewGame` with `force`; the `preexisting` voxel flag is **deferred** with the voxel flags |

Commands: `world.generate` / `world.preview` → `generateWorld(params)` (pure function, `src/worldgen`); `world.inspectPoint`,
`query.world.*`, `world.forceValidationFail`: **deferred** to worldgen / debug API; `rules.setHumanActivity` →
`setDifficulty {custom: {humanActivity}}` (D4.18); cheats `cheat.humanEvent`, `cheat.setGrass`, `cheat.setWater`, `cheat.revealMicro`.

Events: `worldgen.progress`, `worldgen.retry`, `worldgen.complete`, `world.micro-discovered`, `world.zone-first-entry`,
`world.terrain-deformed` (`cells bbox` → `min/max`), `world.cave-in`, `world.dynprim-changed`, `world.grass-mown`,
`human.scheduled` (`list` → `instIds`), `human.telegraph`, `human.start`, `human.end`, `human.cancelled`, `human.impact`,
`human.casualties`, `human.bait-placed`, `human.bait-removed` — all in `eventsWorld.ts`; `sound.cue` → `cue` with `giant.<event>` ids (D5.6).

Diagnostics: `diag-site`, `diag-human-pressure`, `diag-access`, `diag-connections`, `diag-bait`, `diag-exposure`.

Identifiers: `ARCHETYPES`, `REGIONS`, `WORLD_SIZES`, `ZONE_VARIANTS`, `plaster` (geom), `FOOTSTEP_CLASSES`, `MICRO_KINDS`,
`CAVITY_KINDS`, `POI_KINDS`, `CLIMB_ROUTE_KINDS`, `NAV_CLASSES`, `WATER_BODY_KINDS`, `DECOR_LAYERS`, `WORLDGEN_CHECKS`,
`HUMAN_VARIANTS` (one flat set, registry B5; F1b's `street-broom` removed, the street broom is variant `broom`), `HUMAN_CUE_KINDS`,
`AMBIENT_STATES`, `SUITABILITY_CLASSES`, `SUITABILITY_FACTORS`, `HOST_FLAGS`. Object template ids, repairs `R1..R5`, RNG
labels `wg/*`: **deferred** to the worldgen catalogue (content strings; `WorldObject.templateId: string`).

### GDD 05 — ecology, creatures, rivals, combat

State (App. A)

| Item | Representation |
| --- | --- |
| `ecology.sources` | `SimState.sources: FoodSource` (`units`; `pool`, `poolCap`, `refillPerGd`, `quality`, `hardness`, `slots`, `drinkRateMult`, `stage`, `stageClock`, `discoveredBy`, `avoidBy`, `spawnedTick`, ...) |
| `ecology.herds` | `SimState.ecology.herds: Herd` (`A`→`a`, `E`→`e`, `tenderSeconds: Float32Array(8)`) with a `herds` store |
| `ecology.hostPlants` | `SimState.plants: PlantState` (`herdIds`) |
| `ecology.preyPatches`, `ecology.hazards` | `EcologyState.preyPatches: PreyPatch`, `hazards: Hazard` |
| `ecology.items` extension | `Item` fields `lengthMm, massMg, hardness, carrierIds, stage, stageClock, necroCueTick, species, colony, unreachableBy, aliveUntilTick, toxin, water` |
| `ecology.director` | `EcologyState.director: CreatureDirector` |
| `ecology.birdEvent`, `lastBirdTick` | `EcologyState.birdEvent: BirdEvent \| null`, `lastBirdTick: Record<colonyId, tick>` |
| `ecology.carrionAcc` | `EcologyState.carrionAcc: Float32Array` |
| `creatures` | `Creature extends Walker` (`health` → `hp/maxHp`; `homeCenter, homeRadius, deterrence, harass, seizedAntId, eaten, lifeEndTick, nestId`) |
| `rivals` | `Colony` with `fidelity: 'abstract'` and `Colony.rival: RivalAbstract { n, b, cS, pS, agg, knowsNest (bitmask), orphaned, incipient, raid, lastRaidTick, fieldedIds, virtualTend, territorySlot }` |
| `relations` | `SimState.rivals.relations: RivalRelation` (`E` → `e`) |
| `territory` | `SimState.rivals.territory: TerritoryGrid` (`marks` empty until the rivals module allocates) |
| `danger` | `Colony.danger: Float32Array` (player colony; empty until allocated; D1.16) |
| `threatDirector` | `SimState.rivals.threatDirector: ThreatDirector` |
| Ant combat fields | `Ant.hp/maxHp`, `Ant.injuries` (bits), `Ant.acid`, `Ant.acidRegenTick`, `Ant.alarmLevel`; `CombatState.{biteCdTick, specialCdTick, dodgeCdTick}`; fight-time fields `lock`, `heldBy`, `pinned`, `seizedBy`, `escape`, `paralysedUntilTick`, `stuckSinceTick`, `disorientedUntilTick`, `dodgeUntilTick`, `fightDamage`, `recentHitters` → `Ant.combat: CombatState \| null` |
| Colony `toxinPool`, `stance` | `ColonyStores.toxin`, `Directives.stance` |

Commands: player intents `bite`, `bite-hold`, `special`, `special-hold`, `dodge {dir}`, struggle → `action` command with
`bite`/`bite-hold`/species special/`dodge` (+ `PlayerIntent.held`); `act` carry-aphid/put-down/tend-aphid/cull-aphid →
`action`; `place-marker rally {mode}` → `placeMarker { mode }`; `set-directive {stance}` → `setDirectives { patch.stance }`;
cheats `cheat.spawnCreature`, `cheat.spawnFood`, `cheat.setHerd`, `cheat.setRival`, `cheat.setRelation`,
`cheat.triggerRaid`, `cheat.triggerBird`, `cheat.triggerNestInvasion`, `cheat.killQueen`, `cheat.combatFlags`;
`query.ecology/rivals/territory/creature`: **deferred** to the debug API.

Events: all in `eventsEcology.ts`: `food-source-spawned/-discovered/-exhausted/-removed`, `carrion-stage-changed`,
`herd-founded/-collapsed/-dormant/-hatched`, `herd-predator-arrived/-repelled/-left`, `aphid-moved`, `aphid-culled`,
`prey-subdued`, `prey-escaped`, `coop-transport-started/-stalled/-delivered` → `coop-transport { phase }` (GDD 02),
(`carcass-butchered` → `coop-transport` phase `cut`), `creature-spawned/-despawned/-died`, `predator-telegraph`, `predator-strike`,
`ant-seized/-freed/-paralysed/-stuck`, `antlion-flick/-grab`, `bird-approach/-landed/-peck/-left`, `rival-encounter`,
`rival-relation-changed`, `rival-raid-started/-ended`, `brood-raided`, `rival-queen-killed/-orphaned/-destroyed/-founded`
(→ `rival-queen-killed`, `rival-orphaned`, `rival-destroyed`, `rival-founded`), `combat-hit`, `combat-lock/-unlock/-pin`,
`combat-spray`, `ant-died` (merged), `ant-injured`, `alarm-raised` (merged), `toxin-delivered`, `toxin-deaths`,
`thief-tunnel-breach/-closed`. Alert triggers → `ALERT_KINDS` (`predator-near`, `nest-attacked`, `raid-seen`,
`queen-in-danger`, `source-exhausted`, `possessed-danger`).

Diagnostics: `diag-carb-sources`, `diag-honeydew`, `diag-protein-sources`, `diag-threats`, `diag-rivals`,
`diag-combat-losses`, `diag-toxin`.

Identifiers: `FOOD_VARIANTS`, `ITEM_KINDS` (`food-piece`, `carcass`, `corpse`, `live-aphid`, `seed`), `CARRION_STAGES`,
`HOST_CLASSES`, `CREATURE_VARIANTS`, `HAZARD_KINDS`, `ANT_CONDITIONS`, `INJURIES`, death causes (b), task `raid` (TASKS),
action `dodge`/`cull-aphid` (ACTION_IDS), `STANCES`, `RALLY_MODES`, `RIVAL_SPECIES_IDS`, `RELATION_STATES`,
`HIT_KINDS`, `ENCOUNTER_OUTCOMES`; comfort levels **deferred** to UI settings; predator cue names (`harass`,
`deterrence`, `alarmLevel`) are fields.

### GDD 06 — environment, time, progression, reproduction, failure

State (App. A)

| Item | Representation |
| --- | --- |
| `calendar.tick, startTick` | `SimState.tick` + `env.calendar.startTick` (calendar tick = `time.calendarTick(state)`) |
| `calendar.foundingTick`, `moonPhase0` | `env.calendar.foundingTick`, `moonPhase0` |
| `calendar.seasonLengthDays` | `config.rules.seasonLengthDays` (5/7/10, see (b)) |
| `calendar.derived` | runtime cache `calendarNow(sim): CalendarDerived` (environment; not persisted, D1.1) |
| `env.climateId` | `env.climateId` |
| `weather`, `weather.anomaly`, `weather.history`, `weather.dew` | `env.weather: WeatherStateData` (`anomalyPrev/anomalyCur`, `history: WeatherHistory`, `dew`) |
| `thermal.tsurf`, `wsoil`, `heatAccl` | `env.thermal: ThermalStateData` |
| `moisture.theta0/theta1/puddle` | `env.moisture: MoistureState` (16 BU cells); `moisture.static` → `WorldData.maps` (rest deferred, GDD 04 row) |
| `ant.Tb, heatLoad, coldLoad, thermalState` | `Ant.tb, heatLoad, coldLoad, thermalState` |
| `queen.founding` | `Ant.queen.founding: FoundingReserves { reserveLoads, r0, desiccation, wings, eggsLaid }` (health = ant hp) |
| `time` | `env.time: TimeControlState` |
| `opening` | `PlayerState.opening: OpeningState` |
| `winter` | `env.winter: WinterStateData`; `snapshot` **deferred** to overwinter-repro (additive field) |
| `stage` | `ProgressionState.stage: StageState` |
| `milestones` | `ProgressionState.milestones: Record<id, DateStamp>` |
| `journal.entries`, `journal.aims` | `ProgressionState.journal: JournalEntry[]`, `aims: AimRecord[]` (GDD 08 shape, see (b)) |
| `history.daily / hourly` | `ProgressionState.history: HistoryState` (D1.11) |
| `deaths` | `ProgressionState.deaths { byCause, bySeason, recent }`; the cause×caste×role count matrix **deferred** (derivable from `recent` + counters; progression may add it) |
| `repro` | `Colony.repro: ReproductionState`; `investment/gyneShare/policy` → `Directives.alateInvestment/gyneShare/alatePolicy` |
| `colony.queens`, `orphanedAt`, `livingAnts` | `Colony.queens`, `orphanedAtTick`, `livingAnts` |
| `difficulty {preset, params, custom, history}` | `config.difficulty {preset, params, custom}` + effective `config.rules`; presets in `balance/difficulty.ts`; `progression.difficultyHistory` (D1.12) |
| `autosave.meta` | **deferred**: game layer |
| device stores `lineage`, `codex` | `LineageStore`, `LineageColonyRecord`, `DaughterRecord`, `FlightRecord` types (not SimState); in-game link `ProgressionState.lineage: LineageLink`; codex device store **deferred** to game layer (in-game `codexSeen`) |

Commands (App. B), after F1c (D4): `SetSpeed` → `setSpeed {speed}`; `TogglePause` → `togglePause`; `SetAutoSlow` →
`setAutoSlow`; `SkipToNextEvent` → `skipToNextEvent`; `OpeningSkipIntro`, `OpeningBeginTimelapse`, `OpeningUndo` →
camelCase; `OpeningSniff`, `OpeningSeal`, `OpeningPlantFungus`, `QueenLayBatch` → `action` with `sniff`,
`seal-entrance`, `plant`, `lay-egg`; `OpeningTimelapseSkip`, `OverwinterSkip` → `skipTimelapse`;
`OpeningInterruptRespond` → `timelapseRespond`; `OverwinterChoice`, `FlightRelease`, `FlightPossess`, `FlightLand`,
`RetireColony` → camelCase; `SetAlateInvestment`, `SetGyneShare`, `SetAlatePolicy` → `setDirectives` keys;
`FlightControl` → `PlayerIntent.flight`; `SetDifficulty` → `setDifficulty {preset?, custom?}`;
`LineageFoundDaughter`, `FoundAgain`, `Save/Load/QuickSave/QuickLoad`, `Export/Import/ExportLineage`: game-layer calls
(D4.19). Cheats: `setTime`, `setWeather`, `setWind`, `setAnomaly`, `noLag`, `completeFounding`, `addWorkers` →
`cheat.spawnAnts`, `setQueenAge`, `forceFlight`, `unlockCodex`, `triggerWinter`, `killQueen`, `killAll`, `setStores`.
`applyPendingCommands()` → `Sim.applyPendingCommands`.

Events (App. C): all in `eventsWorld.ts` / `eventsProgression.ts` with the same names: `time.hour`, `time.phase`,
`time.day`, `time.season`, `time.year`, `time.speed-changed`, `time.speed-limited`, `time.auto-slow`,
`weather.changed`, `weather.gust`, `weather.thunder`, `weather.lightning`, `weather.dew`, `weather.puddle`,
`env.heat-stupor`, `env.cold-coma`, `opening.phase`, `opening.site-assessed` (`opening.readiness` / `opening.sealed` → GDD 03 `founding-readiness` / `founding-sealed`, D5.10),
`opening.egg-batch`, `opening.timelapse`, `opening.handover`, `opening.failed`, `queen.egg-eaten`, `queen.hazard`,
`overwinter.notice/banner/begin/beat/end`, `overwinter.report`, `milestone.reached`, `journal.entry`, `aim.opened`,
`aim.completed`, `stage.changed`, `codex.unlocked` (`alate.eclosed` → `ant-eclosed`, D5.3), `flight.eligible`, `flight.launched`,
`flight.possessed-start/-end`, `flight.ended` (record summary `id, nFounded`; the record lives in the Lineage store),
`lineage.daughter-added`, `queen.died`, `colony.orphaned`, `colony.extinct` (+ `causeChain`), `epitaph.ready`, `diagnostic-changed`; `ambient.cue` → `cue` with `ambient.<kind>` ids. `autosave.done/failed`: **deferred** to the game layer. `diag.envNaN`: debug log, **deferred** (log, not
an event).

Diagnostics (App. D): `diag-surface-activity`, `diag-heat-exposure`, `diag-overwinter-readiness`,
`diag-founding-outcome`, `diag-reproduction-readiness`, `diag-flight-day`; `diag-queen-status` → `diag-queen-condition`, `diag-autosave` → `diag-storage` (D6.3, D6.5);
`diag-nest-climate` / `diag-flood-risk` → merged into GDD 03 `diag-nest-climate` / `diag-nest-flood` (D6.4). Status words mapped (b).

Identifiers: `CLIMATE_IDS`, `DAY_PHASES`, `OPENING_PHASES`, `STAGES` (stage flags are `StageState.flags`), `WINTER_MODES`,
`WINTER_PHASES`, `THERMAL_STATES`, `RAIN_CLASSES`, `FOUNDING_HAZARDS`, `FOUNDING_FAIL_CAUSES` (opening prompts are `HINT_IDS`, D3.7),
`DEATH_CAUSES` (union), `ALATE_STATES`, `FLIGHT_PHASES`, `ALATE_POLICIES`, `AUTO_SLOW_MODES` (auto-slow keyed on alert kind and level, D6.8),
`JOURNAL_KINDS`, `MOISTURE_CLASSES`, `SITE_FACTORS`, `SITE_WORDS`, `MILESTONE_IDS` (55), `AIM_IDS`, `CODEX_IDS` (56),
`WEATHER_SEVERITIES`, custom rule keys → `CustomRules`, `RNG_STREAMS`, `SPEED_LEVELS`. Save slot ids: **deferred** to
the game layer. Skip-to-event qualifiers: **deferred** to time controls (a predicate, not data). `return-to-nest`
priority: **deferred** (behaviour-internal state, not a canonical task). `mortar`: **deferred** (see (b)).

### GDD 07 — species (read from the chapter; digest 07 appeared later)

State (App. A)

| Item | Representation |
| --- | --- |
| A.1 `SpeciesDef`, `getSpecies(id)`, `deriveAntStats(def, caste, lengthBu)` | `types/species.ts SpeciesDef/CasteDef`, `species/registry.ts getSpecies/requireSpecies`, `entities/antStats.ts deriveAntStats` |
| A.2 per ant `lengthBu`, `massMg`, `sizeClass`, flags `NANITIC/REFUSE/HITCHHIKING`, `acid` | `Ant.lengthBu, massMg, sizeClass`, `AntFlag.NANITIC/REFUSE/HITCHHIKING`, `Ant.acid` |
| A.2 `animalPShare`, `destinedLengthBu` (brood) | `Brood.animalPShare`, `Brood.destinedLengthBu` |
| A.3 `honeydew`, `wood`, `granary`, `fungus`, `lineage` blocks | `Colony.honeydew / wood / granary / fungus / lineage` (null when the module is off; created by `createColony` from `SpeciesDef.economyModules`) |
| A.3 `casteEmphasis` etc. | `Directives.casteEmphasis, granaryHygiene, leafSelectivity, satelliteAuto, hideFrass, hitchhikerEscort, externalHeap` |
| A.4 `wood` (§6.2.1 `WoodState`) | `WorldDelta.wood: WoodState[]` = `{ primId, moisture (mc %, 6..60), decay (class 0..4) }`, single-segment form. **Deferred** to species-carpenter: `segments[i].mc / decay` (up to 4; `moisture`/`decay` then mirror segment 0), `placement`, `grainAxis`, `thicknessBu`, `carvedFrac`, `sunExposure`, `windowCount` |
| A.4 herd extensions (§6.1.1) | `Herd.kind: HerdKind`, `Herd.relocations` (count), `frozen`; `shelterPellets` **deferred** (T3 stretch, honeydew module) |
| A.4 piles (frass, chaff, waste heaps) | **deferred** to nestops (Ch 03 pile primitives / mounds) |
| A.4 plant seed heads and leaf damage | `PlantState.seedHeads`, `leafDamage` |

Commands (App. B): `setDirectives` extras (`DirectivesPatch`); `placeMarker` kind `satellite` (`MARKER_KINDS`);
`placeMarker avoid/forage` on chambers/herds → same command; `designateChamber` types `granary/fungus/midden`; `act`
`drum`, `cut-seed-head`, `process-leaf` → `action` (`ACTION_IDS`); cheats `cheat.setWood`, `cheat.setChamberClimate`,
`cheat.spawnHerd`, `cheat.setHerd`, `cheat.addSeeds`, `cheat.setGarden`, `cheat.supplySubstrate`, `cheat.infectGarden`,
`cheat.setColonyAge`, `cheat.spawnBrood` (caste via `destined`), `cheat.freezeGrowth`; debug queries **deferred** to
the debug API.

Events (App. C): all in `eventsEcology.ts` (`SpeciesEvent`): `herd-claimed`, `herd-lost`, `honeydew-relay`,
`aphid-moved` (shared with GDD 05, GDD 05 payload names), `frass-ejected`, `frass-pile-grew`, `wood-moisture-alert`,
`satellite-state`, `brood-shuttled`, `queen-relocation`, `drum`, `granary-state`, `seed-milled`, `radicle-gnawed`,
`midden-seedling`, `midden-plant`, `garden-state`, `garden-infected`, `all-gardens-lost`, `plant-rejected`,
`leaf-cache-spoiled`, `hitchhiker-mounted`, `phorid-strike`, `caste-unlocked`; `cue` with `cue.frass-fall` → `frass-drop`,
`cue.drum` → `drum`, `cue.stridulate` → `stridulate`, `cue.leaf-sway` → `leaf-sway`, `cue.mill` → `mill`,
`cue.garden-tend` → `garden-tend`.

Diagnostics (App. D): `diag-herds`, `diag-ln-protein`, `diag-ln-recruitment`, `diag-ln-nursery-warmth`,
`diag-cp-parent-moisture`, `diag-cp-satellites`, `diag-cp-growth`, `diag-cp-frass`, `diag-wood`, `diag-granary`,
`diag-mb-milling`, `diag-mb-animal-protein`, `diag-mb-heat`, `diag-mb-patrol`, `diag-at-chain`, `diag-at-garden`,
`diag-garden`, `diag-at-substrate`, `diag-at-phorid`.

Identifiers (A.0): `ECONOMY_MODULES`, `FOUNDING_MODES`, `ANT_SIZE_CLASSES`, `SEED_CLASSES`, action additions, item
kinds (`chaff`, `seed`, `seed-paste`, `leaf-fragment`, `leaf-pulp`, `staphylae`, `fungus-piece`, `garden-waste`;
`aphid` → `live-aphid`), `TASK_SUBTYPES`, marker `satellite`, entrance `window` (in `ENTRANCE_KINDS`), `NEST_SITE_ROLES`,
`NEST_SITE_STATES`, `WOOD_PLACEMENTS`, `HERD_KINDS`, `SEED_COHORT_STATES`, `GARDEN_STATES` (colony flag `garden-less`
→ `FungusModule.gardenLess`), `CHAMBER_FLAGS`, ant flags (`AntFlag`), `DIRECTIVE_EXTRAS`, plus schema enums
`SUBFAMILIES`, `LARVA_FOODS`, `FOOD_ROUTES`, `MOUND_STYLES`, `MIDDEN_STYLES`, `ALARM_MODES`, `WEAPONS`, `SPECIES_TIERS`,
`FLIGHT_SYNCHRONY`.

### GDD 08 — interface, experience, art, audio

State (App. A)

| Item | Representation |
| --- | --- |
| `progression.alerts` | `ProgressionState.alerts: ActiveAlert[]` |
| `progression.aims` | `ProgressionState.aims: AimRecord[]` |
| `progression.hintsMirror` | `ProgressionState.hintsMirror: Record<HintId, {uses, state}>` |
| `progression.codexSeen` | `ProgressionState.codexSeen: Record<CodexId, tick>` |
| `progression.eventLog` | `ProgressionState.eventLog: EventLogEntry[]` (cap `EVENT_LOG_CAP`) |
| `progression.milestoneThumbs` | `ProgressionState.milestoneThumbs` (set by `storeThumbnail`, cap `MILESTONE_THUMBS_MAX`) |
| `player.timelapse` | `PlayerState.timelapse: TimelapseState \| null` |
| `progression.diagnostics` | `ProgressionState.diagnostics: Diagnostic[]` |
| `progression.stats` | `ProgressionState.history` (D1.10) |
| `foundress.settings.v1`, `foundress.profile.v1`, save `meta`, `UiSnapshot`, runtime UI state | **deferred**: UI / game layer (never SimState) |

Commands: `possess {antId} | {role}` → `possess {antId?, role?, nearPos?}`; `release`; `action {actionId, target}` → `action`;
`setDirectives {allocation, production, casteRatio, diet, architect}` (`casteRatio` → `casteEmphasis`); `placeMarker
{kind,pos,radius,params}`; `removeMarker`; `planDig {nestId, template, chamberType, anchor, rotation, size, priority}` →
`planDig` with the GDD 03 flat payload (`template` → `kind`, `rotation` → `yawDeg`; D4.11); `cancelPlan`; `designateChamber`; `setAutoExpand {on}`
→ `{ nestId, mode }` (GDD 03 shape); founding steps → `opening*` commands; `skipTimelapse`; `timelapseRespond` (D4.15),
`acknowledgeAlert`, `storeThumbnail`, `setDifficulty`. Game/UI intents (`setSpeed` as UI call, `openScreen`, `save`,
`capturePhoto`, ...): game layer (time speed itself is the sim command `setSpeed`).

Events consumed: `alert {op, alert}` → `alert`; `milestone` → `milestone.reached` (+ `title`); `cue`; `observe`;
`hint-trigger`; `aim {aimId, op}` → `aim.opened` / `aim.completed`; `possession` → `possession-started/-ended`;
`ant-died`; `human-event` → `human.telegraph` / `human.start` / `human.end`; `weather` → `weather.changed`; `timelapse`
→ `opening.timelapse` / `overwinter.*`; `game-over` → `colony.extinct` + `epitaph.ready` (+ `ProgressionState.finalCauses`);
`chunk-dirty` → `carve-chunks-dirty`; `breach`. UI-emitted local events: **deferred** to the UI layer.

Diagnostics: `diag-perf`, `diag-audio`, `diag-storage`, `diag-input` in `DIAGNOSTIC_IDS` (published by the game layer).

Identifiers: `ALERT_LEVELS`, `ALERT_KINDS`, `HINT_IDS`, `HINT_STATES`, `AIM_IDS`, `AIM_STATES`, `CUE_IDS`, `DIAGNOSTIC_STATUSES`.
Screen ids, views, overlay ids/palettes, comfort levels, quality presets, audio buses/status, save slots, settings and
asset ids: **deferred** to UI/render/audio/game (presentation data, not simulation contracts).

---

## (b) Naming conflicts resolved

Rule applied: directions §J name, else the name used by the chapter that owns the topic.

| # | Conflict | Decision |
| --- | --- | --- |
| 1 | Item kinds: GDD 02 `food-item` / `food`, `pellet`, `brood`; GDD 01/03 `soil-pellet`, `food-piece`; GDD 07 `aphid` | `soil-pellet` (nest owner), `food-piece` (ecology owner), brood is never an item (GDD 01: own entity), `waste` + `wasteKind` (colony owner), `corpse` (ant) and `carcass` (creature), `live-aphid` (GDD 05 owns aphids) |
| 2 | Regions: GDD 04 `temperate-eu`, `southern-us` vs GDD 05 `temperate-europe`, `south-us` | GDD 04 (world owner) |
| 3 | "Size classes": GDD 04 map sizes vs GDD 07 individual size bins | `WORLD_SIZES` (`compact/standard/large`) and `ANT_SIZE_CLASSES` (`nanitic/small-media`) |
| 4 | Cavity kinds: GDD 03 vs GDD 04 lists | GDD 04 (generator) list + `abandoned-burrow` (GDD 03, created at runtime). GDD 03 aliases: `paving-joint`/`asphalt-crack` → `crack-slot` or `under-slab`, `stone-gap` → `under-stone`, `kerb-void` = same, `root-channel` → `root-gallery`, `log-hollow` → `log-gallery`, `pipe-gap` → `pipe-tube`; `wall-void` is free space between primitives (GDD 04 V6, directions §K), not a carve cavity |
| 5 | Death causes: GDD 02 list "to reconcile with 06", GDD 05 additions | Union in `DEATH_CAUSES` with GDD 06 §9.3 as base; GDD 05 `toxin` → `poison`, `predator` → `predation`; specific `bird`, `antlion`, `parasitoid` kept; GDD 01 `lost`, `dispersed`; GDD 06 `lifespan` kept |
| 6 | Diagnostic id prefixes (`food-intake-c` vs `diag-*`) | SUPERSEDED by D6.1 / ruling 7: every id carries `diag-` (registry B8, 62 ids). Merged: `diag-queen-status` → `diag-queen-condition`, GDD 06 `diag-nest-climate` / `diag-flood-risk` → GDD 03 `diag-nest-climate` / `diag-nest-flood`, `diag-autosave` → `diag-storage`, `diag-at-garden` → `diag-garden`. Per-subject instances use `<id>:<subjectId>` |
| 7 | Diagnostic statuses: `ok/warn/bad` (guidance, 02, 03, 08) vs GDD 06 `ok/watch/warn/critical`, `headline` | SUPERSEDED by D3.10: `ok/info/warn/bad` (watch→info, critical→bad); `headline` → `label` |
| 8 | Aims: GDD 06 vs GDD 08 lists | Union of registry B6 (`aim-protein` → `aim-first-protein`, `aim-reopen` → `aim-nest-open`; `aim-plant-garden` and `aim-garden` are both kept, as in B6) |
| 9 | Codex ids: GDD 06 `cx-*` vs GDD 08 descriptive ids | GDD 06 `cx-*` (codex mechanism owner); codex-content maps GDD 08's onboarding references |
| 10 | Command naming: GDD 01 kebab (`set-intent`, `act`), GDD 06 PascalCase, GDD 02/03/08 camelCase | camelCase `type` strings; cheats `cheat.<camelCase>`. GDD 01 `act` → guidance name `action` |
| 11 | Event naming | Owner strings kept (kebab for GDD 01/02/03/05/07, dotted for GDD 04/06). Duplicates: `speed-changed` → `time.speed-changed`; `milestone` → `milestone.reached`; `weather` → `weather.changed`; `diag.changed` → `diagnostic-changed` (D5.2); GDD 05 `coop-transport-*` → GDD 02 `coop-transport {phase}`; `ant-died`, `alarm-raised` payloads merged; `aphid-moved` uses GDD 05 payload names |
| 12 | Ant field names: digest (`colonyId`, `health`, `reserve`, `physioAge`, `controlled`, `trailOn`, `scale`) vs guidance §5 | Guidance names (`colony`, `hp/maxHp`, `energy`, `lifespanGd` + `physioAgeGd` (D2.6), flags `POSSESSED`/`TRAIL_ON`); `scale` → GDD 07 `lengthBu` |
| 13 | Entrance `plugVoxels` vs `plugVoxelCount`; guidance `sealed` boolean | `plugVoxelCount` (App. A); `status` (GDD 03) replaces `sealed` |
| 14 | Season length: GDD 06 4/7/10/14 vs directions §K 5/7/10 | §K: `SEASON_LENGTHS = [5, 7, 10]` |
| 15 | `setAutoExpand {on}` (GDD 08) vs `{nestId, mode}` (GDD 03) | GDD 03 |
| 16 | Directive `casteRatio` (GDD 08) vs `casteEmphasis` (GDD 07) | `casteEmphasis` |
| 17 | `state.time` (GDD 01) vs GDD 06 `time` | `env.time` (GDD 06 owns time controls) |
| 18 | `stay-in` vs `stayIn` | `stayIn` |
| 19 | GDD 05 task `raid` not in §J | appended to `TASKS` (arrays are sized `TASKS.length`) |
| 20 | Material `insulation` (GDD 03), `mortar` (GDD 06) | `insulation` appended to geom `MATERIAL_IDS` (codes stable); `mortar` deferred: only prose (crumb in joints), not a surface material |
| 21 | Moisture class "slightly damp" | `slightly-damp` (ids are kebab-case) |
| 22 | Calendar anchors written for a 28-day year | Stored as written; scaled with `time.scaleDoy(doy, seasonLength)`; no code assumes 7 |
| 23 | New-game start day: GDD 08 "Day 1 of chosen season" vs §K / GDD 06 species founding day | `GameConfig.startSeason/startDayOfSeason/startHour`, defaulting to `SpeciesDef.opening.startDoy.default` (Lasius doy 10 = summer day 3, 14:00) |
| 24 | GDD 07 schema constant names (`Q_MAX`, `REPRO_MAX_FRAC`, `R0`, acidopore/sting) | camelCase in code: `qMax`, `reproMaxFrac`, `reproGyneShare`, `R0` (D2.28 keeps the GDD spelling), `appearance.rearWeapon` |
| 25 | Walker extras not in the guidance | additive: `Walker.radius`, `NavState.fieldKind`, `NavState.routeId` |
| 26 | Herds: guidance "plants: dynamic state of host plants (herds, nectar)" vs GDD 05 separate `ecology.herds` | GDD 05: herds in `SimState.ecology.herds` (own store), plants keep `herdIds` |

---

## (c) PROVISIONAL

| Item | Why | Owner who confirms |
| --- | --- | --- |
| `WorldField` interface (`types/services.ts`) | interface the modules program against; the kernel's `src/sim/world/field.ts` is the source of truth (ruling 1) | wiring task |
| `NestNav` interface | same, against `src/sim/nest/nav` (ruling 1) | wiring task |
| `CarveGrid` | NOT provisional: re-exported from the kernel's `src/sim/nest/carve` (it existed) | — |
| `SpeciesDef` / `CasteDef` schema — PROVISIONAL | written from GDD 07 §3 and App. A–D directly before digest 07 existed; Lasius data minimal; not yet cross-checked against the digest | species-data |
| `PlayerIntent.held: ActionId[]` | the game maps held inputs to the species' action ids | actions / F3-appshell |
| `PheromoneState` layout (per colony+channel layers of 16^3 chunks) | phero task may change the internals but must stay plain data | phero |
| `WorldMaps`, `NavGridData` subsets | GDD 04 lists more maps; T1 subset only | worldgen-terrain, loco |
| `CalendarDerived` computed by `environment.deriveCalendar` / `calendarNow(sim)` (sine day length, simple phases; runtime cache, not persisted) | placeholder until env-core | env-core |
| Placeholder services in `src/sim/testing/placeholders/` (terrain-only field, unreachable nest nav, open nav grid, minimal pheromones) | to be replaced through the module `index.ts` factories | F2-kernel, loco, phero |
| Stub module APIs (`src/sim/<module>/index.ts`) | signatures final in intent; bodies are safe no-ops | each module task |
| `EntityIndex` cell size `INDEX_CELL_BU = 8` | tuning | beh-forage / perf |
| Event payload details where the chapters were loose (`flight.ended`, `human.scheduled`, `mound-changed`) | summarised to ids and numbers | owners |

---


## (d) Composition: systems, behaviours, commands (rulings 9 and 13)

No module owner edits a shared file to register anything. Each module `index.ts` exports:

- `systems: readonly System[]`, every system with a `phase` (`SYSTEM_PHASES`, the tick order of architecture §3);
- `behaviours?: readonly Behaviour[]` (ants module and species modules; a behaviour with `species` overrides the
  generic one for those species);
- `commandHandlers: Partial<CommandHandlerMap>`.

`src/sim/systems.ts` lists the modules once (`SIM_MODULES`: world, environment, ecology, colony, ants, locomotion,
combat, nest, pheromones, rivals, progression, then the four species modules of `src/sim/species/modules/*`) and
derives `SYSTEMS` (stable sort by phase, then module order, then array order; `commandsSystem` first),
`BEHAVIOURS` and `createBehaviourTable()` (exposed at runtime as `sim.behaviours.get(task, species)`).
`src/sim/commands.ts` merges the handlers in the same order. `COMMAND_OWNERS: Record<CommandType, SimModuleKey>` keeps
the compile-time completeness check (a command type without an owner does not compile);
`buildCommandTable()` reports types with no handler, claimed twice, or handled by a non-owner, and
`commands.test.ts` asserts all three lists are empty. A command whose type has no handler at runtime becomes
`command-rejected {reason: 'unhandled'}`.

Resulting tick order (unchanged from F1b):

| # | System | Phase | Module (owner task) |
| --- | --- | --- | --- |
| 1 | `commands` | commands | systems.ts (F1c) |
| 2-5 | `calendar`, `weather` (every 25), `human-events`, `environment-effects` (every 50, offset 30) | environment | environment (env-core, human-events, weather-effects) |
| 6-7 | `sources`, `plants` (every 250, offsets 5 / 55) | ecology | ecology (sources-core, ecology-plants) |
| 8 | `allocation` (every 100, offset 15) | colony-allocation | colony (colony-core) |
| 9-10 | `queen`, `founding` | queen | colony (colony-core, founding) |
| 11 | `brood` | brood | colony (colony-core) |
| 12-15 | `perception`, `behaviours`, `player-control`, `actions` | perception .. actions | ants (beh-forage, beh-nest, actions) |
| 16-17 | `creature-director` (every 50, offset 40), `creatures` | creatures | ecology (creatures) |
| 18 | `locomotion` | locomotion | locomotion (loco) |
| 19 | `combat` | combat | combat (combat) |
| 20-21 | `nest`, `architect` (every 600, offset 320) | nest | nest (nestops, architect) |
| 22 | `pheromones` (every 10) | pheromones | pheromones (phero) |
| 23-26 | `economy`, `colony-stats` (every 250, offset 105), `overwinter`, `reproduction` | colony-economy | colony (colony-core, overwinter-repro) |
| 27 | `rivals` (every 250, offset 155) | rivals | rivals (rivals) |
| 28-29 | `progression`, `diagnostics` (every 250, offset 205) | progression | progression (progression) |
| 30 | `lifecycle` | lifecycle | ants (actions) |

Command owners (module key → command types; the owner task is named next to each handler in the module index):
ants (actions): `possess`, `release`, `setIntent`, `action`, `setTrail`, `cheat.kill`; environment (env-core,
weather-effects, human-events): `setSpeed`, `togglePause`, `setAutoSlow`, `skipToNextEvent`, time / weather / moisture
/ human cheats; colony (colony-core, founding, overwinter-repro): directives, markers, opening, time-lapse,
overwinter, flight, `retireColony`, colony cheats; nest (nestops, architect): every plan / chamber / entrance command,
carve cheats; progression: `acknowledgeAlert`, `storeThumbnail`, `setDifficulty`, `cheat.unlockCodex`; ecology:
creature / food / herd cheats; locomotion: `cheat.teleport`; rivals: rival cheats; combat: `cheat.combatFlags`;
world: `cheat.revealMicro`; species-wood / -granary / -fungus: their module cheats. Full table: `COMMAND_OWNERS`.

Cross-module functions (final signatures, safe "not available" bodies, owner task in the doc comment of each module
file; `src/sim/testing/stubs.test.ts` calls every one on a fresh game):

| Module | Functions | Owner |
| --- | --- | --- |
| locomotion | `navTo`, `navToTarget`, `navStop`, `navWander`, `navFollowTrail`, `navRetrace`, `navFollowField`, `navClimb`, `integratePossessed`, `placeOnSurface` | loco |
| nest | `canDigAt`, `digBite(sim, ant, pos, heading, slopeDeg)` (ramp brush, spike-nest §5.5), `dumpPellet`, `sealEntrance`, `unsealEntrance`, `claimDigSite`, `releaseDigSite`, `validatePlan`, `createPlan`, `cancelPlan`, `designateChamber`, `siteAt` (+ `findChamberAt`, `bestBroodChamber`, `nearestEntrance`, `disturb`) | nestops (architect for proposals) |
| colony | `depositFood`, `withdrawFood`, `feedBrood`, `layEgg`, `requestTask`, `colonyDemand` (+ `playerColony`, `colonyOf`, `taskHeadcount`) | colony-core |
| pheromones | `deposit`, `sample`, `senseDirection` | phero |
| ecology | `harvest`, `nearestSource`, `discoverSource` (+ `freeSlots`, `initEcology`) | sources-core |
| combat | `applyDamage`, `beginGrapple`, `releaseGrapple` (+ `engage`, `raiseAlarm`) | combat |
| environment | `airTemp`, `surfaceTemp`, `soilTemp`, `chamberTemp`, `speedMult(sim, tb, species)`, `lightLevel`, `sunDirection`, `isRaining`, `rainRate` (+ `calendarNow`, `deriveCalendar`, `relHumidity`, `surfaceActivity`, `isExposed`, `isWeekend`) | env-core |
| ants | `canDo`, `begin`, `cancel`, `currentPrompt`, `inspect` (+ `availableActions`, `inferReleaseTask`) | actions |
| progression | `publishDiagnostic`, `recordMilestone`, `unlockCodex`, `raiseAlert` (+ `clearAlert`) | progression |

## (e) Orchestrator rulings: how each was applied

| # | Ruling | Applied as |
| --- | --- | --- |
| 1 | Kernel interfaces are the truth | `CarveGrid` re-exported from the kernel; `WorldField` / `NestNav` kept in `types/services.ts`, marked as the wiring task's job; kernel files untouched and not wired in |
| 2 | Voxel flags beside the carve grid | `WorldDelta.carveFlags: CarveFlagsData {keys, chunks}` (same chunk keys, nest module owns it); `VoxelFlag` bits unchanged |
| 3 | Lazily allocated grids | kept: `Colony.exploredBits`, `Colony.danger`, `rivals.territory.marks` start empty |
| 4 | Simulated workers only | `ScaleDef.realEstimate` → codex-only `wildColonySize`; thresholds `growThreshold` / `matureThreshold` in workers; `LineageColonyRecord.peakWorkerEq` → `peakWorkers` |
| 5 | Light rival species + one stats lookup | `RivalSpeciesDef` (types/rivalSpecies.ts), 12 rows in `src/sim/species/rivals.ts`, `getRivalSpecies()`; `getAntStats(ctx, speciesId, caste, lengthBu?, founding?)` in entities, used by `spawnAnt` |
| 6 | Time controls in `env.time` | kept; `setSpeed` / `togglePause` / `setAutoSlow` handled by the environment module |
| 7 | `diag-` prefix | `DIAGNOSTIC_IDS` = registry B8 (62 ids) |
| 8 | `livingAnts` bookkeeping | kept in `spawnAnt` / `killAnt` |
| 9 | Command handlers from module maps | section (d) |
| 10 | Lasius male upkeep 0.06 | `castes.male.upkeepOverride` 0.06 and `reproduction.maleUpkeepC` 0.06 |
| 11 | `dropTo1x` on possession | kept on `possess` (the only possession command now) |
| 12 | Mounds stay heightfield patches | `WorldDelta.mounds` unchanged |
| 13 | Systems and behaviours from module exports | section (d); `registerBehaviour` / `behaviourFor` removed in favour of `behaviours` arrays + `sim.behaviours` |

## (f) Renames and removals made by F1c (old → new)

State and entities

| Old | New |
| --- | --- |
| `env.calendar.startOffsetTicks` | `env.calendar.startTick` |
| `env.calendar.derived` (persisted) | removed; runtime `calendarNow(sim)` / `deriveCalendar(calTick, cfg)` (environment) |
| `env.time.speed: SpeedLevel` (0 = paused) | `env.time.speed: RunSpeed` (1/2/4/8) + `paused`; `requested: RunSpeed` |
| `env.time.skipUntilTick` | `env.time.skipUntil` |
| `env.time.cooldowns` keyed by auto-slow trigger | keyed by alert kind |
| `worldDelta.dynamicPrims` | `worldDelta.dynPrims` |
| `worldDelta.grassHeightMm: Uint8Array` | `Uint16Array` |
| — | `worldDelta.carveFlags` (new) |
| `progression.journal: JournalEntry[]` | `progression.journal: { entries }` |
| `progression.stats: StatsHistory` | `progression.history: HistoryState` (`daily: Record<string, number[]>`, unbounded) |
| — | `progression.difficultyHistory` (new) |
| `config.difficulty: DifficultyId` | `config.difficulty: { preset, params: DifficultyParams, custom: Partial<CustomRules> }` |
| `CustomRules` without them | + `startSeason`, `foundingLeniency` |
| `Colony.reproduction` / `.flightIds` / `active.id: number` | `Colony.repro` / `.flights: string[]` / `active.id: string` |
| `Colony.abstract: AbstractColonyState` (`aggression`, `knowsNest: boolean`, `queens: number`) | `Colony.rival: RivalAbstract` (`agg`, `knowsNest` bitmask; queens are `Colony.queens`) |
| `ecology.danger` | `Colony.danger: Float32Array` |
| `ecology.bird` | `ecology.birdEvent` |
| `rivals.threat` | `rivals.threatDirector` |
| `Colony.queens[].ageDays`, `lifespanDays: -1` | removed (age from `bornTick`), `lifespanDays: number \| null` |
| `stores.inCropsC/inCropsP/capC/capP` | `stores.inCrops {c, p}`, `stores.cap {c, p}` |
| `Directives.production`, `Directives.architect` | removed (`alateInvestment`; `setAutoExpand`) |
| — | `Directives.taskShares` (new) |
| `HoneydewModule.yield7` | `yieldHistory` (capacity = season length) |
| `QueenState.gutC/gutP`, `reserveC`, `ageDays`, `lifespanDays` | `gut {c, p}`, `reserve`; age and lifespan removed |
| `FoundingReserves.r0` | `R0` |
| `Ant.lifespanTicks`, `Ant.physioAgeTicks` | `Ant.lifespanGd`, `Ant.physioAgeGd` (game days) |
| `Ant.energy` 0..1 | `Ant.energy` C loads (0..RESERVE_CAP of the age band) |
| `Ant.cd` (`AntCooldowns`) | `Ant.acidRegenTick`, `Ant.layCooldownUntilTick`; `CombatState.biteCdTick/specialCdTick/dodgeCdTick` (`cd.alarm` dropped) |
| `CombatState.lockTargetId/lockTargetKind/lockSlot` | `CombatState.lock: GrappleLock \| null` |
| `Ant.lengthBu` (species BU) | world BU (equal for the player's species) |
| `Item.carriedBy` + `Item.carriers` | `Item.carrierIds` |
| `FoodSource.amount` | `FoodSource.units` |
| `MarkerParams.targetChamberId/sourceChamberId` | `Marker.targetChamberId/sourceChamberId`; params gain `priority` |
| `SpeciesDef.tier` T1/T3 | T1/T2/T3 |
| `ScaleDef.realEstimate` | `wildColonySize`; + `growThreshold`, `matureThreshold` |
| `FoundingDef.shaftDepthBu`, `chamberWidthBu`, `r0` | `dMinOpenBu`, `dMinCoverBu`, `vMinBu3`, `wMinBu`, `shaftTargetBu`, `R0` |
| — | `CasteDef.fixedStats` (GDD 05 table for queens, gynes, males) |
| `AntStats.biteDps` | `bite`; + `cruiseMmS` |

Commands

| Old | New |
| --- | --- |
| `possessRole {role}` | `possess {role, nearPos?}` (`antId` optional, `via` optional) |
| `action {action, target, secondary, phase}` | `action {actionId, target?, secondary?, phase}` |
| `setSpeed {level}` | `setSpeed {speed}` |
| `setDirectives {colonyId, patch}` | `setDirectives {colonyId?, ...directive keys}` |
| `placeMarker {kind, pos, radius, mode, chamberType, chamberIds}` | `placeMarker {kind, pos, radius?, chamberIds?, params?}` |
| `planDig {spec}` | `planDig {...PlanSpec}` (geometry fields optional) |
| `setDifficulty {preset \| null, rules}` | `setDifficulty {preset?, custom?}` |
| `setHumanActivity` | removed: `setDifficulty {custom: {humanActivity}}` |
| `openingSniff`, `openingSeal`, `openingPlantFungus`, `queenLayBatch` | removed: `action` with `sniff`, `seal-entrance`, `plant`, `lay-egg` |
| `openingInterruptRespond`, `timelapseStepIn` | `timelapseRespond {interruptId, response}` |
| `overwinterSkip` | `skipTimelapse` |
| `setAlateInvestment`, `setGyneShare`, `setAlatePolicy` | `setDirectives` keys |
| `flightControl` | removed: `PlayerIntent.flight` |

Events

| Old | New |
| --- | --- |
| `command-rejected {command}` | `command-rejected {commandType}` (+ reason `unhandled`) |
| `speed-refused {level}` | `speed-refused {speed, reason: 'possession' \| 'opening'}` |
| `diag.changed {diagId}` | `diagnostic-changed {id}` |
| `source-discovered`, `food-source-discovered {sourceId, colonyId}` | `food-source-discovered {sourceId, kind, variant, pos, colonyId, byAntId}` |
| `alarm-raised {..., by, source}` | `alarm-raised {colonyId, pos, strength, source}` |
| `coop-transport {itemId, carriers, phase}`, `carcass-butchered` | `coop-transport {itemId, carriers, bulk, phase}` |
| `founding-readiness {depth, volume}`, `founding-sealed {nestId}`, `opening.readiness`, `opening.sealed` | `founding-readiness {nestId, readiness, parts}`, `founding-sealed {nestId, entranceId}` |
| `ant-drowned`, `alate.eclosed`, `observe` | removed (`ant-died {cause: 'drowning'}`, `ant-eclosed`, `codex.unlocked`) |
| `ambient.cue`, `sound.cue`, `cue {..., variant}` | `cue {cue, pos \| null, strength}` with `ambient.*`, `giant.*`, `dig-bite.<material>` ids |
| `colony.extinct {colonyId, cause}` | + `causeChain` |
| `time.auto-slow {trigger}` | `time.auto-slow {alertKind, level, action}` |

Identifier sets: `DIAGNOSTIC_IDS` → B8; `DIAGNOSTIC_STATUSES` + `info`; `DEATH_CAUSES` canonical (−`flood`,
−`lifespan`, −adult `exposure`); `BROOD_DEATH_CAUSES` −`raided`, −`poison`; `FOUNDING_FAIL_CAUSES` + `starvation`;
`POSSESSION_END_REASONS` `release` → `player`; `OPENING_PROMPTS`, `AUTO_SLOW_TRIGGERS`, `PRODUCTION_MODES` removed;
`HUMAN_VARIANTS` −`street-broom`; `CUE_IDS` −`leaf-sway`, −`mill`, −`mandible-snap`, −`trail-dab`, −`groom`, −`sting`,
−`wing-snap`, −`put-down` (sfx.* files or namespaced cues), + `collapse-rumble`; `AIM_IDS` + `aim-second-entrance`,
`aim-cross-zone`, `aim-herd`, `aim-alates`, `aim-flight`, `aim-plant-garden`; `MILESTONE_IDS` + 4 nest milestones;
`CODEX_IDS` + `cx-interface-orders`, `cx-antennation`, `cx-nursing`, `cx-springtail`, `cx-interface-why`,
`cx-interface-markers`, `cx-interface-time` and the `cx-species-*` / `cx-material-*` / `cx-habitat-*` families
(`allCodexIds()`); `ALERT_KINDS` + `garden-failing`, `granary-spoiling`, `wood-drying`; `HINT_IDS` + `hint-reserves`;
`RNG_STREAMS` + `rng.events.human`; `SPECIES_TIERS` + `T2`; `MATERIAL_IDS` + `mortar` (appended, codes stable);
`BEHAVIOUR_STATES` + `tend.travel`, `tend.guard`, `tend.full`, `tend.relocate`. New: `TASK_COUNT`, `RUN_SPEEDS`,
`START_SEASON_RULES`, `FOUNDING_LENIENCIES`, `REPRO_GATES`, `SAVE_SLOT_IDS`, `AUTOSAVE_LABELS`, `HISTORY_SERIES_IDS`,
`RIVAL_PROFILES`, `RIVAL_NEST_TEMPLATES`, `SYSTEM_PHASES`, type `RemedyId`.

Module APIs and helpers: colony `addFood` → `depositFood`, `takeFood` → `withdrawFood`; ecology `harvestSource` →
`harvest`; ants `cancelAction` → `cancel`; nest `claimDigSlot` / `releaseDigSlot` → `claimDigSite` / `releaseDigSite`;
environment `speedMult(tb, species)` → `speedMult(sim, tb, species)`; `registerBehaviour` / `behaviourFor` → module
`behaviours` + `sim.behaviours`; `commands.ts handledCommandTypes` → `commandTableReport()`; `commandsSystem` moved to
systems.ts; `createGame.deriveCalendar` → `environment.deriveCalendar`; `defaultGameConfig(species, seed, preset?,
seasonLength?)`. Calendar helpers take a `SeasonLengthSource` (a config or a number). Balance: `HP_PER_SQRT_MG` 12 /
`BITE_PER_SQRT_MG` 2 → `HP_PER_MG23` 10 / `BITE_PER_MG23` 1.0; `MALE_HP_MULT`, `QUEEN_RESERVE_P/C_START`,
`LAYING_LOG_DAYS`, `HONEYDEW_HISTORY_DAYS`, `DAILY_HISTORY_CAP` removed; time.ts `DEFAULT_SEASON_LENGTH`,
`DAYS_PER_WEEK` → balance `DEFAULT_SEASON_LENGTH_DAYS`, `WEEK_DAYS`; new `RESERVE_CAP_BY_BAND`, `CALLOW_GD`,
`AGE_YOUNG_MAX_GD`, `AGE_MID_MAX_GD`, `OPENING_MAX_SPEED`, `MARKER_CAP`, `MARKER_DEFAULT_RADIUS_BU`,
`DIFFICULTY_PARAMS`, `resolveRules`. Worldgen: incipient rivals 0/1/2 → 1/2/3 (GDD 05 §3.1).

Changes from the F1c review round (before any module consumes them)

| Old | New |
| --- | --- |
| `Brood.destined: Caste` (also `egg-laid`, `cheat.spawnBrood`, `layEgg`, `SpawnBroodOptions`) | `BroodCaste` = `Exclude<Caste, 'queen'>` (D7.3) |
| `LifeHistory.fSeason` keyed on 1-based `D` | keyed on 0-based `d28` (Lasius data `D − 1`); `layWindows` on `d28` |
| Lasius `devRate` upper end `32: 1.85, 35: 1.4, 38: 0` | `32: 1.818, 34: 0.909, 36: 0` (C5) |
| Lasius `startDoy.min` 8 | 9 (C1) |
| worldgen `RIVALS_BY_DIFFICULTY` (inline) | balance `presetRivals`, `presetHumanActivity`; createGame `worldRuleInputs`, `syncWorldParams` |
| `calendarNow(sim): CalendarDerived` cached on `state.tick` | `Readonly<CalendarDerived>` (frozen) cached on calendar tick and season length |
| `setSpeed`, `setDifficulty`, `cheat.kill`, `cheat.killQueen` accepted any JSON value | invalid values → `command-rejected` (`invalid-speed`, `invalid-difficulty`); kill causes kept when canonical, else `unknown` / `base` |

## (g) 00-index §D rows and their outcome

All rows are **applied** unless marked otherwise.

| Row | Outcome |
| --- | --- |
| D1.1 | applied: `state.tick` + `env.calendar {startTick, foundingTick, moonPhase0}`; derived values are a runtime cache (`calendarNow`); season length in `config.rules.seasonLengthDays` |
| D1.2 | applied: helpers take the config (`SeasonLengthSource`); default 7 only as the named `DEFAULT_SEASON_LENGTH_DAYS`; test scans src/sim for hard-coded 7 / 28 |
| D1.3 | applied (already): `env.weather`, `env.thermal`, `env.moisture`, `env.climateId` |
| D1.4 | applied (already): `env.winter` |
| D1.5 | applied (already): `env.human` |
| D1.6 | applied: `worldDelta.dynPrims`, `grassHeightMm: Uint16Array` |
| D1.7 | applied with ruling 6: the record lives at `env.time` (not root `state.time`); `speed: RunSpeed`, `paused`, `skipUntil`; `setSpeed {speed: 0}` sets `paused` |
| D1.8 | applied (already): `player.opening` |
| D1.9 | applied (already): `player.timelapse` |
| D1.10 | applied: `journal {entries}`, `history`, `difficultyHistory`; aims records GDD 08 shape |
| D1.11 | applied: hourly ring 168, daily unbounded; `HISTORY_SERIES_IDS` |
| D1.12 | applied: `config.difficulty {preset, params, custom}`; `config.rules` stays as the effective rules (D1.1 reads it) |
| D1.13 | applied: `Colony.repro`; investment / gyne share / policy are directives |
| D1.14 | applied: `Colony.queens {antId, lifespanDays \| null}`; `queenId` primary queen |
| D1.15 | applied: `state.sources/items/plants`, `ecology.{herds, preyPatches, hazards, director, birdEvent, carrionAcc}` |
| D1.16 | applied: `Colony.rival: RivalAbstract`, `rivals {relations, territory, threatDirector}`, `Colony.danger` |
| D1.17 | applied (already): `Colony.stores.toxin` |
| D1.18 | applied: `QueenState {mode, gut, reserve, reserveP, fecundity, eggBudget, layingLog, clutchLaid, founding {reserveLoads, R0, desiccation, wings, eggsLaid}}` |
| D1.19 | applied as types (game layer stores them): `DeviceProfile`, `CodexUnlock`, `LineageStore.settings` |
| D1.20 | applied as ids: `SAVE_SLOT_IDS`, `AUTOSAVE_LABELS`; save meta `population` belongs to the game-layer save task |
| D2.1-D2.3 | applied (already): `colony`, `hp/maxHp`, `cropC/cropP` |
| D2.4 | applied: `energy` in C loads, initialised to `RESERVE_CAP_BY_BAND` of the age band |
| D2.5 | applied (already): `lengthBu`, `massMg` |
| D2.6 | applied: `physioAgeGd`, `lifespanGd` |
| D2.7-D2.9 | applied (already): `stateTick`, flag bits (B3 names; `FIELDED`, `INJURED` are additive contract bits) |
| D2.10 | applied (already): `ActionInProgress {id, phase, startTick, durationTicks, target, repeat, reason}` (+ `secondary`) |
| D2.11 | applied: `acidRegenTick`, `layCooldownUntilTick` on the ant, `biteCdTick`, `specialCdTick`, `dodgeCdTick` in `CombatState` |
| D2.12 | applied: combat fields split as listed; `lock` object |
| D2.13 | applied: `TASK_COUNT` 18 sizes every task array |
| D2.14 | applied (already): `species` |
| D2.15 | applied: `stores {c, p, toxin, inCrops: {c, p}}` (+ `cap {c, p}`) |
| D2.16 | applied: Directives keys exactly as listed; `production`, `architect` removed |
| D2.17-D2.18 | applied (already) |
| D2.19 | applied: `Item.carrierIds` |
| D2.20 | applied (already): canonical item kinds, no `brood` item |
| D2.21 | applied: `units`, per-unit `c, p, toxin, water`, pool / stage fields (optional GDD fields are -1 / null) |
| D2.22 | applied (already): entrance `status`, `plugVoxelCount` |
| D2.23 | applied: top-level `targetChamberId`, `sourceChamberId`, `expiresTick`; `params {mode, priority}` (+ `chamberType`, `planId`) |
| D2.24 | applied (already): GDD 04 cavity ids, no `wall-void` |
| D2.25 | applied: `wildColonySize` (Lasius typical 5000-10000, max 17000) |
| D2.26 | applied: `HP_PER_MG23` 10, `BITE_PER_MG23` 1.0, `bite`; `CasteDef.fixedStats` (Lasius queen 50 / founding 40, gyne 35, male 6) |
| D2.27 | applied: tiers T1 / T2 / T3 |
| D2.28 | applied: `opening.dMinOpenBu` 8, `dMinCoverBu` 5, `vMinBu3` 10, `wMinBu` 3.5, `shaftTargetBu` 10, `R0` 56, `clutchCap` 48 |
| D2.29 | applied: `ScaleDef.growThreshold` 75, `matureThreshold` 700 (workers) |
| D3.1 | applied (already): regions |
| D3.2 | applied (already): `raid` |
| D3.3 | applied: canonical adult / brood / colony-failure lists of B3 |
| D3.4 | applied (already): `lay-egg`, `plant`, no `tear` |
| D3.5 | applied: `cx-*` only, B6 additions and families |
| D3.6 | applied: B6 aim union |
| D3.7 | applied: `OPENING_PROMPTS` removed, `hint-reserves` added |
| D3.8 | applied: four `ms-*` nest milestones; nest milestone kinds keep `survived-flood` (journaled `ms-first-flood-rescue`) |
| D3.9 | applied: `HISTORY_SERIES_IDS` |
| D3.10 | applied: `ok`, `info`, `warn`, `bad` |
| D3.11 | applied (already): 5 / 7 / 10 |
| D3.12 | applied: `CustomRules` = the B6 keys |
| D3.13 | applied: 35 alert kinds; auto-slow trigger ids removed |
| D3.14 | not a sim contract: views are game-layer ids (`possession` spelling is for src/game) |
| D3.15 | not a sim contract: input action ids and bindings are game/input-layer data |
| D4.1 | applied: `action {actionId, target?, secondary?, phase}` |
| D4.2-D4.3 | applied (already) |
| D4.4 | applied: `setSpeed {speed}` |
| D4.5-D4.6 | applied (already) |
| D4.7 | applied: `possess {antId?, role?, nearPos?}`; role ranking: task match, not fighting, not carrying brood, nearest, lowest id |
| D4.8 | applied (already) |
| D4.9 | applied: flat `setDirectives` with the D2.16 keys; the three reproduction commands removed |
| D4.10 | applied |
| D4.11 | applied: flat GDD 03 payload |
| D4.12 | applied (already) |
| D4.13 | applied: opening steps are `action` commands |
| D4.14-D4.16 | applied |
| D4.17 | applied: `flightControl` removed, `PlayerIntent.flight` |
| D4.18 | applied: `setDifficulty {preset?, custom?}`; `setHumanActivity` removed; generation-time rules (season length, start season, rival count) are never changed mid-game (GDD 06 §14.1) |
| D4.19 | applied (already): none of these is a sim command |
| D4.20 | applied: `command-rejected {commandType, reason}` |
| D5.1-D5.11 | applied (see the event table in (f)); D5.11's other consumers already existed |
| D5.12 | applied (no contract change: `ms-first-trail` is a progression rule) |
| D5.13 | applied (already): `cx-callow`, `cx-route-memory`, `cx-necrophoresis` exist |
| D6.1 | applied: 62 `diag-*` ids |
| D6.2 | applied: guidance record (+ additive `factor.diagId`, `focus`) |
| D6.3-D6.7 | applied: merged ids absent from `DIAGNOSTIC_IDS` |
| D6.8 | applied: auto-slow keyed on alert kind and level (`time.auto-slow {alertKind, level}`) |
| D6.9 | applied (already): `last-ants` |
| D6.10 | applied (already): `hintsMirror`, `player.promptLearned` |
| D6.11 | applied: aims and `cx-interface-orders`; `milestoneNotices` is a UI setting (not a sim contract) |
| D7.1 | applied (F1c review): `src/sim/time.ts` (the calendar module) adds `defaultYearDay(calTick, cfg)` → `d28` (0-based float, exact integer-tick arithmetic), `defaultYearDoy(calTick, cfg)` → `doy28`, `inDefaultYearWindow(calTick, cfg, a, b)` (`a − 1 ≤ d28 < b`), `currentDefaultYearDay/Doy(state)` and `DEFAULT_DAYS_PER_YEAR`; `LifeHistory.fSeason` and `layWindows` are keyed on `d28` (Lasius data re-keyed: `D − 1`) |
| D7.2 | applied (F1c review): environment `thermalInputs(sim, pos, out?)` → `ThermalInputs {T_top, T_dayMean, T_seasonMean, T_annual}` and `rainIntensityAt(sim, pos)` (stubs: T1 constants, 0); `env.thermal` gains `emaCell` (per 4 BU heightfield cell, `emaCellMm/Nx/Nz`) and `emaCover` (per cover primitive, `emaCoverPrimIds`), each interleaving [day mean, season mean], lazily allocated (ruling 3); `chamberTemp` documented as the GDD 03 §9.1 value; balance `RAIN_INTENSITY` (drizzle 0.1, shower 0.4, downpour 0.7), `RAIN_INTENSITY_STORM` 1.0, `RAIN_INTENSITY_SPRINKLER` 0.5, `THERMAL_DAY_EMA_TAU_GD` 1 |
| D7.3 | applied (F1c review): `BroodCaste = Exclude<Caste, 'queen'>` and `BROOD_CASTES`; `Brood.destined`, `egg-laid.destined`, `cheat.spawnBrood.destined`, `layEgg(…, destined)` and `SpawnBroodOptions.destined` narrowed (a narrowing made before any module consumes it; `destinedLengthBu` already present); `cheat.spawnBrood` rejects a non-brood caste from untyped JSON (`invalid-caste`) |
| D7.4 | applied: `progression.peakWorkers` (simulated workers; no `peakWorkerEq` anywhere) |

Registry B9 events not in the union, with reason: `speed-changed` (GDD 01) is the same event as GDD 06's
`time.speed-changed` and is emitted once under the GDD 06 name (E-71, E-73: no double emission);
`autosave.done` / `autosave.failed` are emitted by the game-layer save manager, which owns storage (architecture §7).
`entity-created` / `entity-removed` are contract-level lifecycle events (guidance §8) beyond B9.

## (h) Open questions

1. `speed-changed` vs `time.speed-changed`: one event kept (see above). Confirm.
2. Three plain-data exceptions use key presence as meaning: `config.difficulty.custom`, `Directives.taskShares`,
   `DeviceProfile.hints` (and lazily created history series). They never hold `undefined`. Acceptable?
3. `designateChamber` carries `chamberType` (GDD 03 writes `type`, which is the command discriminant).
4. Pose ids are stored without the `pose.` namespace (`walk` = `pose.walk`).
5. Preset rule values chosen by F1c from the GDD 06 §14 table: queen senescence off / off / on, collapse off / on / on,
   predators few / normal / many, weather severity normal for every preset, founding leniency lenient / normal /
   strict. difficulty-rules to confirm.
6. The release-alarm cooldown (`Ant.cd.alarm`) was dropped (not in D2.11); combat may add it additively.
7. Brood death causes `raided` and `poison` were removed to match B3; if bait toxin should kill brood, GDD 05/06
   need a canonical cause first.
8. The Lasius entrance-growth rule in species data (`entrances {start 1, perWorkers 400, max 4}`) does not yet encode
   GDD 03's "3 entrances, 4 from 800 workers"; species-data / architect to settle.
9. Rival T3 rows (`src/sim/species/rivals.ts`) are estimates marked [E]; rival cruise speed is not in the GDD (6 body
   lengths/s used).
10. `THERMAL_STATES` keeps `normal` beside the B6 states `heat-stupor`, `cold-coma` (an ant needs a neutral state).
11. Day convention of species curves: `fSeason` and `layWindows` are keyed on the 0-based `d28` (C1, E-123, D7.1).
    GDD 07 tables (Lasius §, Camponotus, Messor `fSeason(D)`) are still written on the 1-based `D = d28 + 1`:
    species-data must subtract 1 when entering them (Lasius already done). GDD 07 line "by 1-based `D = d + 1`"
    should be edited to `d28` by the design owner.
12. D7.2 storage: env-core added the additive optional `thermal.tsurfDay` / `tsurfSeason` (EMAs per material x shade,
    the `tsurf` layout). That is a compression of the per-cell EMAs valid while `T_top` depends only on material and
    shade; the contract keeps D7.2's per-cell / per-cover-primitive arrays (`emaCell`, `emaCover`, empty until
    allocated). env-core to choose one and document it; `thermalInputs` hides the choice from callers.
13. One source of truth for generation rules: `config.world.{difficulty, rivalCount, incipientCount, humanActivity}`
    are the generator's copies of `config.difficulty` / `config.rules`, taken by `syncWorldParams` in `createNewGame`
    (a prepared test world keeps its params). At run time systems read `config.rules` / `config.difficulty`, never the
    copies (so `setDifficulty {custom: {humanActivity: 'off'}}` needs no world change). Defaults come from
    `presetRivals` / `presetHumanActivity` in balance/difficulty.ts (worldgen's inline table removed).
14. `defaultYearDay` exists twice: `src/sim/time.ts` (contract, D7.1) and env-core's `defaultYearDayOf` /
    `inDefaultWindow` in `environment/calendar.ts` (and `REFERENCE_DAYS_PER_YEAR` beside `DEFAULT_DAYS_PER_YEAR`).
    env-core should delegate to the time.ts helpers.
