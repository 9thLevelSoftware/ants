# FOUNDRESS TDD 01 — Contracts map (F1b)

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
| `state.time.speed` / `.paused` | `env.time.speed / paused` (`TimeControlState`, owned by GDD 06) |
| `ant.controlled` | `Ant.flags & AntFlag.POSSESSED` |
| `ant.suspendedTask` | `Ant.suspendedTask: Task \| null` |
| `ant.action` | `Ant.action: ActionInProgress { id, phase, startTick, durationTicks, target, repeat, secondary, reason }` (`t` derives from `startTick`) |
| `ant.trailOn` | `Ant.flags & AntFlag.TRAIL_ON` |
| `ant.acid`, `ant.acidRegenT` | `Ant.acid`, `Ant.cd.acidRegen` (absolute tick) |
| `ant.layCooldownT` | `Ant.cd.lay` |
| `ant.dirt` | `Ant.dirt` |
| Game view, camera rig, input, settings | **deferred**: game layer (`src/game`, `meta.view`, `meta.camera`, localStorage), not SimState |

Commands (App. B)

| Item | Representation |
| --- | --- |
| `possess {antId}` | `{ type: 'possess', antId, via: PossessMethod, dropTo1x? }`; role keys → `{ type: 'possessRole', role, dropTo1x? }`. Possession start (not a switch between ants) forces 1x, or clamps to 4x when the game passes the player's `dropTo1xOnPossess = false`; a pause stays a pause; `requested` follows (release does not restore) → `time.speed-changed` reason `possession` |
| `release {reason}` | `{ type: 'release', reason: ReleaseReason }` |
| `set-intent` | `{ type: 'setIntent', intent }` and `sim.setPlayerIntent(intent)` |
| `act {action, target, secondary, phase}` | `{ type: 'action', action, target: TargetRef \| null, secondary, phase }` |
| `set-trail {on}` | `{ type: 'setTrail', on }` |
| `set-speed {level}` | `{ type: 'setSpeed', level: SpeedLevel }` (8x refused while possessing → `speed-refused`; `POSSESS_MAX_SPEED` = 4) |
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

Diagnostics (App. D): possessed movement → `possessed-movement`; possessed action → `possessed-action`; possession
availability → `possession-availability`; input → `input` (GDD 08 id); time speed → `time-speed`; released ant →
`released-ant`. All in `DIAGNOSTIC_IDS`, record shape `Diagnostic`.

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
| `stores {C,P,toxin,inCrops}` | `Colony.stores: ColonyStores { c, p, toxin, inCropsC, inCropsP, capC, capP }` |
| `ledger {in, out, transit}` | `Colony.ledger: ColonyLedger` (flattened per nutrient) |
| `needs {rateC,rateP,needC,needP,sP}` | `Colony.needs: ColonyNeeds` (+ `proteinDeficit`, GDD 05) |
| `starvationStage`, `starvationSince` | `Colony.starvationStage`, `starvationSinceTick` |
| `directives {allocation,diet,production,architect,stockTarget,stayIn,stayInUntil}` | `Colony.directives: Directives` |
| `alloc {demand Float32Array(17), target, actual, lastTick}` | `Colony.alloc: AllocationState` (arrays sized `TASKS.length`, now 18 with `raid`) |
| `yieldPerForager`, `news[5]`, `knownSourceIds`, `exploredBits` | `Colony.yieldPerForager`, `news: SourceNews[]`, `knownSourceIds`, `exploredBits` (empty until the scouting module sizes it) |
| `jobBoard` | **deferred**: derived runtime cache of colony-core |
| `counters` | `Colony.counters: ColonyCounters` |
| `series` | `ProgressionState.stats` (`StatsHistory`: series id → core `TimeSeries`, hourly and daily) |
| `ants[]` fields | `Ant`: `colonyId`→`colony`, `scale`→`lengthBu`, `physioAge`→`physioAgeTicks`, `lifespan`→`lifespanTicks`, `health`→`hp/maxHp`, `crop`→`cropC/cropP`, `reserve`→`energy` (0..1 of the age-band cap), `fatigue`, `task`, `state`, `stateT`→`stateTick`, `target`, `carry`, `thresholds: Float32Array`, `activation`, `lead`→`mem.lead`, `homeVec`→`mem.homeVec`+`homeVecErr`, `crumbs`→`mem.crumbs/crumbHead/crumbLen`, `routes`→`mem.routes: RouteMemory[]`, `depleted`→`mem.depleted`, `decisions`→`mem.decisions` |
| queen extras | `Ant.queen: QueenState { mode, gutC, gutP, reserveC, reserveP, fecundity, eggBudget, layingLog: Int16Array(28), clutchLaid, ... }` |
| `brood[]` | `Brood` (`progress` is 0..1 within the stage, not DU; `hungerT`→`hungerTicks`, `pStarveT`→`pStarveTicks`; `pos` + `carriedBy`) |
| `items[]` | `Item` (kinds reconciled, see (b)); `carrierIds`→`carriers` (+ `carriedBy` primary); `diedTick`→`createdTick` of the corpse item |
| `markers[]` | `Marker` (`params.targetChamberId / sourceChamberId`, `expiresTick`) |
| `phero` | `PheromoneState { cell, chunkCells, layers: PheromoneLayer[] (colony, channel, keys, chunks), lastDecayTick }` |
| `colonyRng` | `SimState.rngStreams` (named streams `RNG_STREAMS`, `sim.stream(name)`) |
| Derived caches (ant hash, job board, brood scores, capacity) | `EntityIndex` service; the rest **deferred** to their module runtime caches |

Commands (App. B): `setDirectives` → `{ colonyId, patch: DirectivesPatch }`; `placeMarker` → `{ kind, pos, radius, mode,
chamberType, chamberIds }`; `removeMarker {markerId}`; possession commands as GDD 01; cheats `cheat.addFood`,
`cheat.spawnAnts` (+ `caste`), `cheat.spawnBrood`, `cheat.setChamberClimate`, `cheat.setQueen`, `cheat.injectReturn`
(each takes the colony id). Queries `query.ant/brood/colony/phero/ledger` and `summary().colony`: **deferred** to the
debug API (read-only views over state; F3 app shell).

Events (App. C): `ant-eclosed`, `ant-died` (payload merged with GDD 05: `antId, colonyId, cause, pos, task, caste`),
`egg-laid`, `brood-stage`, `brood-died`, `brood-moved`, `feed` (`broodId` −1 when the receiver is an ant), `trophallaxis`,
`delivery` (+ `colonyId`, `toxin`), `recruit`, `forager-departed`, `source-discovered` (+ `colonyId`),
`trail-established`, `trail-lost`, `route-learned`, `task-changed`, `stores-full`, `starvation-stage`, `cannibalism`,
`corpse-removed`, `waste-dumped`, `alarm-raised` (merged with GDD 05: `colonyId, pos, strength, by, source`),
`coop-transport` (phases + `stalled`), `marker-response`; `diagnostic-changed` → `diag.changed` (GDD 06).

Diagnostics (App. D): `food-intake-c`, `food-intake-p`, `stores`, `brood-growth`, `egg-laying`, `queen-condition`,
`workforce`, `foraging-trails`, `defence`, `mortality`, `hygiene`. Alerts `food-c-low`, `food-p-low`, `brood-stalled`,
`trail-lost`, `source-found`, `colony-starving`, `stores-full`, `queen-died` in `ALERT_KINDS`. Time-series ids: string
keys of `StatsHistory`, **deferred** as a fixed set to colony-core (series are created lazily).

Identifiers: `ALLOCATION_GROUPS`, `AGE_BANDS`, ant flags → `AntFlag`, brood flags → `BroodFlag`, `QUEEN_MODES`,
`METABOLIC_CLASSES`, `BEHAVIOUR_STATES`, `NURSERY_JOBS`, `STARVATION_STAGES`, `BROOD_DEATH_CAUSES`, `DEATH_CAUSES`,
`WASTE_KINDS`, `REASON_CODES` (+ template forms `deficit:<task>`, `marker:<kind>`, `job:<kind>`), `PRODUCTION_MODES`,
`STOCK_TARGETS`, `ARCHITECT_MODES`. Remedy ids (`remedy.*`): free strings in `Diagnostic.remedies`, **deferred** as a set
to progression/UI (they are UI mapping keys).

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
`flood-level`, `flood-ended`, `ant-submerged`, `ant-drowned`, `brood-drowned`, `collapse-warning`, `collapse`,
`nest-milestone`, and `cue` (`eventsProgression.ts`).

Diagnostics (App. D): `dig-progress` (per plan: id `dig-progress:<planId>`), `nest-space`, `nest-climate`, `nest-flood`,
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
| `SimState.world.heightDeltas`, `.grassHeightMm`, `.dynPrims`, `.microState`, `.waterLevels` | `WorldDelta.heightDeltas`, `grassHeightMm`, `dynamicPrims` (+ `objectStates` for moved/opened objects), `microState`, `waterLevels` |
| `SimState.human`, `HumanEventInst`, `HumanEventRun`, `Cue` | `env.human: HumanState`, `HumanEventInst`, `HumanEventRun`, `HumanCue` |
| Initial entities: `FoodAnchor`, `Territory`, rival seeds, queen start | `WorldData.placements { foodAnchors, plants, territories, rivalSites }`, `WorldData.queenStart: StartPose` |
| Pre-existing cavities / copy-on-write chunks | `WorldData.preCarve: PreCarveOp[]` applied by `createNewGame` with `force`; the `preexisting` voxel flag is **deferred** with the voxel flags |

Commands: `world.generate` / `world.preview` → `generateWorld(params)` (pure function, `src/worldgen`); `world.inspectPoint`,
`query.world.*`, `world.forceValidationFail`: **deferred** to worldgen / debug API; `rules.setHumanActivity` →
`setHumanActivity`; cheats `cheat.humanEvent`, `cheat.setGrass`, `cheat.setWater`, `cheat.revealMicro`.

Events: `worldgen.progress`, `worldgen.retry`, `worldgen.complete`, `world.micro-discovered`, `world.zone-first-entry`,
`world.terrain-deformed` (`cells bbox` → `min/max`), `world.cave-in`, `world.dynprim-changed`, `world.grass-mown`,
`human.scheduled` (`list` → `instIds`), `human.telegraph`, `human.start`, `human.end`, `human.cancelled`, `human.impact`,
`human.casualties`, `human.bait-placed`, `human.bait-removed`, `sound.cue` — all in `eventsWorld.ts`.

Diagnostics: `diag-site`, `diag-human-pressure`, `diag-access`, `diag-connections`, `diag-bait`, `diag-exposure`.

Identifiers: `ARCHETYPES`, `REGIONS`, `WORLD_SIZES`, `ZONE_VARIANTS`, `plaster` (geom), `FOOTSTEP_CLASSES`, `MICRO_KINDS`,
`CAVITY_KINDS`, `POI_KINDS`, `CLIMB_ROUTE_KINDS`, `NAV_CLASSES`, `WATER_BODY_KINDS`, `DECOR_LAYERS`, `WORLDGEN_CHECKS`,
`HUMAN_VARIANTS` (one flat set; GDD 04's unnamed "street broom" schedule → `street-broom`), `HUMAN_CUE_KINDS`,
`AMBIENT_STATES`, `SUITABILITY_CLASSES`, `SUITABILITY_FACTORS`, `HOST_FLAGS`. Object template ids, repairs `R1..R5`, RNG
labels `wg/*`: **deferred** to the worldgen catalogue (content strings; `WorldObject.templateId: string`).

### GDD 05 — ecology, creatures, rivals, combat

State (App. A)

| Item | Representation |
| --- | --- |
| `ecology.sources` | `SimState.sources: FoodSource` (`units` → `amount`; `pool`, `poolCap`, `refillPerGd`, `quality`, `hardness`, `slots`, `drinkRateMult`, `stage`, `stageClock`, `discoveredBy`, `avoidBy`, `spawnedTick`, ...) |
| `ecology.herds` | `SimState.ecology.herds: Herd` (`A`→`a`, `E`→`e`, `tenderSeconds: Float32Array(8)`) with a `herds` store |
| `ecology.hostPlants` | `SimState.plants: PlantState` (`herdIds`) |
| `ecology.preyPatches`, `ecology.hazards` | `EcologyState.preyPatches: PreyPatch`, `hazards: Hazard` |
| `ecology.items` extension | `Item` fields `lengthMm, massMg, hardness, carriers, stage, stageClock, necroCueTick, species, colony, unreachableBy, aliveUntilTick, toxin, water` |
| `ecology.director` | `EcologyState.director: CreatureDirector` |
| `ecology.birdEvent`, `lastBirdTick` | `EcologyState.bird: BirdEvent \| null`, `lastBirdTick: Record<colonyId, tick>` |
| `ecology.carrionAcc` | `EcologyState.carrionAcc: Float32Array` |
| `creatures` | `Creature extends Walker` (`health` → `hp/maxHp`; `homeCenter, homeRadius, deterrence, harass, seizedAntId, eaten, lifeEndTick, nestId`) |
| `rivals` | `Colony` with `fidelity: 'abstract'` and `Colony.abstract: AbstractColonyState { n, b, cS, pS, queens, aggression, knowsNest, orphaned, incipient, raid, lastRaidTick, fieldedIds, virtualTend, territorySlot }` |
| `relations` | `SimState.rivals.relations: RivalRelation` (`E` → `e`) |
| `territory` | `SimState.rivals.territory: TerritoryGrid` (`marks` empty until the rivals module allocates) |
| `danger` | `SimState.ecology.danger` (`data` empty until allocated) |
| `threatDirector` | `SimState.rivals.threat: ThreatDirector` |
| Ant combat fields | `Ant.hp/maxHp`, `Ant.injuries` (bits), `Ant.acid`, `Ant.cd.{bite,special,dodge,acidRegen}`, `Ant.alarmLevel`; fight-time fields `lock`, `heldBy`, `pinned`, `seizedBy`, `escape`, `paralysedUntilTick`, `stuckSinceTick`, `disorientedUntilTick`, `dodgeUntilTick`, `fightDamage`, `recentHitters` → `Ant.combat: CombatState \| null` |
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
`carcass-butchered`, `creature-spawned/-despawned/-died`, `predator-telegraph`, `predator-strike`,
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
| `calendar.tick, startTick` | `SimState.tick` + `env.calendar.startOffsetTicks` (calendar tick = `time.calendarTick(state)`) |
| `calendar.foundingTick`, `moonPhase0` | `env.calendar.foundingTick`, `moonPhase0` |
| `calendar.seasonLengthDays` | `config.rules.seasonLengthDays` (5/7/10, see (b)) |
| `calendar.derived` | `env.calendar.derived: CalendarDerived` (`d` → `yearFrac`; `SR/SS/L` → `sunrise/sunset/dayLength`; + `weekday`) |
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
| `history.daily / hourly` | `ProgressionState.stats: StatsHistory` (core `TimeSeries` per series) |
| `deaths` | `ProgressionState.deaths { byCause, bySeason, recent }`; the cause×caste×role count matrix **deferred** (derivable from `recent` + counters; progression may add it) |
| `repro` | `Colony.reproduction: ReproductionState`; `investment/gyneShare/policy` → `Directives.alateInvestment/gyneShare/alatePolicy` |
| `colony.queens`, `orphanedAt`, `livingAnts` | `Colony.queens`, `orphanedAtTick`, `livingAnts` |
| `difficulty {preset, params, custom, history}` | `config.difficulty` + `config.rules`; preset params **deferred** to `balance/difficulty.ts` (difficulty-rules); history **deferred** (Lineage record has `difficultyHistory`) |
| `autosave.meta` | **deferred**: game layer |
| device stores `lineage`, `codex` | `LineageStore`, `LineageColonyRecord`, `DaughterRecord`, `FlightRecord` types (not SimState); in-game link `ProgressionState.lineage: LineageLink`; codex device store **deferred** to game layer (in-game `codexSeen`) |

Commands (App. B): `SetSpeed` → `setSpeed`; `TogglePause` → `togglePause`; `SetAutoSlow` → `setAutoSlow`;
`SkipToNextEvent` → `skipToNextEvent`; `OpeningSkipIntro`, `OpeningSniff`, `OpeningSeal`, `OpeningPlantFungus`,
`QueenLayBatch`, `OpeningBeginTimelapse`, `OpeningInterruptRespond`, `OpeningUndo` → camelCase same names;
`OpeningTimelapseSkip` → `skipTimelapse`; `OverwinterChoice`, `OverwinterSkip`, `SetAlateInvestment`, `SetGyneShare`,
`SetAlatePolicy`, `FlightRelease`, `FlightPossess`, `FlightControl`, `FlightLand` → camelCase; `RetireColony` →
`retireColony`; `SetDifficulty` → `setDifficulty`; `LineageFoundDaughter`, `FoundAgain`, `Save/Load/QuickSave/QuickLoad`,
`Export/Import/ExportLineage`: **deferred** to the game layer (they start games or touch storage). Cheats: `setTime`,
`setWeather`, `setWind`, `setAnomaly`, `noLag`, `completeFounding`, `addWorkers` → `cheat.spawnAnts`, `setQueenAge`,
`forceFlight`, `unlockCodex`, `triggerWinter`, `killQueen`, `killAll`, `setStores`. `applyPendingCommands()` →
`Sim.applyPendingCommands`.

Events (App. C): all in `eventsWorld.ts` / `eventsProgression.ts` with the same names: `time.hour`, `time.phase`,
`time.day`, `time.season`, `time.year`, `time.speed-changed`, `time.speed-limited`, `time.auto-slow`,
`weather.changed`, `weather.gust`, `weather.thunder`, `weather.lightning`, `weather.dew`, `weather.puddle`,
`env.heat-stupor`, `env.cold-coma`, `opening.phase`, `opening.site-assessed`, `opening.readiness`, `opening.sealed`,
`opening.egg-batch`, `opening.timelapse`, `opening.handover`, `opening.failed`, `queen.egg-eaten`, `queen.hazard`,
`overwinter.notice/banner/begin/beat/end`, `overwinter.report`, `milestone.reached`, `journal.entry`, `aim.opened`,
`aim.completed`, `stage.changed`, `codex.unlocked`, `alate.eclosed`, `flight.eligible`, `flight.launched`,
`flight.possessed-start/-end`, `flight.ended` (record summary `id, nFounded`; the record lives in the Lineage store),
`lineage.daughter-added`, `queen.died`, `colony.orphaned`, `colony.extinct`, `epitaph.ready`, `diag.changed`,
`ambient.cue`. `autosave.done/failed`: **deferred** to the game layer. `diag.envNaN`: debug log, **deferred** (log, not
an event).

Diagnostics (App. D): `diag-surface-activity`, `diag-heat-exposure`, `diag-overwinter-readiness`,
`diag-founding-outcome`, `diag-reproduction-readiness`, `diag-flight-day`, `diag-queen-status`, `diag-autosave`;
`diag-nest-climate` → merged into `nest-climate`; `diag-flood-risk` → merged into `nest-flood` (b). Status words mapped (b).

Identifiers: `CLIMATE_IDS`, `DAY_PHASES`, `OPENING_PHASES`, `STAGES` (stage flags are `StageState.flags`), `WINTER_MODES`,
`WINTER_PHASES`, `THERMAL_STATES`, `RAIN_CLASSES`, `FOUNDING_HAZARDS`, `OPENING_PROMPTS`, `FOUNDING_FAIL_CAUSES`,
`DEATH_CAUSES` (union), `ALATE_STATES`, `FLIGHT_PHASES`, `ALATE_POLICIES`, `AUTO_SLOW_MODES`, `AUTO_SLOW_TRIGGERS`,
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
| `progression.stats` | `ProgressionState.stats` |
| `foundress.settings.v1`, `foundress.profile.v1`, save `meta`, `UiSnapshot`, runtime UI state | **deferred**: UI / game layer (never SimState) |

Commands: `possess {antId} | {role}` → `possess` / `possessRole`; `release`; `action {actionId, target}` → `action`;
`setDirectives {allocation, production, casteRatio, diet, architect}` (`casteRatio` → `casteEmphasis`); `placeMarker
{kind,pos,radius,params}`; `removeMarker`; `planDig {nestId, template, chamberType, anchor, rotation, size, priority}` →
`planDig { spec }` (`template` → `kind`, `rotation` → `yawDeg`); `cancelPlan`; `designateChamber`; `setAutoExpand {on}`
→ `{ nestId, mode }` (GDD 03 shape); founding steps → `opening*` commands; `skipTimelapse`; NEW `timelapseStepIn`,
`acknowledgeAlert`, `storeThumbnail`, `setDifficulty`. Game/UI intents (`setSpeed` as UI call, `openScreen`, `save`,
`capturePhoto`, ...): game layer (time speed itself is the sim command `setSpeed`).

Events consumed: `alert {op, alert}` → `alert`; `milestone` → `milestone.reached` (+ `title`); `cue`; `observe`;
`hint-trigger`; `aim {aimId, op}` → `aim.opened` / `aim.completed`; `possession` → `possession-started/-ended`;
`ant-died`; `human-event` → `human.telegraph` / `human.start` / `human.end`; `weather` → `weather.changed`; `timelapse`
→ `opening.timelapse` / `overwinter.*`; `game-over` → `colony.extinct` + `epitaph.ready` (+ `ProgressionState.finalCauses`);
`chunk-dirty` → `carve-chunks-dirty`; `breach`. UI-emitted local events: **deferred** to the UI layer.

Diagnostics: `perf`, `audio`, `storage`, `input` reserved in `DIAGNOSTIC_IDS` (published by the game layer).

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
| 6 | Diagnostic id prefixes (`food-intake-c` vs `diag-*`) | Owner names kept, no prefix rewriting (GDD 02 allowed either). Duplicates merged: GDD 06 `diag-nest-climate` → GDD 03 `nest-climate`; GDD 06 `diag-flood-risk` → GDD 03 `nest-flood`. Per-subject instances use `<id>:<subjectId>` |
| 7 | Diagnostic statuses: `ok/warn/bad` (guidance, 02, 03, 08) vs GDD 06 `ok/watch/warn/critical`, `headline` | `ok/warn/bad`; GDD 06 mapping ok→ok, watch→warn, warn→warn, critical→bad; `headline` → `label` |
| 8 | Aims: GDD 06 vs GDD 08 lists | Union; `aim-protein` → `aim-first-protein`, `aim-reopen` → `aim-nest-open`, `aim-plant-garden` → `aim-garden` (GDD 06 names) |
| 9 | Codex ids: GDD 06 `cx-*` vs GDD 08 descriptive ids | GDD 06 `cx-*` (codex mechanism owner); codex-content maps GDD 08's onboarding references |
| 10 | Command naming: GDD 01 kebab (`set-intent`, `act`), GDD 06 PascalCase, GDD 02/03/08 camelCase | camelCase `type` strings; cheats `cheat.<camelCase>`. GDD 01 `act` → guidance name `action` |
| 11 | Event naming | Owner strings kept (kebab for GDD 01/02/03/05/07, dotted for GDD 04/06). Duplicates: `speed-changed` → `time.speed-changed`; `milestone` → `milestone.reached`; `weather` → `weather.changed`; `diagnostic-changed` → `diag.changed`; GDD 05 `coop-transport-*` → GDD 02 `coop-transport {phase}`; `ant-died`, `alarm-raised` payloads merged; `aphid-moved` uses GDD 05 payload names |
| 12 | Ant field names: digest (`colonyId`, `health`, `reserve`, `physioAge`, `controlled`, `trailOn`, `scale`) vs guidance §5 | Guidance names (`colony`, `hp/maxHp`, `energy`, `lifespanTicks` + `physioAgeTicks`, flags `POSSESSED`/`TRAIL_ON`); `scale` → GDD 07 `lengthBu` |
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
| 24 | GDD 07 schema constant names (`Q_MAX`, `REPRO_MAX_FRAC`, `R0`, acidopore/sting) | camelCase in code: `qMax`, `reproMaxFrac`, `reproGyneShare`, `r0`, `appearance.rearWeapon` |
| 25 | Walker extras not in the guidance | additive: `Walker.radius`, `NavState.fieldKind`, `NavState.routeId` |
| 26 | Herds: guidance "plants: dynamic state of host plants (herds, nectar)" vs GDD 05 separate `ecology.herds` | GDD 05: herds in `SimState.ecology.herds` (own store), plants keep `herdIds` |

---

## (c) PROVISIONAL

| Item | Why | Owner who confirms |
| --- | --- | --- |
| `WorldField` interface (`types/services.ts`) — PROVISIONAL (kernel) | written from guidance §7; `src/sim/world/field.ts` did not exist yet | F2-kernel / integration |
| `NestNav` interface — PROVISIONAL (kernel) | `src/sim/nest/nav` did not exist yet | F2-kernel / integration |
| `CarveGrid` | NOT provisional: re-exported from the kernel's `src/sim/nest/carve` (it existed) | — |
| `SpeciesDef` / `CasteDef` schema — PROVISIONAL | written from GDD 07 §3 and App. A–D directly before digest 07 existed; Lasius data minimal; not yet cross-checked against the digest | species-data |
| `PlayerIntent.held: ActionId[]` | the game maps held inputs to the species' action ids | actions / F3-appshell |
| `PheromoneState` layout (per colony+channel layers of 16^3 chunks) | phero task may change the internals but must stay plain data | phero |
| `WorldMaps`, `NavGridData` subsets | GDD 04 lists more maps; T1 subset only | worldgen-terrain, loco |
| `CalendarDerived` filled by `createGame.deriveCalendar` (sine day length, simple phases) | placeholder until env-core | env-core |
| Placeholder services in `src/sim/testing/placeholders/` (terrain-only field, unreachable nest nav, open nav grid, minimal pheromones) | to be replaced through the module `index.ts` factories | F2-kernel, loco, phero |
| Stub module APIs (`src/sim/<module>/index.ts`) | signatures final in intent; bodies are safe no-ops | each module task |
| `EntityIndex` cell size `INDEX_CELL_BU = 8` | tuning | beh-forage / perf |
| Event payload details where the chapters were loose (`flight.ended`, `human.scheduled`, `mound-changed`) | summarised to ids and numbers | owners |

---

## (d) Systems in tick order (`src/sim/systems.ts`)

| # | System name | Export (module) | Phase (architecture §3) | Owner task |
| --- | --- | --- | --- | --- |
| 1 | `commands` | `commandsSystem` (`sim/commands.ts`) | commands | F1b |
| 2 | `calendar` | `calendarSystem` (environment) | environment: time | env-core |
| 3 | `weather` (every 25) | `weatherSystem` (environment) | environment: weather | env-core |
| 4 | `human-events` | `humanEventsSystem` (environment) | environment: human events | human-events |
| 5 | `environment-effects` (every 50, offset 30) | `environmentEffectsSystem` (environment) | environment: moisture, washing | weather-effects |
| 6 | `sources` (every 250, offset 5) | `sourcesSystem` (ecology) | ecology: sources | sources-core |
| 7 | `plants` (every 250, offset 55) | `plantsSystem` (ecology) | ecology: plants | ecology-plants |
| 8 | `allocation` (every 100, offset 15) | `allocationSystem` (colony) | colony allocation | colony-core |
| 9 | `queen` | `queenSystem` (colony) | queen / eggs | colony-core |
| 10 | `founding` | `foundingSystem` (colony) | queen / founding | founding |
| 11 | `brood` | `broodSystem` (colony) | brood | colony-core |
| 12 | `perception` | `perceptionSystem` (ants) | perception | beh-forage |
| 13 | `behaviours` | `behaviourSystem` (ants) | ant behaviours | beh-forage, beh-nest |
| 14 | `player-control` | `playerControlSystem` (ants) | player control | actions |
| 15 | `actions` | `actionSystem` (ants) | action completion | actions |
| 16 | `creature-director` (every 50, offset 40) | `creatureDirectorSystem` (ecology) | creature AI | creatures |
| 17 | `creatures` | `creatureSystem` (ecology) | creature AI | creatures |
| 18 | `locomotion` | `locomotionSystem` (locomotion) | locomotion | loco |
| 19 | `combat` | `combatSystem` (combat) | combat | combat |
| 20 | `nest` | `nestSystem` (nest) | nest: carve ops, chambers, nav fields | nestops |
| 21 | `architect` (every 600, offset 320) | `architectSystem` (nest) | nest: architect | architect |
| 22 | `pheromones` (every 10) | `pheromoneSystem` (pheromones) | pheromones | phero |
| 23 | `economy` | `economySystem` (colony) | colony economy | colony-core |
| 24 | `colony-stats` (every 250, offset 105) | `colonyStatsSystem` (colony) | colony stats | colony-core |
| 25 | `overwinter` | `overwinterSystem` (colony) | colony economy phase | overwinter-repro |
| 26 | `reproduction` | `reproductionSystem` (colony) | colony economy phase | overwinter-repro |
| 27 | `rivals` (every 250, offset 155) | `rivalsSystem` (rivals) | rivals | rivals |
| 28 | `progression` | `progressionSystem` (progression) | progression | progression |
| 29 | `diagnostics` (every 250, offset 205) | `diagnosticsSystem` (progression) | progression | progression |
| 30 | `lifecycle` | `lifecycleSystem` (ants) | lifecycle | actions |
| — | sweep dead entities, `tick++`, flush events | `sim.tick()` | flush events | F1b |

Cadences and stagger offsets live in `src/sim/balance/cadence.ts`. A system runs when `(tick + offset) % every === 0`;
the offsets keep every periodic system of 50 ticks or more on its own tick (checked by `commands.test.ts`), so hourly
work does not spike on one tick. `tick()` refreshes the entity index first, and `applyPendingCommands()` refreshes it
again when it applied any command, so entities spawned or killed by commands are visible to the same tick's queries.
Commands are taken out of the queue before they are applied; an unknown type, a disabled cheat or a throwing handler
becomes `command-rejected` (`reason` `unknown-type` / `cheats-disabled` / `handler-error`, optional `detail`), so one bad
command can never block later ticks.

---

## (e) Questions for the orchestrator

1. **Kernel reconciliation.** `CarveGrid` is the kernel's own interface (re-exported). `WorldField` and `NestNav` are
   provisional: should the integration pass adapt the kernel's `field.ts` / `nav` to these interfaces, or replace the
   interfaces with the kernel's exports (as done for the carve grid)?
2. **Voxel flags.** GDD 03 needs per-voxel `LOOSE/NATURAL/PLUG` flags in saves. `CarveData` (geom.ts) has no flag
   array. Proposal: additive `flags?: (Uint8Array | null)[]` parallel to `chunks` (null = no flags). Kernel/orchestrator
   decision.
3. **Lazily allocated grids.** `Colony.exploredBits`, `rivals.territory.marks` and `ecology.danger.data` start empty and
   are sized by their owners on first use (a standard map would otherwise add ~2.5 MB to every save). OK?
4. **Per-agent weights in GDD 06.** Stage, milestone and alate thresholds are written in `W_eq`; directions §K says
   simulated workers. Contracts carry only simulated counts (`livingAnts`, `peakWorkers`); GDD 07 `realEstimate` is
   presentation only. The progression task needs the restated thresholds.
5. **Rival-only species.** `getSpecies()` returns undefined for `RIVAL_SPECIES_IDS`; `spawnAnt` then uses standard-worker
   stats. Should rivals get minimal `SpeciesDef`s (rivals task) or a separate lighter `RivalSpeciesDef`?
6. **Time controls in the sim.** `setSpeed`/`togglePause` are sim commands writing `env.time` (GDD 01/06 persist them);
   the game loop reads them. The 8x-while-possessing refusal is implemented in `commands.ts`. Confirm this split.
7. **Diagnostic ids.** Owner names kept without a common `diag-` prefix (mixed today). Confirm, or choose one scheme now
   before modules publish.
8. **`livingAnts` bookkeeping.** `spawnAnt`/`killAnt` maintain `Colony.livingAnts` (all adults, queen included, so
   "game over when no ants remain" and the last-three-ants alert read it directly). Worker-only counts (`N` in GDD 02)
   come from the allocation cache. Confirm.
9. **Commands on stub handlers.** About 60 handlers are no-ops annotated with their owner; the integration pass points
   them at module functions (one line each). Alternatively modules could register handlers; the table keeps the
   compile-time completeness check either way.
10. **Lasius male upkeep.** GDD 07 (caste table, digest 07) gives the Lasius male 0.06 C/GD; GDD 06 §11 (alate upkeep
    table) gives 0.08. The species file carries both (`castes.male.upkeepOverride` 0.06, `reproduction.maleUpkeepC`
    0.08). Proposal: caste upkeep is species data, so GDD 07's 0.06 wins and `maleUpkeepC` is set to match once
    species-data confirms. Which value is right?
11. **`dropTo1xOnPossess`.** It is a player setting (game layer); the sim only sees it through the optional
    `dropTo1x` field of `possess` / `possessRole` (default true). The game must pass it on every possession command.
