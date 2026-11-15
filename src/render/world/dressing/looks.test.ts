// Render-only looks: every everyday object reads as what it is (no rust where none belongs), plant parts get their
// organic finishes, and the classification is deterministic and never depends on anything but the object.
import { describe, expect, it } from 'vitest';
import { MATERIAL_IDS, PrimFlag, type Primitive, type WorldObject } from '@/sim/types';
import { FINISH, LEAF_STYLE } from './finishes';
import { hash01, lookTable, primLook, type LookObject } from './looks';
import { lin, PALETTE } from './palette';

function prim(material: Primitive['material'], shape: Primitive['shape'] = 'box', size: [number, number, number] = [10, 10, 10], extra: Partial<Primitive> = {}): Primitive {
  return {
    id: 7, shape, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 }, size: { x: size[0], y: size[1], z: size[2] }, round: 0,
    material, flags: 0, objectId: 1, ...extra,
  };
}
const obj = (templateId: string, id = 1, tags: string[] = []): LookObject => ({ id, templateId, tags });

describe('man-made looks', () => {
  it('metal never wears the rust scan unless the template asks for it', () => {
    for (const t of ['parked-car', 'fridge', 'cooker', 'sink', 'chair', 'pedal-bin', 'pet-bowl-pair', 'litter-bin', 'bench', 'bollard', 'drink-can', 'bottle-cap', 'slide', 'unknown-thing']) {
      const l = primLook(prim('metal'), obj(t));
      expect(l.look[0], t).not.toBe(FINISH.rust);
      expect(l.look[0], t).not.toBe(FINISH.natural);
    }
    expect(primLook(prim('metal'), null).look[0]).not.toBe(FINISH.rust); // dynamic primitives too
    expect(primLook(prim('metal'), obj('gate', 1, ['rusty'])).look[0]).toBe(FINISH.rust);
  });

  it('a car is clear-coated paint from a palette, with a glazed cabin and tyres with hubs', () => {
    const body = primLook(prim('metal'), obj('parked-car', 3));
    expect(body.look[0]).toBe(FINISH.carBody);
    expect(PALETTE.carPaint).toContainEqual(body.color);
    expect(primLook(prim('metal', 'box', [900, 200, 1900], { flags: PrimFlag.VISUAL_ONLY }), obj('parked-car', 3)).look[0]).toBe(FINISH.cabin);
    expect(primLook(prim('rubber', 'cylinder'), obj('parked-car', 3)).look[0]).toBe(FINISH.tyre);
    // different cars get different paint somewhere in a car park
    const paints = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((id) => String(primLook(prim('metal'), obj('parked-car', id)).color)));
    expect(paints.size).toBeGreaterThan(2);
  });

  it('a kitchen reads as a kitchen: white enamel fridge, stainless sink and bin, chrome chair legs, black hob glass', () => {
    expect(primLook(prim('metal'), obj('fridge')).color).toEqual(PALETTE.enamel);
    expect(primLook(prim('metal'), obj('sink')).look[0]).toBe(FINISH.metal);
    expect(primLook(prim('metal'), obj('pedal-bin')).look[0]).toBe(FINISH.metal);
    expect(primLook(prim('metal', 'cylinder'), obj('chair')).look[0]).toBe(FINISH.metal);
    expect(primLook(prim('metal', 'box'), obj('chair')).look[0]).toBe(FINISH.colour); // painted seat
    expect(primLook(prim('metal', 'box', [300, 5, 300], { flags: PrimFlag.SLIPPERY }), obj('cooker')).look[0]).toBe(FINISH.glass);
    expect(primLook(prim('glass'), obj('window')).look[0]).toBe(FINISH.glass);
  });

  it('moulded plastics carry moulding ribs; white goods get a ventilated plinth; no finish is rust', () => {
    for (const t of ['water-butt', 'compost-bin', 'plant-pot', 'litter-bin', 'toy-bucket', 'pedal-bin']) {
      expect(primLook(prim('plastic', 'cylinder'), obj(t)).look[0], t).toBe(FINISH.moulded);
    }
    expect(primLook(prim('metal', 'box'), obj('fridge')).look[0]).toBe(FINISH.appliance);
    expect(primLook(prim('metal', 'box'), obj('cooker')).look[0]).toBe(FINISH.appliance);
    expect(primLook(prim('metal', 'cylinder'), obj('fridge')).look[0]).toBe(FINISH.colour); // handles, feet
  });

  it('toys are bright plastics, hoses green rubber, tyres black', () => {
    const toy = primLook(prim('plastic'), obj('toy-bucket', 5));
    expect(PALETTE.toyPlastic).toContainEqual(toy.color);
    expect(primLook(prim('rubber', 'capsule'), obj('garden-hose')).color).toEqual(PALETTE.hoseGreen);
  });

  it('natural materials stay natural (soil, wood, stone, bark)', () => {
    for (const m of ['loam', 'stone', 'bark', 'wood-sound', 'brick', 'concrete'] as const) {
      expect(primLook(prim(m), obj('fence')).look[0], m).toBe(FINISH.natural);
      expect(primLook(prim(m), obj('fence')).color, m).toBeNull();
    }
  });

  it('every material has a look and every look vector is finite', () => {
    for (const m of MATERIAL_IDS) for (const o of [null, obj('parked-car'), obj('dandelion'), obj('fridge')]) {
      const l = primLook(prim(m), o);
      expect(l.look.every(Number.isFinite), `${m} ${o?.templateId}`).toBe(true);
      if (l.color) expect(l.color.every((c) => c >= 0 && c <= 1)).toBe(true);
    }
  });
});

describe('plant looks', () => {
  it('flat plant parts are leaves with the template style; stems are stems; round parts are flower heads', () => {
    const leafPrim = prim('plant', 'box', [60, 0.4, 15]);
    expect(primLook(leafPrim, obj('dandelion')).look.slice(0, 2)).toEqual([FINISH.leaf, LEAF_STYLE.toothed]);
    expect(primLook(leafPrim, obj('daisy')).look.slice(0, 2)).toEqual([FINISH.leaf, LEAF_STYLE.spatulate]);
    expect(primLook(leafPrim, obj('clover-patch')).look.slice(0, 2)).toEqual([FINISH.leaf, LEAF_STYLE.obovate]);
    expect(primLook(prim('plant', 'capsule', [2, 20, 0]), obj('daisy')).look[0]).toBe(FINISH.stem);
    expect(primLook(prim('plant', 'ellipsoid', [10, 4, 10]), obj('daisy')).look[0]).toBe(FINISH.daisy);
    expect(primLook(prim('plant', 'ellipsoid', [10, 4, 10]), obj('clover-patch')).look[0]).toBe(FINISH.cloverHead);
    expect(primLook(prim('plant', 'ellipsoid', [10, 4, 10]), obj('herb-plant')).look[0]).toBe(FINISH.umbel);
  });

  it('dandelions are flowers or seed clocks, both occur, and the choice follows the object', () => {
    const head = prim('plant', 'ellipsoid', [18, 7, 18]);
    const kinds = new Set<number>();
    for (let id = 1; id < 60; id++) kinds.add(primLook(head, obj('dandelion', id)).look[0]);
    expect([...kinds].sort()).toEqual([FINISH.dandelion, FINISH.seedClock].sort());
    expect(primLook(head, obj('dandelion', 9))).toEqual(primLook(head, obj('dandelion', 9)));
  });

  it('logs and stumps show cut ends; dead leaves are leaf-shaped and brown', () => {
    expect(primLook(prim('wood-decayed', 'cylinder'), obj('log')).look[0]).toBe(FINISH.cutWood);
    const dead = primLook(prim('leaf', 'box', [40, 0.5, 20]), obj('curled-leaf', 4));
    expect(dead.look[0]).toBe(FINISH.leaf);
    expect(PALETTE.deadLeaf).toContainEqual(dead.color);
  });
});

describe('look table', () => {
  it('resolves the object of each primitive; primitives without one fall back to the material look', () => {
    const objects: WorldObject[] = [{ id: 1, templateId: 'fridge', pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 }, primStart: 0, primCount: 1, tags: [], routeIds: [], poiIds: [] }];
    const look = lookTable(objects);
    expect(look(prim('metal')).color).toEqual(PALETTE.enamel);
    expect(look(prim('metal', 'box', [1, 1, 1], { objectId: 99 })).color).toEqual(PALETTE.greyPaint);
  });
  it('hash01 is deterministic and spread', () => {
    expect(hash01(5, 1)).toBe(hash01(5, 1));
    const v = Array.from({ length: 200 }, (_, i) => hash01(i, 3));
    expect(Math.min(...v)).toBeLessThan(0.1);
    expect(Math.max(...v)).toBeGreaterThan(0.9);
  });
  it('palette colours are linear (sRGB mid grey is about 0.21)', () => {
    expect(lin('#808080')[0]).toBeCloseTo(0.2159, 3);
  });
});
