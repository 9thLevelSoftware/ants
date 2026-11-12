// The placement kit: the API content modules (catalog/**, place/**, populate/**) use to put things into the
// world under construction. Read kit/README.md first. Everything here is deterministic given the context.

export type { GenContext, ContentKind, CanopyDisc, DerivedCache } from './context';
export type { PlacerDef, RepairDef, TemplateFactory, WorldgenModule, Registry } from './registry';
export { buildRegistry, discoveredModules, placersFor } from './registry';
export type { ObjectTemplate, PrimSpec, PlaceOptions } from './template';
export { placeObject, removeObject, intersectsWorld } from './template';
export type { PlacementTable } from './tables';
export { placeTables, thinning, tableAreaM2 } from './tables';
export { poissonDisk } from './poisson';
export {
  addCanopy, addCavity, addClimbRoute, addFoodAnchor, addHumanNode, addMicro, addPlant, addPoi, addPreCarve,
  addRivalSite, addTerritory, addWaterBody, provide,
} from './records';
export { cutTerrainHole, editHeights, inZones, paintGround, zoneAt, zoneTypeAt, type GroundPaint } from './terrainEdit';
export { primIndex, supportAt, terrainAt, invalidatePrimIndex } from './surface';
export { primColumn, type ColumnHit } from './column';
export { dcos, dsin, dlog, dlog10, drad } from './dmath';
export { qangle, qmm, qvec } from './quantize';
export { MinHeap } from './heap';
// derived-map helpers usable from the resources / rivals / start steps
export { computeSuitability, suitabilityAt, mapState } from '../maps';
export { specialFactor } from '../maps/special';
export { navDistances, navDistanceTo, cellAt, snapWalkable, portals } from '../validate/graph';
export { evaluateMicro, usefulInteriorAccess } from '../validate/micro';
export type { Layout, LayoutZone, BuiltShape, HouseLayout, CarParkLayout, KerbLine, HumanNode, RaisedBed, Rect, Point2, Side } from '../layout/types';
