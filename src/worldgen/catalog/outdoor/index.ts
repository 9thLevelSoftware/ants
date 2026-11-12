// Outdoor object catalogue (GDD 04 §5.1-5.6): every template id of the forest, lawn, garden-bed, pavement,
// asphalt and playground tables, as builders (rng, env) -> Built. The placers in place/outdoor use them; other
// modules may reuse species-independent ones through the registry (`worldgen.templates`).

import type { RngState } from '@/core/rng';
import type { WorldgenModule } from '../../kit/registry';
import type { Built, Env } from './types';
import { curledLeaf, fallenBranch, flatStone, fungusCap, herbPlant, log, mossCushion, nut, pebble, standingTree, stump, twig } from './forest';
import { cloverPatch, daisy, dandelion, gardenHose, lawnStone, lostBall, seedGrass, sprinklerHead, steppingStone } from './lawn';
import { beanRow, birdTable, compostBin, fruitTree, mulchChip, perennial, plantPot, shed, shrub, waterButt } from './beds';
import { backStep, blockPaver, cigaretteButt, doormatOutside, linearDrain, patioChair, patioTable, planter } from './pavement';
import { bollard, bottleCap, drinkCan, gullyGrate, lampPost, manholeCover, parkedCar, treePitTree, wheelStop } from './asphalt';
import { bench, litterBin, picnicTable, slide, springRider, swingFrame, toyBucket, toySpade } from './playground';

export type { Built, Env, LocalCavity, LocalMicro, LocalWater, LocalCarve } from './types';

/** Builders of the self-contained templates (sized objects such as boards, kerbs, fences and slabs take arguments). */
export const OUTDOOR_CATALOG: Record<string, (rng: RngState, env: Env) => Built> = {
  'standing-tree': (r, e) => standingTree(r, e), 'park-tree': (r, e) => standingTree(r, e, { id: 'park-tree' }),
  log, stump, 'fallen-branch': fallenBranch, twig, 'flat-stone': (r, e) => flatStone(r, e), pebble, 'moss-cushion': mossCushion,
  'curled-leaf': curledLeaf, 'fungus-cap': fungusCap, nut, 'herb-plant': herbPlant,
  dandelion, 'clover-patch': cloverPatch, daisy, 'seed-grass': seedGrass, 'stepping-stone': steppingStone, 'lost-ball': lostBall,
  'garden-hose': gardenHose, 'sprinkler-head': () => sprinklerHead(), stone: lawnStone,
  'mulch-chip': mulchChip, 'perennial-plant': perennial, shrub, 'bean-row': beanRow, 'plant-pot': (r, e) => plantPot(r, e),
  shed, 'compost-bin': compostBin, 'water-butt': (_r, e) => waterButt(e), 'bird-table': birdTable, 'fruit-tree': fruitTree,
  'block-paver': () => blockPaver(), 'back-step': backStep, 'patio-table': patioTable, 'patio-chair': patioChair, planter,
  'doormat-outside': doormatOutside, 'linear-drain': linearDrain, 'cigarette-butt': cigaretteButt,
  'wheel-stop': wheelStop, bollard, 'lamp-post': (_r, e) => lampPost(e), 'gully-grate': gullyGrate, 'manhole-cover': () => manholeCover(),
  'parked-car': parkedCar, 'drink-can': drinkCan, 'bottle-cap': () => bottleCap(), 'tree-pit': treePitTree,
  'toy-bucket': toyBucket, 'toy-spade': toySpade, slide, 'swing-frame': swingFrame, 'spring-rider': springRider, bench,
  'litter-bin': litterBin, 'picnic-table': picnicTable,
};

/** Nominal environment for registry templates (Lasius BU; routes and sockets are not part of a template). */
const NOMINAL: Env = { bu: 4, foot: 0.6, woodNester: false };

export const worldgen: WorldgenModule = {
  templates: {
    'flat-stone': (rng) => flatStone(rng, NOMINAL).tpl,
    pebble: (rng) => pebble(rng).tpl,
    log: (rng) => log(rng, NOMINAL).tpl,
    'stepping-stone': (rng) => steppingStone(rng, NOMINAL).tpl,
  },
};

export * from './forest';
export * from './lawn';
export * from './beds';
export * from './pavement';
export * from './asphalt';
export * from './playground';
export { growPlant, PLANT_MAX_PRIMS, type PlantTemplate } from './plant';
