import { describe, expect, it } from 'vitest';
import { CELLCAM_FILL, CELLCAM_ON_L, CELLCAM_ON_S, CELLCAM_SIDE_PITCH_DEG, CELLCAM_TOP_HOLD_S } from './constants';
import { CellCam, azimuthBetween, cellShotSubject, cellSideShotAt, finishCut, freeToward, makeCellSideShot, makeHeldSection, openAzimuth, probeOrigin } from './cellCam';
import type { CameraTarget } from './types';
import type { FoundingShotSubject } from './foundingShot';

const BU = 4;
const L = 8.5; // the founding queen, mm

/** A rectangular cell (mm): free inside a box, solid outside; f is the distance to the nearest wall (positive inside). */
const boxField = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => (x: number, y: number, z: number) =>
  Math.min(x - x0, x1 - x, y - y0, y1 - y, z - z0, z1 - z);
/** The founding's cell: 18 x 10 x 16 mm, floor at y = 0. */
const cell = boxField(-9, 9, 0, 10, -8, 8);

const queenOnFloor = (x = 0, z = 0, fwd = { x: 0, y: 0, z: 1 }): CameraTarget => ({ pos: { x, y: 0, z }, up: { x: 0, y: 1, z: 0 }, fwd });
const subjectOf = (): FoundingShotSubject => ({ x: 0, y: 0, z: 0, radius: 0, cutY: 0 });

describe('cell camera take-over', () => {
  it('takes over after the rig has been squeezed against the ant for CELLCAM_ON_S, not before', () => {
    const c = new CellCam();
    const squeezed = CELLCAM_ON_L * L * 0.6;
    c.update(CELLCAM_ON_S * 0.5, squeezed, L, true, 0.3, 1, true);
    expect(c.active).toBe(false);
    c.update(CELLCAM_ON_S * 0.6, squeezed, L, true, 0.3, 1, true);
    expect(c.active).toBe(true);
    expect(c.azimuth).toBeCloseTo(0.3, 9);
  });

  it('never takes over above ground or when the rig has room', () => {
    const c = new CellCam();
    for (let i = 0; i < 60; i++) c.update(0.05, CELLCAM_ON_L * L * 0.5, L, false, 0, 1, true);
    expect(c.active).toBe(false);
    for (let i = 0; i < 60; i++) c.update(0.05, CELLCAM_ON_L * L * 1.5, L, true, 0, 1, true);
    expect(c.active).toBe(false);
  });

  it('blends in over its blend time and out again once the rig is roomy', () => {
    const c = new CellCam();
    for (let i = 0; i < 40; i++) c.update(0.05, L, L, true, 0, 1, true);
    expect(c.weight).toBe(1);
    for (let i = 0; i < 100; i++) c.update(0.05, 6 * L, L, true, 0, 1, true);
    expect(c.weight).toBe(0);
    expect(c.active).toBe(false);
  });

  it('chooses the side view on a steep wall or under a low roof, and returns to the view from above only after a hold', () => {
    const c = new CellCam();
    for (let i = 0; i < 20; i++) c.update(0.05, L, L, true, 0, 0.3, true);
    expect(c.sideView).toBe(true);
    // floor and open air again: the hold first
    c.update(CELLCAM_TOP_HOLD_S * 0.5, L, L, true, 0, 1, true);
    expect(c.sideView).toBe(true);
    c.update(CELLCAM_TOP_HOLD_S * 0.6, L, L, true, 0, 1, true);
    expect(c.sideView).toBe(false);
    // a roof over her back sends it to the side view even on a floor
    c.update(0.05, L, L, true, 0, 1, false);
    expect(c.sideView).toBe(true);
  });
});

describe('cell camera subject (view from above)', () => {
  it('puts the slice just above her back, under the roof of the cell', () => {
    const s = cellShotSubject(subjectOf(), queenOnFloor(), L, BU, cell);
    expect(s.open).toBe(true);
    expect(s.cutY).toBeGreaterThan(L * 0.3);
    expect(s.cutY).toBeLessThan(10); // under the cell's roof (10 mm)
    expect(s.radius).toBeGreaterThan(0);
  });

  it('lowers the plane under a low roof and reports a roof she is touching as not open', () => {
    const low = boxField(-9, 9, 0, 4, -8, 8);
    const s = cellShotSubject(subjectOf(), queenOnFloor(), L, BU, low);
    expect(s.cutY).toBeLessThan(4);
    const tight = boxField(-9, 9, 0, 1, -8, 8);
    expect(cellShotSubject(subjectOf(), queenOnFloor(), L, BU, tight).open).toBe(false);
  });

  it('is allocation-free in the sense that it reuses the output object', () => {
    const out = subjectOf();
    expect(cellShotSubject(out, queenOnFloor(), L, BU, cell)).toBe(out);
  });
});

describe('cell camera side view', () => {
  it('stands the section in open space between the camera and the ant, inside the room', () => {
    const t = queenOnFloor();
    const s = cellShotSubject(subjectOf(), t, L, BU, cell);
    const side = cellSideShotAt(makeCellSideShot(), s, t, L, Math.PI / 2, BU, cell);
    const c = side.cutaway;
    expect(c.section).toBe('vertical');
    expect(c.offset!).toBeGreaterThan(0.2 * L);
    // the plane's point is in free space
    const px = s.x - c.viewDir!.x * c.offset!, pz = s.z - c.viewDir!.z * c.offset!;
    expect(cell(px, s.y + 0.2 * L, pz)).toBeGreaterThan(0);
    // the camera looks at her from the pitch over the horizontal, from the open side
    const p = side.pose, rise = p.pos.y - p.look.y, run = Math.hypot(p.pos.x - p.look.x, p.pos.z - p.look.z);
    expect((Math.atan2(rise, run) * 180) / Math.PI).toBeCloseTo(CELLCAM_SIDE_PITCH_DEG, 3);
    expect(side.distance).toBeGreaterThan(0);
  });

  it('keeps the whole ant in the frame (the subject sphere fills CELLCAM_FILL of the vertical field)', () => {
    const t = queenOnFloor();
    const s = cellShotSubject(subjectOf(), t, L, BU, cell);
    const side = cellSideShotAt(makeCellSideShot(), s, t, L, 0, BU, cell);
    const half = Math.tan((side.pose.fov * Math.PI) / 360);
    expect(s.radius / side.distance).toBeCloseTo(CELLCAM_FILL * Math.sin((side.pose.fov * Math.PI) / 360), 6);
    expect(half).toBeGreaterThan(0);
  });
});

describe('cell camera in a tunnel barely higher than she is', () => {
  // a slot 1.6 mm high (floor 0, roof 1.6): the point 0.2 body lengths over her feet (1.7 mm) is inside the roof
  const slot = boxField(-30, 30, 0, 1.6, -3, 3);
  const t = queenOnFloor();

  it('starts the free-room probes at the highest lift that is still in open space', () => {
    expect(slot(0, 0.2 * L, 0)).toBeLessThan(0);
    const o = probeOrigin({ x: 0, y: 0, z: 0 }, t, L, slot);
    expect(slot(o.x, o.y, o.z)).toBeGreaterThan(0);
  });

  it('finds the room along the slot (the old probe found none in any direction)', () => {
    expect(freeToward(t, L, BU, slot, Math.PI / 2, 20)).toBeGreaterThan(10); // along x
    expect(freeToward(t, L, BU, slot, 0, 20)).toBeLessThan(3.1); // across: 3 mm to the wall
    const az = openAzimuth(queenOnFloor(0, 0, { x: 1, y: 0, z: 0 }), L, BU, slot, 0);
    expect(Math.abs(Math.sin(az))).toBeGreaterThan(0.5); // the camera stands along the slot, not across it
  });
});

describe('cell camera helpers', () => {
  it('measures the free room toward a direction in the carve field', () => {
    const t = queenOnFloor();
    // toward +x the wall is 9 mm from her thorax
    const free = freeToward(t, L, BU, cell, Math.PI / 2, 40);
    expect(free).toBeGreaterThan(7);
    expect(free).toBeLessThanOrEqual(9);
    expect(freeToward(t, L, BU, undefined, 0, 12)).toBe(12);
  });

  it('looks for the open side of a room that is open one way only', () => {
    // a corridor along z: open both ways in z, 1.5 mm each way in x
    const corridor = boxField(-1.5, 1.5, 0, 10, -40, 40);
    const t = queenOnFloor(0, 0, { x: 0, y: 0, z: 1 });
    const az = openAzimuth(t, L, BU, corridor, 0);
    // the camera stands along the corridor (azimuth 0 or pi), never across it
    expect(Math.abs(Math.sin(az))).toBeLessThan(0.55);
  });

  it('azimuthBetween is null when two points are nearly above each other', () => {
    expect(azimuthBetween({ x: 0, z: 0 }, { x: 0.1, z: 0 }, 1)).toBeNull();
    expect(azimuthBetween({ x: 0, z: 0 }, { x: 5, z: 0 }, 1)).toBeCloseTo(Math.PI / 2, 9);
  });
});

describe('cell camera cut: the vertical section is never moved toward the camera', () => {
  const planeOf = (c: { center: { x: number; z: number }; viewDir?: { x: number; z: number }; offset?: number }) => -c.viewDir!.x * c.center.x - c.viewDir!.z * c.center.z + (c.offset ?? 0);

  it('snaps the centre along the plane only: the plane stays where the side view fitted it', () => {
    const t = queenOnFloor(1.3, 0.7), held = makeHeldSection();
    const s = cellShotSubject(subjectOf(), t, L, BU, cell);
    for (const az of [0, 0.4, Math.PI / 2, 2.2]) {
      const c = cellSideShotAt(makeCellSideShot(), s, t, L, az, BU, cell).cutaway, before = planeOf(c);
      held.valid = false;
      finishCut(c, held, 3, 0.5);
      expect(planeOf(c)).toBeCloseTo(before, 9);
      // along the plane (-nz, nx) with n = -viewDir the centre is on the 3 mm grid
      const a = c.viewDir!.z * c.center.x - c.viewDir!.x * c.center.z;
      expect(Math.abs(a / 3 - Math.round(a / 3))).toBeLessThan(1e-9);
    }
  });

  it('holds the plane while the wanted one stays within the band toward her, and never lets it stand nearer the camera than wanted', () => {
    const t = queenOnFloor(), held = makeHeldSection();
    const s = cellShotSubject(subjectOf(), t, L, BU, cell);
    const at = (offset: number) => { const c = cellSideShotAt(makeCellSideShot(), s, t, L, Math.PI / 2, BU, cell).cutaway; c.offset = offset; finishCut(c, held, 3, 0.5); return planeOf(c); };
    // the queen stands at x = 0 and the camera is toward +x: the plane's position is its offset
    expect(at(3)).toBeCloseTo(3, 9);
    expect(at(3.3)).toBeCloseTo(3, 9); // the wanted plane moved 0.3 mm away from her: held
    expect(at(3.5)).toBeCloseTo(3, 9);
    expect(at(3.6)).toBeCloseTo(3.6, 9); // beyond the band: the plane follows
    expect(at(3.2)).toBeCloseTo(3.2, 9); // the wanted plane came back toward her past the held one: the held plane would stand nearer the camera than wanted
  });

  it('puts no soil between the section and the ant on the line of sight under a low roof', () => {
    // a slot with a roof 6 mm over the floor starting 3 mm from her: the level probe sees 20 mm of room, the camera's line (14 degrees up) meets the roof first
    const room = (x: number, y: number, z: number) => Math.min(y - 0, (x < 3 ? 99 : 6 - y), 9 - Math.abs(z), 40 - x, x + 40);
    const t = queenOnFloor(), s = cellShotSubject(subjectOf(), t, L, BU, room);
    const c = cellSideShotAt(makeCellSideShot(), s, t, L, Math.PI / 2, BU, room).cutaway;
    // the line from her thorax at the steepest pitch crosses x = 3 at y = 0.2 L + 3 tan 52 = 5.6 mm: under the roof, so the plane may stand at 3 mm or more; with a roof at 4 mm it must stand nearer
    const low = (x: number, y: number, z: number) => Math.min(y - 0, (x < 3 ? 99 : 4 - y), 9 - Math.abs(z), 40 - x, x + 40);
    const c2 = cellSideShotAt(makeCellSideShot(), s, t, L, Math.PI / 2, BU, low).cutaway;
    expect(c2.offset!).toBeLessThan(c.offset! + 1e-9);
    expect(c2.offset!).toBeLessThanOrEqual(3 + 1e-9);
  });
});
