// Catalogue data of the building and its kitchen slice (GDD 04 §5.7, micro-connection rules §6.2): true sizes in
// mm, ranges as [min, max], probabilities 0..1. Heights marked "floor-relative" are above the interior floor top
// (LEVELS.floorTop = +150); everything else is world height above the garden datum y = 0.

/** Cavity wall of the house (`house-wall`): outer leaf, clear cavity, inner leaf, top closure. */
export const HOUSE_WALL = {
  outerLeaf: 102.5,
  cavity: [50, 75] as [number, number],
  innerLeaf: 100,
  /** Wall top (and roof line), world mm (GDD 04 §14: interior ceiling at 2400). */
  top: 2400,
  /** Cap closing the cavity at the top, mm thick. */
  capThick: 30,
  /** The cavity is filled with concrete below the bottom vent course (cavity tray), world mm. */
  fillTop: 150,
  /** Cavity closers around door, window and pipe openings: band width, mm. */
  closer: 50,
  /** End closers of the façade cavity at the map corners, mm thick. */
  endCloser: 50,
};

/** `weep-vent`: open perpend in the outer leaf with a plastic grille (GDD 04 §5.7, §6.2). */
export const WEEP_VENT = {
  /** Open perpend joint (along the wall) and course height, mm. */
  slotWidth: 10,
  height: 65,
  /** Bottom of the vent course, world mm ("bottom course +150"). */
  courseY: 150,
  /** Grille slot width range, mm; one plastic bar splits the perpend into two slots. */
  slot: [3, 5] as [number, number],
  grilleDepth: 10,
  spacing: 900,
  /** Vents keep this far from the kitchen slice (a mouth closer than the nav snap radius could join the kitchen floor). */
  sliceMargin: 600,
  /** ... and from the map corners. */
  cornerMargin: 450,
};

/** `air-brick`: 215 x 65 terracotta block with 8-12 openings of 5-10 mm, in the vent course. */
export const AIR_BRICK = {
  width: 215,
  height: 65,
  openings: [8, 12] as [number, number],
  openingWidth: [5, 10] as [number, number],
  count: [1, 2] as [number, number],
};

/** `back-door` (GDD 04 §5.7): leaf, jambs, sill; the under-door gap is the `door-crack`. */
export const BACK_DOOR = {
  leafWidth: 900,
  leafHeight: 2000,
  leafThick: 45,
  /** Outer face of the leaf, measured into the wall from the garden face, mm. */
  leafInset: 40,
  jambWidth: 70,
  jambHeight: 2100,
  /** Lowest part of each jamb that may be decayed (Camponotus satellite site). */
  decayedFoot: 150,
  decayedFootP: 0.4,
  sillWidth: 1000,
  /** Sill nose beyond the garden face, mm. */
  sillNose: 30,
  /** Threshold sill material: stone with this probability, else metal. */
  sillStoneP: 0.7,
  /** Real gap under the leaf, mm (door-crack 3-10). */
  gap: [3, 10] as [number, number],
  /** Weather strip variant: the gap is closed and a pipe penetration is forced. */
  weatherStripP: 0.25,
};

/** `window` over the sink (p 0.7): opening, frame, 3 mm pane, outside sill, inner board. */
export const GLAZING = {
  p: 0.7,
  /** Structural opening width, mm (outside sill 1200 wide). */
  openingWidth: 1100,
  sillWidth: 1200,
  sillThick: 50,
  sillDepth: 150,
  /** Outside sill nose beyond the garden face, mm. */
  sillNose: 50,
  /** Opening bottom above the counter top (the GDD's "sill at 900" sits below a 910 counter; see report), mm. */
  aboveCounter: 40,
  /** Opening head, floor-relative mm (level with the door head). */
  head: 2100,
  frame: 50,
  frameDepth: 70,
  /** Frame outer face measured into the wall from the garden face, mm. */
  frameInset: 40,
  pane: 3,
  innerBoardThick: 25,
  innerBoardNose: 25,
  decayedSillP: 0.3,
  /** Keep the opening this far from the door opening and the room ends, mm. */
  doorClear: 200,
  endClear: 150,
};

/** `downpipe` at the end of the kitchen façade. */
export const DOWNPIPE = { diam: 68, shoe: 150, standOff: 30, fromSlice: 300 };

export const FLOOR = {
  /** Finish layer on the concrete slab, mm. */
  finish: 10,
  /** Vinyl (plastic) instead of tile. */
  vinylP: 0.3,
};

export const INTERIOR_WALL = { thick: 100 };
export const CEILING = { thick: 30 };

/** `skirting` on every free wall run: board standing off the wall over a hidden void. */
export const SKIRTING = {
  thick: 15,
  height: 120,
  floorGap: [0, 5] as [number, number],
  void: [2, 15] as [number, number],
  passableP: 0.3,
  /** Bead closing the void at the top, mm tall. */
  capHeight: 5,
  /** Shortest run worth a board, mm. */
  minRun: 150,
};

/** `base-cabinet-run`: 600 units, carcass on legs in a 150 plinth zone, kickboard set back, doors with 3 mm gaps. */
export const BASE_UNIT = {
  width: 600,
  carcassDepth: 560,
  /** Plinth zone (kick space) height, floor-relative mm. */
  plinth: 150,
  doorThick: 18,
  doorGap: 3,
  kickThick: 16,
  kickSetback: 60,
  kickGap: [2, 6] as [number, number],
  /** Kickboard sections, mm; at least one per run is passable. */
  kickSection: 300,
  legDiam: 35,
  legInset: 50,
  /** Run length (units, cooker and under-counter appliances), mm. */
  run: [1800, 3600] as [number, number],
  lRunP: 0.6,
  /** L-run units (0 = only the fridge stands on the side wall). */
  lUnits: [1, 3] as [number, number],
  /** Free floor kept in front of an L-run's far end, mm. */
  lFrontClear: 700,
  /** Gap between the run's last unit and the door jamb, mm. */
  doorClear: 150,
  /** Cabinet-to-counter climb routes: about one per this run length, mm, at a door edge this far from the gap. */
  routeSpacing: 1200,
  routeEdge: 12,
  /** Counter items keep this far (along the run) from the top of a climb route, mm. */
  routeTopClear: 60,
  /** Main-run climb routes start this far beyond the L counter front (no overhang in the corner), mm. */
  lCornerRouteClear: 60,
  /** With an L-run, cookers and washers stand at least this far past the L counter's far edge, mm. */
  cornerApplianceClear: 2,
};

/** `countertop` (floor-relative heights). */
export const COUNTER = {
  depth: [600, 620] as [number, number],
  thick: 38,
  top: 910,
  overhang: 20,
  wallGap: [1, 5] as [number, number],
  /** Laminate (plastic) top with this probability, else stone (GDD laminate p 0.6). */
  laminateP: 0.6,
};

/** `sink`: basin under the window, 5 RB (bottom + 4 walls), drain, optional water film. */
export const SINK = {
  width: 400,
  depth: 180,
  frontBack: 350,
  wall: 6,
  drain: 40,
  /** Tap drips: a permanent film in the basin. */
  dripP: 0.4,
  filmMm: 2,
  /** Service void behind the sink unit's carcass (plumbing), mm. */
  serviceVoid: 60,
};

export const FRIDGE = {
  width: 600, height: 1800, depth: 650,
  feetGap: [10, 20] as [number, number],
  wallGap: [30, 50] as [number, number],
  sideGap: 10,
  footDiam: 30,
};

export const COOKER = {
  width: 596, height: 900, depth: 600,
  feetGap: [10, 15] as [number, number],
  wallGap: 15,
  hobThick: 6,
  footDiam: 30,
};

export const WASHER = {
  p: 0.6,
  width: 596, height: 850, depth: 600,
  feetGap: [10, 15] as [number, number],
  wallGap: 20,
  footDiam: 30,
};

/** `service-pipe` and its `pipe-penetration` annulus through the exterior wall. */
export const SERVICE_PIPE = {
  diam: [15, 40] as [number, number],
  annulus: [2, 15] as [number, number],
  /** Pipe axis, floor-relative mm (inside the kick space). */
  axis: 70,
  /** Pipe stub outside the garden face and inside the room, mm. */
  outStub: 40,
  inStub: 10,
  /** Penetration under the sink (p 0.8; 1.0 when the door is sealed). */
  sinkP: 0.8,
  /** Second penetration behind the washing machine. */
  washerP: 0.5,
  /** Behind-washer pipe: distance from the washer side next to the sink, mm. */
  washerEdge: 100,
  /** Under-sink pipe: offset from the sink centre along the run, up to +- mm. */
  sinkJitter: 120,
};

export const TABLE = {
  top: [1200, 25, 800] as [number, number, number],
  height: 750,
  leg: 50,
  /** Leg outer faces inset from the top edges, mm. */
  legInset: 40,
  /** Clear distance to counters and appliances, mm. */
  counterMin: 700,
  wallMin: 600,
  doorMin: 1000,
  yawJitterDeg: 6,
  /** Random positions tried for the table before giving up. */
  placeTries: 60,
};

export const CHAIR = {
  /** Wooden with this probability, else metal. */
  woodP: 0.7,
  seat: [420, 20, 420] as [number, number, number],
  seatTop: 450,
  legDiam: 25,
  legInset: 25,
  backTop: 900,
  backRail: [380, 60, 20] as [number, number, number],
  count: [2, 4] as [number, number],
  /** Seat front edge beyond the table edge, mm. */
  pullOut: 80,
};

export const PEDAL_BIN = {
  diam: 300,
  height: 500,
  lidHeight: 30,
  seam: [1, 2] as [number, number],
  pedal: [120, 15, 40] as [number, number, number],
  /** The climb route starts on the floor this far beside the body, mm. */
  routeBase: 40,
  /** Lid hinge bridging the seam on the climb side: width, depth into the body, overlap above/below the seam, mm. */
  hinge: [30, 6, 10] as [number, number, number],
  /** Plastic with this probability, else metal. */
  plasticP: 0.5,
};

export const PET_BOWL = {
  diam: [150, 200] as [number, number],
  height: [50, 70] as [number, number],
  wall: 8,
  /** GDD 20 deg; 15 keeps the bowl-foot wedge within the walker's 110 deg concave-transition limit (report). */
  flareDeg: 15,
  staves: 12,
  /** Glazed ceramic with this probability, else metal. */
  ceramicP: 0.7,
  mat: [400, 3, 300] as [number, number, number],
  pKitchenDoor: 0.8,
  pOther: 0.5,
  /** Against a wall within this distance of the door centre, mm. */
  doorMax: 1500,
  /** Water level as a share of the inner depth (VESSEL_FILL_MAX 0.8). */
  fill: 0.6,
};

export const DOORMAT_INSIDE = { size: [600, 15, 400] as [number, number, number], doorGap: 20 };

export const HOUSEPLANT = {
  p: 0.5,
  potDiam: [150, 250] as [number, number],
  /** Pot height as a share of its diameter, and the pot wall flare, degrees. */
  heightK: 0.85,
  flareDeg: 8,
  /** On the window board: offset from the window centre along the wall, up to +- mm; yaw jitter, rad. */
  boardJitter: 250,
  boardYawJitter: 0.2,
  /** On the floor: distance of the pot centre from the back-wall corner's two walls, mm; yaw jitter, rad. */
  cornerOff: 200,
  floorYawJitter: 0.4,
  potWall: 10,
  staves: 12,
  scaleP: 0.3,
  stems: [2, 4] as [number, number],
  stemDiam: [3, 6] as [number, number],
  stemLen: [150, 350] as [number, number],
  leaf: [60, 120] as [number, number],
};

export const FRUIT_BOWL = { p: 0.7, diam: 250, height: 80, wall: 6, staves: 14, flareDeg: 25, fruit: [3, 6] as [number, number], fruitDiam: [60, 80] as [number, number] };
export const BREAD_BOARD = { p: 0.6, size: [400, 20, 250] as [number, number, number] };
export const SUGAR_BOWL = { p: 0.5, diam: 100, height: 80, wall: 5, staves: 10, lid: [104, 12] as [number, number] };

/** Placement of the free-standing furniture and the counter items. */
export const FURNISH = {
  /** Spacing of candidate spots along the wall faces, mm. */
  wallSpotSpacing: 150,
  /** Counter items: positions tried per item, offset across the counter from its middle (mm), yaw jitter (rad). */
  counterTries: 12,
  counterNOffset: [-40, 60] as [number, number],
  counterYawJitter: 0.3,
  /** Dense overlap test of placed furniture: allowed penetration (mm) and lattice divisions per axis. */
  overlapTolMm: 0.5,
  overlapLattice: 8,
};
