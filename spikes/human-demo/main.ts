/**
 * Human events demo (task human-events): the production world, decor and ant renderers plus the HumansRenderer over a
 * REAL generated world and a real Sim running the human-events system. Each scene starts one event, steps the sim to
 * a chosen moment of its plan and frames it from ant height (a few workers for scale).
 *
 * URL flags: ?quality=test|low|medium|high|ultra  &scene=<id>  &seed=N  &reduced=1 (no camera tremor)  &hud=0
 * Globals:   window.__ready, window.__human { scenes(), show(id), render(), stats(), dispose() }
 * Scripted by spikes/human-demo/shots.mjs.
 */
import { PerspectiveCamera, Scene, Vector3 } from 'three';
import { createRenderApp, getPreset, isQualityId, type QualityId, type QualityPreset } from '@/render/app';
import { createBrowserAssetLoader } from '@/render/assets';
import { WorldRenderer, type EnvOverride } from '@/render/world/lighting';
import { DecorRenderer } from '@/render/world/decor';
import { AntRenderer } from '@/render/ants';
import { HumansRenderer, samplePose, tremorShake, type TremorShake } from '@/render/world/humans';
import type { FrameInfo } from '@/render';
import type { Sim, WorldData } from '@/sim/types';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { spawnAnt } from '@/sim/entities';
import { walkerPlace } from '@/sim/locomotion/walker';
import { humanEventsSystem, humanPlan, humanSites } from '@/sim/environment/human';
import { surfaceY } from '@/sim/environment/human/ground';
import { newInst } from '@/sim/environment/human/reactive';
import { isFreeAt } from '@/sim/environment/human/grid';
import { SCENES, type SceneDef } from './scenes';

declare global {
  interface Window { __ready?: boolean; __human?: unknown }
}

const qs = new URLSearchParams(location.search);
const frozenT = 2;
const reduced = qs.get('reduced') === '1';
const showHud = qs.get('hud') !== '0';
const hudEl = document.getElementById('hud')!;
const seed = Number(qs.get('seed') ?? 7);
const qualityId: QualityId = isQualityId(qs.get('quality') ?? '') ? (qs.get('quality') as QualityId) : 'high';

const scene = new Scene();
const camera = new PerspectiveCamera(55, 16 / 9, 0.5, 40000);
const preset: QualityPreset = getPreset(qualityId);
preset.dynamicResolution.enabled = false;
const assets = createBrowserAssetLoader({ anisotropy: preset.anisotropy, maxTextureSize: preset.maxTextureSize, warn: (m) => console.warn('[assets]', m) });
const canvas = document.createElement('canvas');
document.body.prepend(canvas);
const app = createRenderApp(canvas, { quality: preset, scene, camera });
const worldRenderer = new WorldRenderer();
const decor = new DecorRenderer();
const ants = new AntRenderer();
const humans = new HumansRenderer();

const worlds = new Map<string, { sim: Sim; world: WorldData }>();
let current: { sim: Sim; world: WorldData; arch: string } | null = null;
let sceneId = '';
const subject = new Vector3();
const shake: TremorShake = { x: 0, y: 0, z: 0 };
const camBase = new Vector3();

async function loadArch(arch: SceneDef['arch']): Promise<{ sim: Sim; world: WorldData }> {
  let w = worlds.get(arch);
  if (!w) {
    const cfg = defaultGameConfig('lasius-niger', seed);
    cfg.cheats = true;
    cfg.world = { ...cfg.world, archetype: arch };
    const g = createNewGame(cfg);
    const sim = createSim(g.state, g.world, { systems: [humanEventsSystem] });
    sim.state.config.difficulty.params.humanFreqMult = 0; // only the scene's event runs
    // the founding queen stays out of shot (the opening is not part of this demo)
    const q = sim.stores.ants.get(sim.state.colonies[0].queenId);
    if (q) { q.pos = { x: 1, y: -2000, z: 1 }; q.nestId = 1; }
    w = { sim, world: g.world };
    worlds.set(arch, w);
  }
  if (!current || current.arch !== arch) {
    await worldRenderer.setWorld(w.world, w.sim);
    decor.setWorld(w.world, w.sim);
    ants.setSim(w.sim);
    humans.onGameStart(w.sim);
    current = { ...w, arch };
  }
  return w;
}

function clearScene(sim: Sim): void {
  const h = sim.state.env.human;
  h.active = []; h.scheduled = [];
  for (const a of sim.state.ants) if (a.alive && a.caste === 'worker') sim.stores.ants.markDead(a.id);
  sim.tick();
}

function placeAnts(sim: Sim, x: number, z: number, n: number, spread: number, baseY: number, k: number): void {
  const col = sim.state.colonies[0];
  for (let i = 0; i < n; i++) {
    const a = (i * 2.399 + k) % (Math.PI * 2), d = spread * (0.35 + 0.65 * (((i * 7 + 3) % 10) / 10));
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    const ant = spawnAnt(sim, { colony: col.id, caste: 'worker', pos: { x: px, y: baseY, z: pz }, fwd: { x: Math.cos(a + 1.3), y: 0, z: Math.sin(a + 1.3) }, ageGd: 5, lengthBu: 1 });
    walkerPlace(sim.field, ant, { x: px, y: baseY + 60, z: pz }, { dir: { x: 0, y: -1, z: 0 }, heading: { x: Math.cos(a + 1.3), y: 0, z: Math.sin(a + 1.3) } }, sim.kernel.walker);
  }
}

async function show(id: string): Promise<{ ok: boolean; note: string; tick: number; actors: number; drops: number; impacts: number; target: number[] }> {
  const def = SCENES.find((s) => s.id === id);
  if (!def) return { ok: false, note: 'no scene', tick: 0, actors: 0, drops: 0, impacts: 0, target: [] };
  const { sim } = await loadArch(def.arch);
  clearScene(sim);
  sceneId = id;
  const sites = humanSites(sim.world).list;
  const site = def.site ? sites.find((s) => s.kind === def.site) : undefined;
  let at = null as { x: number; y: number; z: number } | null;
  if (def.kind === 'bait-station') {
    const floor = sites.find((s) => s.kind === 'interior-floor')!;
    const cx = (floor.rect.x0 + floor.rect.x1) / 2, cz = (floor.rect.z0 + floor.rect.z1) / 2;
    for (let r = 0; r < 2000 && !at; r += 100) if (floor.grid && isFreeAt(floor.grid, cx + r, cz)) at = { x: cx + r, y: floor.y, z: cz };
  }
  const inst = newInst(sim, def.kind, def.variant, site?.id ?? -1, sim.state.tick, at);
  if (def.kind === 'car') inst.param = 0;
  sim.state.env.human.scheduled.push(inst);
  sim.tick();
  const plan = humanPlan(sim, inst);
  if (!plan) return { ok: false, note: 'no plan', tick: sim.state.tick, actors: 0, drops: 0, impacts: 0, target: [] };
  const pool = def.contact ? plan.impacts.filter((i) => i.contact === def.contact) : plan.impacts;
  const imp = pool[Math.min(pool.length - 1, Math.floor(pool.length * def.focus))];
  const target = inst.startTick + imp.t + def.dt;
  const ground = surfaceY(sim, imp.fp.x, imp.fp.z, imp.fp.y);
  while (sim.state.tick < target - 6) sim.tick();
  placeAnts(sim, imp.fp.x, imp.fp.z, def.ants, def.spread, ground, def.id.length);
  while (sim.state.tick < target) sim.tick();
  // look between the focus and where its actor is now (a sole still in the air, a mower still coming)
  const actor = plan.actors[imp.actor];
  const pose = actor ? samplePose(actor.keys, sim.state.tick - inst.startTick, { x: 0, y: 0, z: 0, yaw: 0, lift: 0, u: 0 }) : null;
  const mid = pose && !def.atImpact;
  const ax = mid ? (imp.fp.x + pose.x) / 2 : imp.fp.x, az = mid ? (imp.fp.z + pose.z) / 2 : imp.fp.z;
  subject.set(ax, ground + (mid ? Math.max(0, pose.lift) * 0.5 : 0), az);
  // camera: at ant height, `bearing` from the actor's heading around the focus, turned until nothing solid is
  // between it and the subject (table legs, cabinet sides)
  for (let k = 0; k < 16; k++) {
    const yaw = imp.fp.yaw + def.cam.bearing + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.35;
    const cx = ax + Math.cos(yaw) * def.cam.dist, cz = az + Math.sin(yaw) * def.cam.dist;
    const gy = surfaceY(sim, cx, cz, imp.fp.y);
    camBase.set(cx, gy + def.cam.h, cz);
    if (Math.abs(gy - ground) > 30 && k < 15) continue; // stay on the focus's level (a worktop, not the floor below)
    const look = { x: subject.x, y: subject.y + def.cam.lookUp, z: subject.z };
    if (sim.field.segmentFree({ x: camBase.x, y: camBase.y, z: camBase.z }, look, 1) && sim.field.sample({ x: camBase.x, y: camBase.y, z: camBase.z }) > 2) break;
  }
  render();
  const st = humans.stats();
  return { ok: true, note: def.note, tick: sim.state.tick, actors: st.actors, drops: st.drops, impacts: plan.impacts.length, target: [imp.fp.x, ground, imp.fp.z] };
}

const env: EnvOverride = { hour: 11.5, yearFrac: 0.4, weather: 'clear', cloud: 0.15 };
function render(): void {
  if (!current) return;
  const sim = current.sim;
  tremorShake(sim, camBase, sim.state.tick - 1, reduced, shake);
  camera.position.set(camBase.x + shake.x, camBase.y + Math.max(0, shake.y), camBase.z + shake.z);
  const def = SCENES.find((s) => s.id === sceneId);
  camera.lookAt(subject.x, subject.y + (def?.cam.lookUp ?? 40), subject.z);
  camera.updateMatrixWorld();
  worldRenderer.update({ dt: 0, time: frozenT, sim, subject, env, underground: false });
  decor.update({ dt: 0, time: frozenT, sim, subject, env, dew: 0, windMs: 1.2, still: false });
  decor.flush();
  ants.update({ dt: 0, time: frozenT, alpha: 1, sim, camera, viewportHeightPx: app.renderer.domElement.height, underground: false, possessedPose: null });
  const frame = { dt: 0, time: frozenT, alpha: 1, sim, view: 'possess', underground: false, camera, viewportHeightPx: app.renderer.domElement.height, subject: null, possessedId: -1, possessedPose: null, subjectOpacity: 1, cutaway: null, reducedMotion: reduced } as FrameInfo;
  humans.update(frame);
  app.setFocus(camera.position.distanceTo(subject), undefined, true);
  app.renderFrame(0);
  const gl = app.renderer.getContext();
  const px = new Uint8Array(4);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  if (showHud) {
    const s = app.frameStats();
    hudEl.textContent = `${current.arch} / ${sceneId} / ${qualityId}   draws ${s.drawCalls}  tris ${s.triangles}   tremor ${shake.y.toFixed(1)} mm${reduced ? ' (reduced motion)' : ''}`;
  }
}

window.__human = {
  scenes: () => SCENES.map((s) => ({ id: s.id, note: s.note, arch: s.arch })),
  show,
  render: () => { render(); return humans.stats(); },
  stats: () => ({ frame: app.frameStats(), humans: humans.stats() }),
  /** Visible human actors (name, position) and the camera, for probes. */
  probe: () => ({
    camera: camera.position.toArray().map(Math.round), subject: subject.toArray().map(Math.round),
    visible: humans.group.children.filter((c) => c.visible).map((c) => ({ type: c.type, kids: c.children.length, pos: c.position.toArray().map(Math.round) })),
    inScene: scene.children.includes(humans.group),
    runs: current ? current.sim.state.env.human.active.map((r) => {
      const pl = r.inst ? humanPlan(current!.sim, r.inst) : null;
      return { start: r.inst?.startTick, now: current!.sim.state.tick, imp: pl?.impacts.slice(0, 10).map((i) => [i.t, Math.round(i.fp.x), Math.round(i.fp.z), i.actor]), keys: pl?.actors.map((a) => a.keys.map((k) => [k.t, Math.round(k.x), Math.round(k.lift)])) };
    }) : [],
  }),
  dispose: () => { humans.dispose(); ants.dispose(); decor.dispose(); worldRenderer.dispose(); app.dispose(); },
};

async function boot(): Promise<void> {
  await assets.init();
  app.setOnDemand(true);
  const ctx = { renderer: app.renderer, scene, camera, quality: app.quality, assets, setExposure: (ev: number) => app.setExposure(ev), game: { requestRender: () => {}, testMode: true } };
  await worldRenderer.init(ctx);
  await decor.init(ctx, worldRenderer);
  ants.init(ctx);
  humans.init(ctx);
  await show(qs.get('scene') ?? 'footsteps');
  await app.ready;
  render();
  window.__ready = true;
}

boot().catch((e) => console.error('[human-demo] boot failed', e));
