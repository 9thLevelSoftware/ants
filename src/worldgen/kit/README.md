# Worldgen placement kit

The API that content modules use to fill the generated world. Pure, deterministic, Node-testable.
Import everything from `src/worldgen/kit` (the barrel `index.ts`). Units: mm, Y up, `ctx.dims.bu` = body unit.

## 1. Registering content

Create `src/worldgen/place/<area>/index.ts`, `src/worldgen/populate/index.ts` or
`src/worldgen/catalog/<area>/index.ts` and export:

```ts
export const worldgen: WorldgenModule = {
  placers: [{ id: 'outdoor/paving', step: 'structures', order: 10, provides: ['micro'], run: (ctx) => { ... } }],
  repairs: [{ id: 'R1', check: 'v-micro', run: (ctx) => openBestSocket(ctx) }],
  templates: { 'flat-stone': (rng) => flatStoneTemplate(rng) },
};
```

The pipeline discovers these files at build time (Vite eager glob: static imports, so the single-file classic
bundle includes them) and sorts them by path. Nothing else to edit.

- **Steps** (GDD 04 §4.2 order): `structures` (3), `props` (4), `plants` (5), then the derived maps (6) run, then
  `resources` (7), `rivals` (8), `cavities` (9), `start` (10), then validation (11). Within a step: `order`, then id.
- **Defaults**: `default/building-shell` (structures: floor slab, garden wall with back door and door crack, back
  wall, ceiling, sealed house block) and `default/start-pose` (start). A placer with the same id replaces them.
- **`provides`**: content kinds the placer produces (`micro`, `food`, `rivals`, `props`, `plants`, `holes`,
  `lanes`). Validation checks about content no placer provides report `n/a` (GDD 04 §4.3 checks need next-stage
  content: v-food, v-micro, v-rivals, v-rest, v-enclose). Declare it, or call `provide(ctx, kind)`.
- **`archetypes`**: optional filter.
- **RNG**: `ctx.rng('wg/props/twigs')` is a fresh stream for that label (same label, same stream);
  `ctx.rngFor(label, i)` is the per-object sub-stream (DET-2). Never share a stream across categories.
- **Repairs** run on the best attempt after 8 failed attempts, for the checks that failed; return true if the
  world changed (the id is listed in `WorldMeta.repairs`).
- Placers in `resources` and later steps may read the derived maps (`mapState(ctx)`, `computeSuitability`,
  `navDistances`). If they add primitives or terrain holes the maps are derived again before `start`.

## 2. What a placer can read

- `ctx.params`, `ctx.dims` (`size`, `cell` 4 BU, `cells`, `navCell` 16 BU, `navN`, `bu`), `ctx.attempt`, `ctx.seed`.
- `ctx.layout` (`layout/types.ts`): zone table (`zones`, with `mulched` beds), 16 BU and 4 BU zone rasters, built
  shapes (rects and path polylines), `house` (strip, kitchen slice, back door, sealed parts), `carPark` (bays,
  aisle), `kerbs` (asphalt edges with the road-side normal), `raisedBeds`, `humanNodes`, map `edges`.
- Queries: `zoneAt`, `zoneTypeAt`, `inZones`, `terrainAt` (bilinear heightfield), `supportAt(ctx, x, z, belowY?)`
  (top of terrain or of a primitive below `belowY`), `primIndex(ctx)` (2D index over the primitives placed so far).

## 3. Placing objects

```ts
const tpl: ObjectTemplate = { id: 'flat-stone', tags: ['prop'], prims: [{ shape: 'ellipsoid', pos: {x:0,y:15,z:0},
  size: {x:60,y:15,z:40}, material: 'stone', flags: PrimFlag.CLIMBABLE | PrimFlag.SHELTER }],
  routes: [{ kind: 'stump-top', points: [...] }], pois: [{ kind: 'shelter', pos: {...} }] };
const id = placeObject(ctx, tpl, { x, z, yaw, embed: 10, collide: true, category: 'props' }); // -1 if rejected
```

- Template space: origin at the object's base centre, Y up. Primitive `size` as in `Primitive`.
- Resting (default when `y` is not given): the support surface is sampled at the centre and 4 footprint corners,
  the object tilts to the fitted plane (<= 20 deg; `tilt: false` to keep it upright) and sits so that its lowest
  local plane does not float above the support anywhere (`embed` sinks it further). `belowY` ignores supports
  above a height (place under a table). `y` with `snap: false` places at a fixed height.
- `collide: true` rejects the object if any primitive intersects an existing one deeper than 1 mm
  (`ignoreObjects` exempts a host, for rest-on props).
- `category` counts against the budgets (`props` 7000, `plants` 600, `trees` 12, x0.75 compact, x1.25 large);
  every object counts against the total primitive budget. Placement beyond a budget returns -1.
- Positions, sizes and rotations are quantised (DET-5); primitive ids are unique and sequential.
- `ground: true` marks the primitives as walkable ground for the nav grid (floor slabs).
- Tag props `prop`: v-rest checks that they rest on something. `removeObject` drops one (and its routes, POIs).
- **Tables**: `placeTables(ctx, step, tables)` takes `PlacementTable`s (zones, density per m^2, spacing, template
  factory, options), thins all tables of a category together when the expected count exceeds the budget,
  Poisson-samples (`poissonDisk`) each table's zones and places with per-object RNG streams.

## 4. Other records

`addClimbRoute` (world points bottom first, resampled to <= 8 BU), `addPoi`, `addPreCarve` (carve op applied with
`force` at New Game; refuses beyond 800 chunks), `addCavity`, `addMicro` (mouths `posA/posB`, `minClearanceBu`,
`lengthBu`; usefulness is evaluated in validation: `evaluateMicro`), `addWaterBody`, `addCanopy` (tree canopy disc:
shades and shelters), `addFoodAnchor`, `addPlant`, `addTerritory`, `addRivalSite`, `addHumanNode`.

Terrain edits (steps 3-5, before the derived maps): `paintGround(ctx, rect, { surface, crustMm, subsoil })` (e.g.
sand bedding under a slab grid: the zone stand-in is a 50 mm concrete crust), `editHeights(ctx, rect, f)`,
`cutTerrainHole(ctx, rect)` (must be enclosed by primitives below the surface: v-enclose).

## 5. Determinism rules (GDD 04 §4.4)

No `Math.random`, `Date`, `performance.now`; no `Math.sin/cos/exp/log/pow/atan2/hypot` for stored or deciding
values (use `dsin`, `dcos`, `dlog`, `drad` from the kit); no dependence on `Map`/`Set` iteration order; stable
sorts with explicit tie-breaks. Hot loops: re-bind imported functions as local consts (Vite/Vitest getters).
