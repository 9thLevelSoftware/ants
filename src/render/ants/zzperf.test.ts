import { it } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { getPreset } from '@/render/app/quality';
import { AntRenderer } from '@/render/ants/AntRenderer';
import type { AntSimSource, AntView } from '@/render/ants/simAdapter';

it('bench', () => {
  const ants: AntView[] = [];
  for (let i = 0; i < 2000; i++) {
    const p = { x: ((i % 50) - 25) * 4, y: 0, z: Math.floor(i / 50) * 4 - 80 };
    ants.push({ id: i + 1, alive: true, colony: 0, caste: 'worker', pos: p, prevPos: { ...p }, up: { x: 0, y: 1, z: 0 }, prevUp: { x: 0, y: 1, z: 0 },
      fwd: { x: 0, y: 0, z: 1 }, prevFwd: { x: 0, y: 0, z: 1 }, speed: 20, footOffset: 0, medium: 'surface', lengthBu: 1, sizeClass: null,
      flags: 0, pose: 0, carry: { kind: 'none', id: -1 }, cropC: 0, cropP: 0, cropCap: 1, bornTick: 0, alarmLevel: 0 });
  }
  const sim: AntSimSource = { state: { tick: 0, ants, brood: [], items: [], colonies: [{ id: 0, species: 'lasius-niger' }], player: { possessedAntId: -1 } } };
  const camera = new PerspectiveCamera(40, 16 / 9, 0.1, 5000); camera.position.set(0, 60, -120); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const r = new AntRenderer(); r.init({ scene: new Scene(), camera, quality: getPreset('test') }); r.setSim(sim);
  const times: number[] = []; const samp: number[] = [];
  for (let f = 0; f < 400; f++) {
    for (const a of ants) { a.prevPos = a.pos; a.pos = { x: a.pos.x + 0.4 * Math.sin(f * 0.1 + a.id), y: 0, z: a.pos.z + 0.4 }; const h = Math.sin(f * 0.05 + a.id); a.prevFwd = a.fwd; a.fwd = { x: Math.sin(h), y: 0, z: Math.cos(h) }; }
    for (const al of [0.25, 0.5, 0.75, 1]) { r.update({ dt: 1 / 60, time: f / 60, alpha: al, camera, viewportHeightPx: 720 }); if (f > 50) { times.push(r.stats.cpuMs); samp.push(r.stats.sampleMs); } }
  }
  times.sort((a, b) => a - b); samp.sort((a, b) => a - b);
  console.log('median cpu', times[times.length >> 1]!.toFixed(3), 'p10', times[Math.floor(times.length * 0.1)]!.toFixed(3), 'median sample', samp[samp.length >> 1]!.toFixed(3), 'visible', r.stats.visible, 'culled', r.stats.culled);
}, 120000);
