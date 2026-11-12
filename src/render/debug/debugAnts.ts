// Debug ants renderer (slot `ants`): every ant as an instanced stand-in body oriented by its interpolated
// (pos, up, fwd) at its true length, brood as pale ellipsoids by stage, loose and carried items as small spheres.
// The possessed ant uses the per-frame predicted pose and hides when the camera fade says so.
import { Group, Matrix4, MeshLambertMaterial, SphereGeometry, Vector3, type Scene } from 'three';
import type { Ant, Brood, Item, Sim } from '@/sim/types';
import type { FrameInfo, RenderContext, SubRenderer } from '../index';
import { buildAntShape } from './antShape';
import { InstancePool } from './instancePool';
import { DEBUG_COLORS } from './palette';
import { copyPose, interpolateWalker, newPose, poseMatrix, type PoseOut } from './pose';

/** A pose jump longer than this (BU) is drawn without interpolation (teleport / placement). */
const SNAP_BU = 4;
/** The possessed ant is hidden below this camera-fade opacity. */
const HIDE_BELOW_OPACITY = 0.25;
/** Brood sizes in BU (length, thickness) by stage. */
const BROOD_SIZE_BU: Record<string, [number, number]> = { egg: [0.13, 0.09], larva: [0.32, 0.15], pupa: [0.4, 0.16] };
/** Carried things sit this far in front of / above the carrier's feet, in body lengths. */
const CARRY_FWD_L = 0.5;
const CARRY_UP_L = 0.17;
const ITEM_RADIUS_BU = 0.18;

const _m = new Matrix4(), _carrier = newPose(), _scale = new Vector3();

function casteColor(a: Ant, playerColony: number): number {
  if (a.colony !== playerColony) return DEBUG_COLORS.rival;
  if (a.caste === 'queen') return DEBUG_COLORS.queen;
  if (a.caste === 'male') return DEBUG_COLORS.male;
  if (a.caste === 'gyne') return DEBUG_COLORS.gyne;
  return DEBUG_COLORS.worker;
}

export class DebugAntsRenderer implements SubRenderer {
  readonly name = 'debug-ants';
  private scene: Scene | null = null;
  private readonly root = new Group();
  private ants: InstancePool | null = null;
  private brood: InstancePool | null = null;
  private items: InstancePool | null = null;
  private readonly poses = new Map<number, PoseOut>();
  private sim: Sim | null = null;

  init(ctx: RenderContext): void {
    this.scene = ctx.scene;
    this.root.name = 'debug-ants-root';
    ctx.scene.add(this.root);
    const mat = new MeshLambertMaterial({ color: 0xffffff });
    this.ants = new InstancePool(this.root, buildAntShape(), mat, 256, 'debug-ants');
    const blob = new SphereGeometry(1, 10, 7);
    this.brood = new InstancePool(this.root, blob, new MeshLambertMaterial({ color: 0xffffff }), 64, 'debug-brood');
    this.items = new InstancePool(this.root, blob, new MeshLambertMaterial({ color: 0xffffff }), 64, 'debug-items');
  }

  onGameStart(sim: Sim): void {
    this.sim = sim;
  }

  /** The drawn pose of an ant this frame (interpolated, or the prediction for the possessed ant). */
  private poseOf(a: Ant, frame: FrameInfo, bu: number): PoseOut {
    let p = this.poses.get(a.id);
    if (!p) { p = newPose(); this.poses.set(a.id, p); }
    if (a.id === frame.possessedId && frame.possessedPose) return copyPose(p, frame.possessedPose);
    return interpolateWalker(p, a, frame.alpha, SNAP_BU * bu);
  }

  update(frame: FrameInfo): void {
    const sim = frame.sim;
    if (!sim || sim !== this.sim || !this.ants || !this.brood || !this.items) return;
    const bu = sim.world.bu;
    const player = sim.state.colonies[0]?.id ?? -1;
    this.ants.begin();
    for (const a of sim.state.ants) {
      if (!a.alive) continue;
      const p = this.poseOf(a, frame, bu);
      if (a.id === frame.possessedId && frame.subjectOpacity < HIDE_BELOW_OPACITY) continue;
      const L = a.lengthBu * bu;
      this.ants.set(poseMatrix(_m, p, -a.footOffset, L), casteColor(a, player));
    }
    this.ants.commit();
    if (this.poses.size > sim.state.ants.length * 2 + 64) this.prunePoses(sim);
    this.drawBrood(sim, bu);
    this.drawItems(sim, bu);
  }

  /** Where a carried thing is drawn: in front of the carrier's head, else its own position. */
  private carriedPose(sim: Sim, carrierId: number, bu: number, out: PoseOut): boolean {
    const c = sim.stores.ants.get(carrierId);
    if (!c) return false;
    const p = this.poses.get(c.id);
    copyPose(out, p ?? c);
    const L = c.lengthBu * bu;
    out.pos.x += out.fwd.x * CARRY_FWD_L * L + out.up.x * CARRY_UP_L * L;
    out.pos.y += out.fwd.y * CARRY_FWD_L * L + out.up.y * CARRY_UP_L * L;
    out.pos.z += out.fwd.z * CARRY_FWD_L * L + out.up.z * CARRY_UP_L * L;
    return true;
  }

  private drawBrood(sim: Sim, bu: number): void {
    const pool = this.brood!;
    pool.begin();
    for (const b of sim.state.brood) {
      if (!b.alive) continue;
      const size = BROOD_SIZE_BU[b.stage] ?? BROOD_SIZE_BU.egg;
      if (!(b.carriedBy >= 0 && this.carriedPose(sim, b.carriedBy, bu, _carrier))) this.restingPose(b, _carrier);
      // ellipsoid: length along the pose forward, thickness across
      poseMatrix(_m, _carrier, size[1] * 0.5 * bu, 1);
      _m.scale(_scale.set(size[0] * 0.5 * bu, size[1] * 0.5 * bu, size[1] * 0.5 * bu));
      pool.set(_m, b.stage === 'egg' ? DEBUG_COLORS.egg : b.stage === 'larva' ? DEBUG_COLORS.larva : DEBUG_COLORS.pupa);
    }
    pool.commit();
  }

  private restingPose(t: Brood | Item, out: PoseOut): void {
    out.pos.x = t.pos.x; out.pos.y = t.pos.y; out.pos.z = t.pos.z;
    out.up.x = 0; out.up.y = 1; out.up.z = 0;
    out.fwd.x = 1; out.fwd.y = 0; out.fwd.z = 0;
  }

  private drawItems(sim: Sim, bu: number): void {
    const pool = this.items!;
    pool.begin();
    for (const it of sim.state.items) {
      if (!it.alive) continue;
      const carried = it.carrierIds.length > 0 && this.carriedPose(sim, it.carrierIds[0], bu, _carrier);
      if (!carried) this.restingPose(it, _carrier);
      const r = Math.max(ITEM_RADIUS_BU * bu, Math.min(it.lengthMm * 0.5, 1.5 * bu));
      poseMatrix(_m, _carrier, r, r);
      pool.set(_m, it.kind === 'soil-pellet' ? DEBUG_COLORS.pellet : DEBUG_COLORS.item);
    }
    pool.commit();
  }

  private prunePoses(sim: Sim): void {
    for (const id of this.poses.keys()) if (!sim.stores.ants.get(id)) this.poses.delete(id);
  }

  stats(): Record<string, number> {
    return { ants: this.ants?.count ?? 0, brood: this.brood?.count ?? 0, items: this.items?.count ?? 0 };
  }

  onGameEnd(): void {
    this.poses.clear();
    for (const p of [this.ants, this.brood, this.items]) { if (p) { p.begin(); p.commit(); } }
    this.sim = null;
  }

  dispose(): void {
    this.onGameEnd();
    for (const p of [this.ants, this.brood, this.items]) {
      if (!p) continue;
      p.dispose();
      p.mesh.geometry.dispose();
      (p.mesh.material as MeshLambertMaterial).dispose();
    }
    this.scene?.remove(this.root);
    this.scene = null;
  }
}
