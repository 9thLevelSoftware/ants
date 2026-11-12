// Debug effects renderer (slot `fx`): spatial markers as flat translucent discs of their radius, laid on the
// terrain, so marker placement is visible before the real marker/scent renderers exist.
import { CircleGeometry, DoubleSide, Group, Matrix4, MeshBasicMaterial, Quaternion, Vector3, type Scene } from 'three';
import type { Sim } from '@/sim/types';
import type { FrameInfo, RenderContext, SubRenderer } from '../index';
import { InstancePool } from './instancePool';
import { DEBUG_COLORS } from './palette';

/** Discs float this far above the ground, BU (no z-fighting). */
const LIFT_BU = 0.05;
const DISC_OPACITY = 0.35;

const _m = new Matrix4(), _p = new Vector3(), _s = new Vector3();
const _flat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);

export class DebugFxRenderer implements SubRenderer {
  readonly name = 'debug-fx';
  private scene: Scene | null = null;
  private readonly root = new Group();
  private pool: InstancePool | null = null;
  private sim: Sim | null = null;

  init(ctx: RenderContext): void {
    this.scene = ctx.scene;
    this.root.name = 'debug-fx-root';
    ctx.scene.add(this.root);
    const mat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: DISC_OPACITY, depthWrite: false, side: DoubleSide });
    this.pool = new InstancePool(this.root, new CircleGeometry(1, 32), mat, 16, 'debug-markers');
  }

  onGameStart(sim: Sim): void { this.sim = sim; }

  update(frame: FrameInfo): void {
    const sim = frame.sim, pool = this.pool;
    if (!sim || sim !== this.sim || !pool) return;
    const bu = sim.world.bu;
    pool.begin();
    for (const mk of sim.state.markers) {
      if (!mk.alive) continue;
      const y = Math.max(mk.pos.y, sim.field.height(mk.pos.x, mk.pos.z)) + LIFT_BU * bu;
      const r = Math.max(mk.radius, bu);
      pool.set(_m.compose(_p.set(mk.pos.x, y, mk.pos.z), _flat, _s.set(r, r, r)), DEBUG_COLORS.marker);
    }
    pool.commit();
  }

  stats(): Record<string, number> { return { markers: this.pool?.count ?? 0 }; }

  onGameEnd(): void {
    this.pool?.begin();
    this.pool?.commit();
    this.sim = null;
  }

  dispose(): void {
    this.onGameEnd();
    if (this.pool) { this.pool.dispose(); this.pool.mesh.geometry.dispose(); (this.pool.mesh.material as MeshBasicMaterial).dispose(); }
    this.scene?.remove(this.root);
    this.scene = null;
  }
}
