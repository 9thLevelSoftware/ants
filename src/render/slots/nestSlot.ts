// Registry slot 'nest': the real carve-grid renderer (tunnels, chambers, underground lighting, colony cutaway).
// Shares the world slot's material library, follows the sim's chunk-dirty events, takes the daylight that falls
// into the openings from the world's lighting, and applies the cutaway to the world's surface materials while
// the colony view cuts the ground open. The world renderer owns exposure and fog (its UNDERGROUND constants);
// the nest look is not used to drive them (one owner, see the gate report).
import { Color, PointLight, type Material, type Mesh, type Object3D } from 'three';
import type { FrameInfo, RenderContext, SubRenderer } from '@/render';
import type { QualityPreset } from '@/render/app';
import type { Sim } from '@/sim/types';
import { NEST_LIGHT, NEST_LOOK, NestRenderer, type NestFrame } from '../nest';
import { DAYLIGHT_RGB, OCCLUSION_KEEP, SENSE_LIGHT_SCALE } from './params';

const ZERO = { x: 0, y: 0, z: 0 };
import { WorldSlot } from './worldSlot';

export class NestSlot implements SubRenderer {
  readonly name = 'nest';
  readonly nest = new NestRenderer();
  private ctx!: RenderContext;
  private world: WorldSlot | null = null;
  private sim: Sim | null = null;
  /** Point light matching the walls' sense light, for the scene-lit objects underground (decay 0: windowed). */
  private readonly sense = new PointLight(new Color(NEST_LIGHT.lanternHex), 0, 1, 0);
  private offDirty: (() => void) | null = null;
  private readonly patched = new WeakSet<Material>();
  private readonly nf: NestFrame = { dt: 0, time: 0, sim: null, subject: null, cutaway: null };

  init(ctx: RenderContext): Promise<void> {
    this.ctx = ctx;
    this.sense.name = 'nest:sense-light';
    this.sense.castShadow = false;
    ctx.scene.add(this.sense); // always in the scene: toggling a light's visibility recompiles every lit material
    const w = ctx.peer?.('world');
    this.world = w instanceof WorldSlot ? w : null;
    return this.nest.init({ ...ctx, library: this.world?.world.library });
  }

  onGameStart(sim: Sim): void {
    this.offDirty?.();
    this.offDirty = sim.events.on('carve-chunks-dirty', (e) => this.nest.markDirty(e.keys));
    this.sim = sim;
    this.nest.onGameStart(sim);
    if (this.ctx.game.testMode) this.nest.flush();
  }

  onGameEnd(): void {
    this.offDirty?.();
    this.offDirty = null;
    this.sim = null;
    this.sense.intensity = 0;
    this.nest.onGameEnd();
  }

  update(frame: FrameInfo): void {
    const n = this.nf;
    n.dt = frame.dt; n.time = frame.time; n.sim = frame.sim; n.subject = frame.subject; n.cutaway = frame.cutaway;
    if (frame.cutaway && frame.cutaway.mode !== 'off') this.patchSurface();
    // occlusion cutaway (GDD 01 6.5 rule 3): walls between the camera and the possessed ant are dithered away
    const f = frame.fade;
    if (f && f.occlusion > 0) this.nest.setOcclusionCapsule(f.capsuleA, f.capsuleB, f.capsuleRadius, 1 - f.occlusion * (1 - OCCLUSION_KEEP));
    else this.nest.setOcclusionCapsule(ZERO, ZERO, 0);
    const w = this.world?.world;
    const light = w ? Math.max(0, Math.min(1, w.env.light)) : 1;
    this.nest.setDaylight(DAYLIGHT_RGB[0] * light, DAYLIGHT_RGB[1] * light, DAYLIGHT_RGB[2] * light);
    // the nest light is calibrated for the underground exposure; never let a brighter surface exposure amplify it
    const ev = w ? w.lighting.exposureEV : NEST_LOOK.exposureEV;
    const gain = Math.min(1, Math.pow(2, NEST_LOOK.exposureEV - ev));
    this.nest.setArtificialGain(gain);
    this.nest.update(n);
    this.updateSenseLight(gain);
    if (this.ctx.game.testMode) { // single settled frames: every pending chunk and the whole cap now
      this.nest.flush();
      if (frame.cutaway && frame.cutaway.mode === 'slice') this.nest.flushCutaway();
    }
  }

  /**
   * The nest walls have their own sense light (a warm glow around the possessed ant); ants, brood and items are
   * lit by scene lights, so underground they were near black next to the lit walls. A matching point light lights
   * them while the view is underground (eased with the nest look).
   */
  private updateSenseLight(gain: number): void {
    const under = this.nest.look.under, src = this.nest.lanternPos;
    if (!this.sim || under <= 0.01) { this.sense.intensity = 0; return; }
    const bu = this.sim?.world.bu ?? 4;
    this.sense.position.set(src.x, src.y, src.z);
    this.sense.distance = NEST_LIGHT.lanternRadiusBU * bu;
    this.sense.intensity = Math.PI * NEST_LIGHT.lanternLevel * SENSE_LIGHT_SCALE * gain * under;
  }

  /**
   * The cutaway hides the surface above the slice and darkens it outside R_cut. World materials can be created
   * lazily (mounds, new primitive buckets), so the world group is checked each cutaway frame; each material once.
   */
  private patchSurface(): void {
    const group = this.world?.world.group;
    if (!group) return;
    group.traverse((o: Object3D) => {
      const mats = (o as Mesh).material;
      if (!mats) return;
      for (const m of Array.isArray(mats) ? mats : [mats]) {
        if (this.patched.has(m) || !(m as { isMeshStandardMaterial?: boolean }).isMeshStandardMaterial) continue;
        this.patched.add(m);
        this.nest.patchSurfaceMaterial(m);
      }
    });
  }

  setQuality(q: QualityPreset): void {
    this.nest.setQuality(q);
  }

  stats(): Record<string, number> {
    return this.nest.stats();
  }

  dispose(): void {
    this.offDirty?.();
    this.offDirty = null;
    this.sense.removeFromParent();
    this.sense.dispose();
    this.nest.dispose();
  }
}
