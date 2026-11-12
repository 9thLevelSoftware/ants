// Placement rules of the outdoor catalogue (GDD 04 §5.1-5.6 "Placement" and "Density" columns, §6.2, §7, §9).
// Densities per m^2 of the host zone; spacings mm; probabilities 0..1. Object dimensions live with the templates
// (catalog/outdoor/*.ts).

export const OUTDOOR = {
  /** Share of PRECARVE_CHUNK_MAX the outdoor catalogue may use (the rest: interior, rival nests). */
  precarveShare: 0.55,
  /** Cavities of one kind per map (chunk thrift; GDD rules would allow more), see the report. */
  maxUnderSlab: 6,
  maxUnderStone: 40,
  maxCracks: 6,
  maxMatSeams: 4,
  maxExpansionSlots: 3,

  trees: { spacing: 2500, edgeMin: 600, perM2: 1 / 30, min: 1, maxPerZone: 6, slopeMax: 0.36, parkCount: [1, 3] as [number, number], fruitCount: [0, 2] as [number, number] },
  logs: { perM2: 1 / 25, min: 1, spacing: 1500, contourDeg: 30 },
  stumps: { perM2: 1 / 40, treeDist: 2000, spacing: 1500 },
  forestProps: { branch: 0.15, twig: 4, stone: 1.2, pebble: 3, moss: 0.6, leaf: 2, herb: 1, herbShadeMax: 0.7 },
  lawn: { dandelionMown: 0.4, dandelionRough: 0.8, clover: 0.3, daisy: 0.5, stone: 0.1, ballP: 0.3, hoseP: 0.6, hoseNear: 2000,
    sprinklerP: 0.5, sprinklerJitter: 0.2, steppingP: 0.6, edgeP: 0.4, edgeSeg: 450 },
  beds: { mulch: 12, perennial: 2, shrub: 0.3, beanRowSpacing: 300, beanRowsMax: 3, shedArchetypes: { 'suburban-garden': 1, 'kitchen-door': 0.5 } as Record<string, number>,
    compostP: { 'suburban-garden': 0.7, 'kitchen-door': 0.4 } as Record<string, number>, buttP: 0.6, birdTableP: 0.4, pots: [0, 6] as [number, number], planters: [0, 3] as [number, number] },
  pavement: { butt: 0.1, tableP: 0.6, chairs: [2, 4] as [number, number], drainP: 0.5, crackShare: 0.06, underSlabShare: 0.08,
    lipShare: 0.03, lipMm: 6, stepMm: 2, expansionEvery: [3000, 6000] as [number, number], expansionGap: [10, 20] as [number, number], expansionCrackP: 0.5,
    sidewalkSlab: [600, 50, 600] as [number, number, number], underSlabLens: [0.5, 1.5] as [number, number], underSlabFoot: [0.2, 0.6] as [number, number], lensMaxRBu: 10,
    edgingP: 0.5, bedding: 40 },
  asphalt: { gullyPerM2: 1 / 50, crackPerM2: 1 / 8, crackLen: [300, 1000] as [number, number], crackReal: [1, 25] as [number, number], crackStructural: 5,
    crackDepthBu: 4, wheelStopP: 0.5, carShare: [0.3, 0.7] as [number, number], bollards: [0, 6] as [number, number], bollardSpacing: 1500,
    manholeP: 0.4, can: 0.03, cap: 0.05, treePits: [0, 2] as [number, number], treePitSpacing: 3000, basins: [2, 6] as [number, number],
    basinDia: [200, 1500] as [number, number], basinDepth: [3, 10] as [number, number], lineW: 100 },
  playground: { benches: [1, 3] as [number, number], binsPerBench: [1, 2] as [number, number], benchOffset: 350, picnicP: 0.5, swingP: 0.7, riderP: 0.5,
    matSeamP: 0.3, matSeamDepthBu: [6, 12] as [number, number] },
  edges: { fenceInsetCells: 3, gapGuarantee: true },
  /** Stepping-stone line: from the patio / door into the lawn. */
  stepping: { count: [3, 8] as [number, number], spacing: [600, 700] as [number, number] },
};
