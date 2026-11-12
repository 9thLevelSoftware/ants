# The nest

## Digging

Ants dig the nest by taking a bite of soil at a time. Hold `F`<!--key:dig--> on diggable ground to dig. The soil becomes pellets, which a worker carries out and drops beside the entrance, where they build a mound. The possessed ant digs exactly as the colony's diggers do, and the colony can also dig by itself from dig plans and from the nest architect.

How fast a bite goes depends on the material and on its moisture. The table is relative to loam at middling damp, which has speed 1.

| Material | Dig speed | Roof it can hold | Notes |
| --- | --- | --- | --- |
| Loam | 1 | about 16 body lengths | The reference soil. |
| Humus | 1.3 | about 10 | Soft, holds only short roofs. |
| Sand | 1.6 | about 8, only 2.5 when dry | Fast to dig, slumps when dry or saturated. |
| Clay | 0.45 | about 24 | Slow, holds water. |
| Gravel | 0.35 | about 12 | Drains freely. |
| Decayed wood | 1 | never falls | Carpenter ants; the black garden ant digs it at half speed. |
| Sound wood | 0.4 | never falls | Carpenter ants only. Half speed again when dry. |
| Insulation | 1.5 | about 12 | Carpenter ants, and the black garden ant at half speed. |
| Concrete, asphalt, stone, brick, tile, glass, metal, plastic, rubber, plaster, mortar and similar | not diggable | never falls | Ants use the joints and cracks, not the material. |

Moisture matters: loam digs at 60 percent of the usual speed when dry and 80 percent when saturated, and sand hardly changes. A wet clay surface is slippery. A crust of hard soil at the surface digs at a fraction of the speed of what lies under it.

The codex has a note for every material.

## Chambers

A chamber is a registered room of the nest. Each has a type, a size, a temperature and a humidity, and the nest overview lists them.

| Type | Used for |
| --- | --- |
| Nursery | Brood. The colony keeps it in the warmest chamber. |
| Food | Stores of C and P. |
| Rest | Resting workers and the queen's retinue. |
| General | Everything else, and the default. |
| Midden | Waste, corpses and refuse. |
| Granary | Seed stores (harvester ants). |
| Fungus | The fungus garden (leafcutters). |

A chamber that holds more than it was made for is crowded, and the colony alerts you. A second chamber lets brood be kept apart from stores.

## The dig planner

In colony view, the Dig marker opens the planner.

1. Choose a template: Chamber (with a type), Tunnel, Shaft to the surface, or Entrance.
2. Hover a wall of the nest in cutaway. A ghost of the template appears anchored on the wall.
3. Rotate the ghost with `Q` and `E` in steps of 15 degrees, and change its size with Shift and the wheel (Small, Medium or Large; for the black garden ant, 8, 12 or 16 body lengths on the long axis). For a tunnel, click the start and the end.
4. Click to place it.

A valid ghost is drawn with a dashed outline and an invalid one is cross-hatched, with the reason beside it. Reasons include "Concrete or stone cannot be dug", "Too wide a ceiling for this soil", "Leaves too thin a wall", "Would break into a neighbouring nest" and "Too deep or too far from the nest". Plans are shown in the dig-plans overlay with their status: proposed (by the architect), queued, active, stalled (with the reason), complete, paused or cancelled. Select a plan and press `Delete`<!--key:cv-delete--> to cancel it.

The nest architect proposes and digs rooms and tunnels itself when it is on: Auto digs without asking, Suggest proposes plans that you accept, and Off leaves digging to you.

## Entrances and sealing

An entrance is a shaft to the surface with a mound of the dug soil beside it. A founding queen seals her entrance with a plug of soil, and the first workers open it. A second entrance makes the nest harder to block. An entrance can close without a plug when soil piles over the opening or loose soil slumps into the passage, and the colony alerts you when that happens. Workers dig the way out again.

<!-- verify-at-release -->
## Water, heat and collapse

- **Temperature.** Soil lags behind the air: a chamber deep in the ground barely feels the day. Brood is kept in the warmest chamber the nest has, and a stone over a nest warms the soil beneath it in the sun.
- **Humidity.** Brood needs high humidity. A dry brood chamber slows its development. In wood nests the wood's moisture matters: carpenter ant eggs and young larvae need damp wood.
- **Flooding.** Rain can flood a nest, lower chambers first. An alert says so, and workers carry brood uphill. A nest in free-draining gravel floods less than one in clay.
- **Collapse.** A ceiling that is too wide for its soil can fall, and the game warns of this as "Ceiling may collapse". Dry sand with a wide room is the usual case. Rock, concrete and wood roofs never fall.

<!-- verify-at-release -->
## The nest overview

`U`<!--key:nest-overview--> opens a drawer with a side view of the nest: chambers as rounded rectangles at their depth and distance, tunnels as lines, entrances as notches on the ground line and mounds as humps. Under it a table lists each chamber with its type, volume, occupancy, temperature, humidity and risk (flooded, flood risk, dry, crowded). Click a chamber to open colony view at its depth. You can change a chamber's type there.
