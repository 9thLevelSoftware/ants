# species-leafcutter implementation — progress (engineer 1)

Started 06:57 UTC Nov 17. No earlier progress file; tree clean at 331d105.

## Done
- read docs (seed, arch, contracts, tech-stack, STATUS R1-R19, GDD 07 5.4/6.4/App A-E, GDD 06 5.x, reviews of carpenter/harvester)
- baseline: test-output/leaf/base.log (life.ts atta suburban-garden 1: founding failed after 10 gd, forced-seal retry)
- probe tools/sim/probe-leaf-plants.ts (DELETE at end): plants within 300 BU of start: 2-15 objects, nearest 28-180 BU

## Design decisions (so far)
- Own `cut` behaviour (not the shared outdoor engine): walk to a leaf site, cut-leaf (timed), carry leaf-fragment home
  to a fungus chamber cache. Leaf sites persisted in col.fungus.leafSites (plant objects + lawn/bed herbage patches).
- Staphylae harvested by gardeners -> col.fungus.staphylae (FL) -> tops up pool (P 0.75 / C 0.25). Larvae/queen eat pool
  (fungus); Atta has no prey diet so pool P = fungus only. feed-larva check wrapped for Atta (crop food + living garden
  instead of a carried staphylae item).
- Founding hold: Atta queen in phase dig -> my system defers digTick readiness (FB.readinessTick) until pellet planted
  and garden established (G >= 1.5 x plantedGu at foundingGrowth 0.28/GD). Contradiction GDD06 "0.6-0.8 GD" noted.
- Deviation: first-brood minims may cut small fragments while the colony has no media (else no substrate at all).

## Remaining (order)
1. balance + params + state + dynamics (pure) + tests E21-23
2. founding atta.ts (pellet, plant, hold, fert, trophic eggs, garden-lost) + test
3. economy system (climate inputs, yield, staphylae->pool, Escovopsis hazard/spread, states/events, garden-less)
4. behaviours: cut, garden (tend/harvest/process/plant/weed/waste), castes destiny, allocation demand
5. chain counters + diag-at-chain, diag-garden, substrate, phorid; rejection; phorids/hitchhikers
6. render, e2e, viability, soak, report
