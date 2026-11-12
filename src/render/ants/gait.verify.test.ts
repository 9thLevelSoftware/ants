// Reviewer tests (render-ants): foot sliding measured through the REAL pipeline (fixed 0.1 s sim ticks with
// prevPos/pos, frames at 60 fps with interpolation, SimReader -> stepAntState -> staged instance data -> debugFeet),
// not only the isolated CPU formula. A stance foot is tracked from touchdown to lift-off in world space.
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { getPreset } from '@/render/app/quality';
import { AntRenderer } from './AntRenderer';
import type { AntSimSource, AntView } from './simAdapter';

const TICK = 0.1;
const L = 4; // Lasius worker, mm

interface Script { speed: (t: number) => number; turn: (t: number) => number }

function run(script: Script, seconds: number, fps = 60) {
  const a: AntView = {
    id: 1, alive: true, colony: 0, caste: 'worker', pos: { x: 0, y: 0, z: 0 }, prevPos: { x: 0, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 }, prevUp: { x: 0, y: 1, z: 0 }, fwd: { x: 0, y: 0, z: 1 }, prevFwd: { x: 0, y: 0, z: 1 },
    speed: 0, footOffset: 0, medium: 'surface', lengthBu: 1, sizeClass: null, flags: 0, pose: 0,
    carry: { kind: 'none', id: -1 }, cropC: 0, cropP: 0, cropCap: 1, bornTick: 0, alarmLevel: 0,
  };
  const sim: AntSimSource = { state: { tick: 0, ants: [a], brood: [], items: [], colonies: [{ id: 0, species: 'lasius-niger' }], player: { possessedAntId: 1 } } };
  const camera = new PerspectiveCamera(30, 16 / 9, 0.1, 5000);
  const r = new AntRenderer();
  r.init({ scene: new Scene(), camera, quality: getPreset('test') });
  r.setSim(sim);
  let heading = 0, acc = 0, t = 0;
  const tick = () => {
    a.prevPos = { ...a.pos }; a.prevFwd = { ...a.fwd };
    const v = script.speed(t), w = script.turn(t);
    heading += w * TICK;
    a.fwd = { x: Math.sin(heading), y: 0, z: Math.cos(heading) };
    a.speed = v;
    a.pos = { x: a.pos.x + a.fwd.x * v * TICK, y: 0, z: a.pos.z + a.fwd.z * v * TICK };
    sim.state.tick++;
  };
  const anchors: ({ x: number; z: number } | null)[] = [null, null, null, null, null, null];
  let worst = 0, stances = 0;
  const dt = 1 / fps;
  for (let f = 0; f < seconds * fps; f++) {
    acc += dt; t += dt;
    while (acc >= TICK - 1e-9) { acc -= TICK; tick(); }
    camera.position.set(a.pos.x, 30, a.pos.z - 30); camera.lookAt(a.pos.x, 0, a.pos.z); camera.updateMatrixWorld();
    r.update({ dt, time: t, alpha: acc / TICK, camera, viewportHeightPx: 720 });
    const feet = r.debugFeet(1)!;
    for (let leg = 0; leg < 6; leg++) {
      const ft = feet[leg]!;
      if (!ft.stance) { anchors[leg] = null; continue; }
      const an = anchors[leg];
      if (!an) { anchors[leg] = { x: ft.x, z: ft.z }; stances++; continue; }
      worst = Math.max(worst, Math.hypot(ft.x - an.x, ft.z - an.z));
    }
  }
  return { worst, stances };
}

const cruise = 6 * L;

describe('gait verify: stance feet in the real render pipeline', () => {
  it('straight walking at cruise speed (control): no slide', () => {
    const { worst, stances } = run({ speed: () => cruise, turn: () => 0 }, 3);
    expect(stances).toBeGreaterThan(20);
    expect(worst).toBeLessThan(1e-3);
  });

  it('accelerating and braking while walking straight: no slide', () => {
    const { worst } = run({ speed: (t) => cruise * Math.max(0, Math.sin(t * 2)), turn: () => 0 }, 4);
    expect(worst).toBeLessThan(1e-3);
  });

  it('constant turn 1.5 rad/s: drift below 2 % of body length (implementer claim 0.009 mm)', () => {
    const { worst } = run({ speed: () => cruise, turn: () => 1.5 }, 3);
    expect(worst).toBeLessThan(0.02 * L);
  });

  it('wander (turn rate changes every tick, like the sim steering): drift below 2 % of body length', () => {
    // deterministic pseudo-random turn rate, re-chosen every tick, |w| <= 2 rad/s
    const w = (t: number) => { const k = Math.floor(t / TICK); return 2 * Math.sin(k * 12.9898) * Math.cos(k * 4.1414); };
    const { worst } = run({ speed: () => cruise, turn: w }, 4);
    expect(worst).toBeLessThan(0.02 * L);
  });

  it('starting a turn mid-stance (straight, then 2 rad/s): drift below 2 % of body length', () => {
    const { worst } = run({ speed: () => cruise, turn: (t) => (t > 1.03 ? 2 : 0) }, 2);
    expect(worst).toBeLessThan(0.02 * L);
  });

  it('slowing to a stop while turning (share changes mid-stance): drift below 2 % of body length', () => {
    const { worst } = run({ speed: (t) => (t < 1 ? cruise : Math.max(0, cruise * (2 - t))), turn: () => 1.2 }, 3);
    expect(worst).toBeLessThan(0.02 * L);
  });
});
