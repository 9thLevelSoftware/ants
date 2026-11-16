// The antlion pit's shape is one function (pitProfile.ts) for the drawn cone and for anything standing on it, and the
// renderer follows the ground: over the flat sim ground it draws the cone through the ground (depth rule); once the
// sim lowers the ground with the pit overlay, it draws real depths so ants down the slope are not hidden by the sand.
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { getPreset } from '@/render/app/quality';
import { makeTestSim } from '@/sim/testing/testWorld';
import { createPit } from '@/sim/ecology/creatures/antlion';
import { pitGeometry } from './geometry/props';
import { pitHeightOverlay, pitProfileUnit, pitSurfaceY } from './pitProfile';
import { CreatureRenderer } from './CreatureRenderer';
import { creatureSource } from './CreaturesRenderer';
import { PIT_LOOK } from './tuning';

const LIP = PIT_LOOK.lipFraction, LIPH = PIT_LOOK.lipHeightPerR;

describe('antlion pit shape', () => {
  it('pitSurfaceY is the drawn cone: every pit mesh vertex lies on it (within the sand noise)', () => {
    const pit = { pos: { x: 100, y: 3, z: 50 }, radius: 18 }, depth = 13;
    const pos = pitGeometry().getAttribute('position').array as Float32Array;
    for (let i = 0; i < pos.length; i += 3) {
      const x = pit.pos.x + pos[i]! * pit.radius, y = pit.pos.y + pos[i + 1]! * depth, z = pit.pos.z + pos[i + 2]! * pit.radius;
      expect(Math.abs(y - pitSurfaceY(pit, depth, x, z, LIP, LIPH))).toBeLessThan(0.02 * depth);
    }
    expect(pitSurfaceY(pit, depth, 100, 50, LIP, LIPH)).toBeCloseTo(3 - 13, 6);
    expect(pitSurfaceY(pit, depth, 100 + 30, 50, LIP, LIPH)).toBe(3);
    expect(pitProfileUnit(1, LIP, LIPH)).toBe(0);
  });

  it('the height overlay digs the real field into the same cone (ready for the sim\'s createPit)', () => {
    const sim = makeTestSim({ seed: 2 });
    const c = { x: sim.world.size * 0.5, z: sim.world.size * 0.5 };
    const ground = sim.field.height(c.x, c.z);
    const pit = { pos: { x: c.x, y: ground, z: c.z }, radius: 18 }, depth = 13;
    sim.kernel.setHeightOverlay({ ...pitHeightOverlay(9001, pit, depth, 1), material: null });
    for (const [dx, dz] of [[0, 0], [4, 0], [0, -9], [12, 5], [17, 0], [25, 0]] as const) {
      const want = Math.min(pitSurfaceY(pit, depth, c.x + dx, c.z + dz, 0, 0), ground);
      expect(Math.abs(sim.field.height(c.x + dx, c.z + dz) - want)).toBeLessThan(0.35);
    }
  });

  it('over flat ground the cone uses the depth rule; over a sunk pit it draws real depths (antlion too)', () => {
    const sim = makeTestSim({ seed: 2 });
    const c = { x: sim.world.size * 0.5, z: sim.world.size * 0.5 };
    const ground = sim.field.height(c.x, c.z);
    const h = createPit(sim, { x: c.x, y: ground, z: c.z }, 18, 13);
    // its antlion (a plain creature record in the sim's list, as the ecology module spawns it)
    const p = { x: c.x, y: ground, z: c.z }, up = { x: 0, y: 1, z: 0 }, fwd = { x: 0, y: 0, z: 1 };
    (sim.state.creatures as unknown[]).push({ id: 9002, alive: true, kind: 'antlion', variant: null, pos: { ...p }, prevPos: { ...p }, up, prevUp: up, fwd, prevFwd: fwd,
      speed: 0, footOffset: 0, medium: 'surface', state: 'wait', stateTick: 0, flags: 0, hp: 10, bb: { pit: h.id } });
    const scene = new Scene();
    const camera = new PerspectiveCamera(40, 16 / 9, 0.1, 5000);
    camera.position.set(c.x + 30, ground + 40, c.z + 40); camera.lookAt(c.x, ground, c.z); camera.updateMatrixWorld();
    const r = new CreatureRenderer();
    r.init({ scene, camera, quality: getPreset('high') });
    r.setSim(creatureSource(sim));
    const frame = () => r.update({ dt: 1 / 60, time: 0, alpha: 1, camera, viewportHeightPx: 720 });
    frame();
    expect(r.stats.pits).toBe(1);
    const radius = () => (r as unknown as { pits: { slots: { uniforms: { uPitR: { value: number } } }[] } }).pits.slots[0]!.uniforms.uPitR.value;
    const store = (r as unknown as { store: { entries: Map<string, { lods: ({ body: { n: number; a: { aPose: Float32Array } } } | null)[] }> } }).store;
    const antlionPitR = () => store.entries.get('antlion')!.lods.find((l) => l && l.body.n > 0)!.body.a.aPose[1];
    expect(radius()).toBe(18);
    expect(antlionPitR()).toBe(18);
    expect((r as unknown as { pits: { isSunk(id: number): boolean } }).pits.isSunk(h.id)).toBe(false);
    sim.kernel.setHeightOverlay({ ...pitHeightOverlay(h.id, h, h.depth, 1), material: null });
    frame();
    expect(radius()).toBe(0);
    expect(antlionPitR()).toBe(0);
    expect((r as unknown as { pits: { isSunk(id: number): boolean } }).pits.isSunk(h.id)).toBe(true);
    r.dispose();
  });
});
