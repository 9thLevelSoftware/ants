// Debug creatures renderer (slot `creatures`): each creature as an ellipsoid of its walker radius, oriented by its
// interpolated (pos, up, fwd). Kinds are not told apart here; the real creature renderer does that.
import { Group, Matrix4, MeshLambertMaterial, SphereGeometry, Vector3, type Scene } from 'three';
import type { Sim } from '@/sim/types';
import type { FrameInfo, RenderContext, SubRenderer } from '../index';
import { InstancePool } from './instancePool';
import { DEBUG_COLORS } from './palette';
import { interpolateWalker, newPose, poseMatrix } from './pose';

const SNAP_BU = 8;
/** Body proportions relative to the walker radius: long, high, wide. */
const BODY = { long: 1.6, high: 0.8, wide: 1 };

const _m = new Matrix4(), _pose = newPose(), _s = new Vector3();

export class DebugCreaturesRenderer implements SubRenderer {
  readonly name = 'debug-creatures';
  private scene: Scene | null = null;
  private readonly root = new Group();
  private pool: InstancePool | null = null;
  private sim: Sim | null = null;

  init(ctx: RenderContext): void {
    this.scene = ctx.scene;
    this.root.name = 'debug-creatures-root';
    ctx.scene.add(this.root);
    this.pool = new InstancePool(this.root, new SphereGeometry(1, 14, 10), new MeshLambertMaterial({ color: 0xffffff }), 16, 'debug-creatures');
  }

  onGameStart(sim: Sim): void { this.sim = sim; }

  update(frame: FrameInfo): void {
    const sim = frame.sim, pool = this.pool;
    if (!sim || sim !== this.sim || !pool) return;
    const bu = sim.world.bu;
    pool.begin();
    for (const c of sim.state.creatures) {
      if (!c.alive) continue;
      interpolateWalker(_pose, c, frame.alpha, SNAP_BU * bu);
      const r = Math.max(c.radius, 0.5 * bu);
      poseMatrix(_m, _pose, r * BODY.high - c.footOffset, 1);
      _m.scale(_s.set(r * BODY.long, r * BODY.high, r * BODY.wide));
      pool.set(_m, DEBUG_COLORS.creature);
    }
    pool.commit();
  }

  stats(): Record<string, number> { return { creatures: this.pool?.count ?? 0 }; }

  onGameEnd(): void {
    this.pool?.begin();
    this.pool?.commit();
    this.sim = null;
  }

  dispose(): void {
    this.onGameEnd();
    if (this.pool) { this.pool.dispose(); this.pool.mesh.geometry.dispose(); (this.pool.mesh.material as MeshLambertMaterial).dispose(); }
    this.scene?.remove(this.root);
    this.scene = null;
  }
}
