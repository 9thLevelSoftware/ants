// Placement rules of the outdoor catalogue (GDD 04 §5.1-5.6 "Placement" and "Density" columns, §6.2, §7, §9).
// Densities per m^2 of the host zone; spacings mm; probabilities 0..1. Object dimensions live with the templates
// (catalog/outdoor/*.ts).

export const OUTDOOR = {
  /** Share of PRECARVE_CHUNK_MAX the outdoor catalogue may use (the rest: interior, rival nests). */
  precarveShare: 0.6,
  /** Carve capsules are recorded in pieces of at most this length, BU (one carve chunk: the budget counts boxes). */
  carvePieceBu: 8,
  /** Props keep this far from climb-route nodes (and routes from props), BU; node grid cell, mm (routeClear.ts). */
  routeClearBu: 2,
  routeClearCellMm: 64,
  /**
   * Route snapping (routeSnap.ts): resample step (BU), merge distance (BU), neighbours within nearMm of a routed
   * object and up to hugeMm in size are in the snapping field, its hash cell (BU; the game's field uses 8), and the
   * projection displacement beyond which an end node counts as snapped onto the wrong surface (BU).
   */
  snap: { stepBu: 2, mergeBu: 0.5, nearMm: 100, hugeMm: 3000, hashCellBu: 32, jumpBu: 3 },
  /** Cavities of one kind per map (chunk thrift; GDD rules would allow more), see the report. */
  maxUnderSlab: 6,
  maxCracks: 6,
  maxMatSeams: 4,
  maxExpansionSlots: 3,
  /** atGround 'support': highest primitive top above the terrain that counts as a support (slabs + lips, mats). */
  supportLiftMax: 90,
  /**
   * atGround 'support' (restOnSupport.ts): footprint lattice (N x N), half width of the joint-skipping neighbourhood
   * (the widest joint is 10 mm), steepest support plane (about 10 deg), foot height tolerance.
   */
  support: { lattice: 5, jointMm: 12, maxSlope: 0.18, footTolMm: 1 },

  trees: { clearBu: 3, clearFromY: 300, spacing: 2500, edgeMin: 600, perM2: 1 / 30, min: 1, maxPerZone: 6, slopeMax: 0.36, parkCount: [1, 3] as [number, number], fruitCount: [0, 2] as [number, number] },
  logs: { perM2: 1 / 25, min: 1, spacing: 1500, contourDeg: 30 },
  stumps: { perM2: 1 / 40, treeDist: 2000, spacing: 1500 },
  forestProps: { branch: 0.15, twig: 4, stone: 1.2, pebble: 3, moss: 0.6, leaf: 2, herb: 1, herbShadeMax: 0.7,
    /** Flat stones: share placed in canopy gaps, the gaps' shade limit; moss: band round a tree's foot over its root
     * flares (centre distance) and the margin round a log, stump or stone it grows on and against. */
    stoneGapShare: 0.5, stoneGapShade: 0.6, mossTreeBandMm: 1600, mossHostMarginMm: 120 },
  lawn: { dandelionMown: 0.4, dandelionRough: 0.8, clover: 0.3, daisy: 0.5, stone: 0.1, ballP: 0.3, hoseP: 0.6, hoseNear: 2000,
    sprinklerP: 0.5, sprinklerJitter: 0.2, steppingP: 0.6, edgeP: 0.4, edgeSeg: 450 },
  beds: { mulch: 12, perennial: 2, shrub: 0.3, beanRowSpacing: 300, beanRowsMax: 3, shedArchetypes: { 'suburban-garden': 1, 'kitchen-door': 0.5 } as Record<string, number>,
    compostP: { 'suburban-garden': 0.7, 'kitchen-door': 0.4 } as Record<string, number>, buttP: 0.6, birdTableP: 0.4,
    /** Low dry-stone wall along a lawn/bed boundary (when it has no lawn edging): probability, height (mm), shortest run (mm). */
    bedWallP: 0.35, bedWallH: [200, 350] as [number, number], bedWallMinRun: 800, pots: [0, 6] as [number, number], planters: [0, 3] as [number, number] },
  pavement: { butt: 0.1, tableP: 0.6, chairs: [2, 4] as [number, number], drainP: 0.5, crackShare: 0.06, underSlabShare: 0.08,
    lipShare: 0.03, lipMm: 6, stepMm: 2, expansionEvery: [3000, 6000] as [number, number], expansionGap: [10, 20] as [number, number], expansionCrackP: 0.5,
    sidewalkSlab: [600, 50, 600] as [number, number, number], underSlabLens: [0.5, 1.5] as [number, number], underSlabFoot: [0.2, 0.6] as [number, number], lensMaxRBu: 10,
    edgingP: 0.5, bedding: 40,
    /** Back step: clearance to the door sill nose; linear drain: offset along the wall beyond the door, off the wall. */
    stepClearMm: 1, drainFromDoorMm: 700, drainOffWallMm: 70,
    /** Doormat: clearance to the step, search lattice step and tries (3 across x n out). */
    doormatClearMm: 30, doormatStepMm: 40, doormatTries: 12,
    /** Patio chairs: clearance between the seat's front edge and the table top's edge; candidate seats per table. */
    chairClearMm: 40, chairCandidates: 12,
    /** Planters at the patio corners: inset of the centre from the corner, nudge per retry, tries. */
    planterInset: 550, planterNudge: 25, planterTries: 6 },
  asphalt: { gullyPerM2: 1 / 50, crackPerM2: 1 / 8, crackLen: [300, 2000] as [number, number], crackReal: [1, 25] as [number, number], crackStructural: 5,
    crackDepthBu: 4, wheelStopP: 0.5, carShare: [0.3, 0.7] as [number, number], bollards: [0, 6] as [number, number], bollardSpacing: 1500,
    manholeP: 0.4, can: 0.03, cap: 0.05, treePits: [0, 2] as [number, number], treePitSpacing: 3000, basins: [2, 6] as [number, number],
    basinDia: [200, 1500] as [number, number], basinDepth: [3, 10] as [number, number], lineW: 100,
    /** Gullies: gutter sampling step and jitter, mm. Street furniture: bollard run start along the kerb and offset
     * behind it, lamp position (share of the line) and offset behind the kerb, mm. */
    gullySampleMm: 250, gullyJitterMm: 100, bollardStart: [800, 3000] as [number, number], bollardBehindMm: 300,
    lampAlong: [0.3, 0.7] as [number, number], lampBehindMm: 450 },
  playground: { benches: [1, 3] as [number, number], binsPerBench: [1, 2] as [number, number], benchOffset: 350, benchHalfDepth: 250, binOffset: 1350,
    /** Equipment footprints (half extents, footprint centre offset along local Z), fall-zone gap between pieces, tries. */
    footprints: { slide: { hx: 400, hz: 1600, cz: 1000 }, swing: { hx: 1350, hz: 700, cz: 0 }, rider: { hx: 400, hz: 400, cz: 0 } },
    equipmentClearMm: 1500, equipmentTries: 48,
    picnicP: 0.5, swingP: 0.7, riderP: 0.5,
    matSeamP: 0.3, matSeamDepthBu: [6, 12] as [number, number] },
  /** Map edges: fence inset (16 BU nav cells inside the margin), fence-gap guarantee, dry-stone wall sections (mm,
   * joint between sections) and the share of sections with a crevice into an inner void (>= 1 per wall). */
  edges: { fenceInsetCells: 3, gapGuarantee: true, wallSection: 2000, wallJoint: 20, wallVoidP: 0.3 },
  /** Stepping-stone line: from the patio / door into the lawn. */
  stepping: { count: [3, 8] as [number, number], spacing: [600, 700] as [number, number] },
};
