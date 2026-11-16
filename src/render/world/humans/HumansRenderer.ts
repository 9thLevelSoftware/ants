// Human-event renderer (GDD 04 §15, GDD 08 §11.7): for every running event it draws the plan's actors at the
// interpolated tick — soles, paws, the mower deck, broom, nozzle, cloth, falling food, pours, water jets, the car's
// underside, the bait station, a toy scoop — each with a soft shadow that arrives first and darkens as the thing
// comes down. Reads the sim, never writes it. Pools meshes per actor kind; nothing is allocated per frame in steady
// state except pool growth.

import { BoxGeometry, Color, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Quaternion, SphereGeometry, Vector3, type Scene } from 'three';
import type { FrameInfo, RenderContext, SubRenderer } from '@/render';
import type { QualityPreset } from '@/render/app';
import type { Sim } from '@/sim/types';
// light paths on purpose: the module index pulls the runner (progression, combat ...) and, through them, the sim's
// system list, which itself lists this module: importing the index first from render code would close that cycle
import { humanPlan } from '@/sim/environment/human/plans';
import type { Actor, ActorKey, ActorKind, HumanPlan } from '@/sim/environment/human/plan';
import { surfaceY } from '@/sim/environment/human/ground';
import { CAR_BODY, CAR_TYRE, GAIT, MOW_DECK_MM, MOW_WHEEL_D_MM, MOW_WHEEL_W_MM, VACUUM_STRIP_W, BROOM_STROKE_L, BROOM_STROKE_W } from '@/sim/balance/human';
import { createHumanMaterials, disposeHumanMaterials, type HumanMaterials } from './materials';
import {
  buildBroom, buildCloth, buildCrumb, buildNozzle, buildPaw, buildPour, buildScoop, buildShadowQuad, buildShoe, buildStation,
  buildWetStreak,
} from './geometry';
import { buildCar, buildHoseNozzle, buildMower, buildSprinkler } from './machines';
import { planTime, samplePose, type ActorPose } from './pose';

interface Visual {
  root: Group;
  /** Spinning parts (wheels, blade, tyres) and pour parts, kind-specific. */
  spin: Mesh[];
  stream?: Mesh;
  film?: Mesh;
  crown?: Mesh;
  shadow: Mesh;
  /** Shadow radius at lift 0 (mm) and the lift at which it has faded to its faintest. */
  shadowR: number;
}

type VisualKey = ActorKind | 'water-pour' | 'kibble' | 'sprinkler' | 'hose-nozzle';

const MAX_DROPS = 600;
const MAX_CHIPS = 900;
const CLIP = new Color('#6f8f3a'), SAND = new Color('#b39a6a'), DUST = new Color('#9a9188');
const tmpQ = new Quaternion(), yAxis = new Vector3(0, 1, 0), zAxis = new Vector3(0, 0, 1);
/** Blob shadow darkness at touch-down and the lift (mm) over which it fades to a fifth. */
const SHADOW_MAX_OPACITY = 0.62;
const SHADOW_FADE_LIFT_MM = 1600;
/** The wet streak behind a wiping cloth, mm (length behind the cloth's rear edge, width). */
const WET_STREAK = { behind: 150, length: 260, width: 200 };
/** A pour keeps flowing this many ticks after it reaches the surface; its film spreads over FILM_GROW_TICKS. */
const POUR_FLOW_TICKS = 12;
const FILM_GROW_TICKS = 14;
/** Sprinkler head and hose nozzle heights above the ground, mm; arc heights of their jets. */
const JET = { sprinklerY: 245, hoseY: 900, sprinklerArc: 900, hoseArc: 250, drops: 150 };
const tmpM = new Matrix4(), tmpV = new Vector3(), tmpS = new Vector3(1, 1, 1), tmpScale = new Vector3(1, 1, 1);

export class HumansRenderer implements SubRenderer {
  readonly name = 'humans';
  readonly group = new Group();
  private mt: HumanMaterials | null = null;
  private pools = new Map<VisualKey, Visual[]>();
  private used = new Map<VisualKey, number>();
  private drops: InstancedMesh | null = null;
  private dropCount = 0;
  /** Flying bits: grass clippings from the deck, sand from a scoop, grit puffed from under a landing sole. */
  private chips: InstancedMesh | null = null;
  private chipCount = 0;
  private sim: Sim | null = null;
  private scene: Scene | null = null;
  private shadowsOn = false;
  private pose: ActorPose = { x: 0, y: 0, z: 0, yaw: 0, lift: 0, u: 0 };
  private live = new WeakMap<ActorKey, number>();
  private counts = { runs: 0, actors: 0, drops: 0 };

  init(ctx: RenderContext): void {
    this.group.name = 'humans';
    this.scene = ctx.scene;
    ctx.scene.add(this.group);
    this.mt = createHumanMaterials();
    this.shadowsOn = ctx.quality.shadows.enabled;
    const drop = new SphereGeometry(1, 8, 6);
    this.drops = new InstancedMesh(drop, this.mt.water, MAX_DROPS);
    this.drops.frustumCulled = false;
    this.drops.count = 0;
    this.group.add(this.drops);
    this.chips = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ roughness: 0.9 }), MAX_CHIPS);
    this.chips.frustumCulled = false;
    this.chips.count = 0;
    this.chips.castShadow = false;
    this.group.add(this.chips);
  }

  onGameStart(sim: Sim): void { this.sim = sim; }
  onGameEnd(): void { this.sim = null; this.hideAll(); }
  setQuality(q: QualityPreset): void { this.shadowsOn = q.shadows.enabled; }

  stats(): Record<string, number> { return { ...this.counts }; }

  private build(key: VisualKey): Visual {
    const mt = this.mt!;
    let root: Group, spin: Mesh[] = [], stream: Mesh | undefined, film: Mesh | undefined, crown: Mesh | undefined, shadowR: number;
    switch (key) {
      case 'shoe': root = buildShoe(mt, GAIT.adult.soleL, GAIT.adult.soleW, false); shadowR = GAIT.adult.soleL * 0.62; break;
      case 'child-shoe': root = buildShoe(mt, GAIT.child.soleL, GAIT.child.soleW, true); shadowR = GAIT.child.soleL * 0.62; break;
      case 'paw': root = buildPaw(mt); shadowR = 45; break;
      case 'mower': { const m = buildMower(mt, MOW_DECK_MM, MOW_WHEEL_D_MM, MOW_WHEEL_W_MM); root = m.group; spin = [...m.wheels, m.blade]; shadowR = MOW_DECK_MM * 0.75; break; }
      case 'broom': root = buildBroom(mt, BROOM_STROKE_W * 1.1, 110); shadowR = BROOM_STROKE_W * 0.7; break;
      case 'nozzle': root = buildNozzle(mt, VACUUM_STRIP_W); shadowR = VACUUM_STRIP_W * 0.6; break;
      case 'cloth': {
        root = buildCloth(mt);
        const wet = buildWetStreak(mt);
        wet.position.set(-WET_STREAK.behind, 0, 0);
        wet.scale.set(WET_STREAK.length, 1, WET_STREAK.width);
        root.add(wet);
        shadowR = 170;
        break;
      }
      case 'crumb': case 'kibble': root = buildCrumb(mt, key === 'kibble'); shadowR = 1.2; break;
      case 'pour': case 'water-pour': { const p = buildPour(mt, key === 'water-pour'); root = p.group; stream = p.stream; film = p.film; crown = p.crown; shadowR = 40; break; }
      case 'jet': root = new Group(); shadowR = 0; break;
      case 'sprinkler': root = buildSprinkler(mt); shadowR = 60; break;
      case 'hose-nozzle': root = buildHoseNozzle(mt); shadowR = 0; break;
      case 'car': { const c = buildCar(mt, CAR_BODY, CAR_TYRE); root = c.group; spin = c.tyres; shadowR = CAR_BODY.hl * 1.05; break; }
      case 'station': root = buildStation(mt); shadowR = 45; break;
      case 'scoop': root = buildScoop(mt); shadowR = 70; break;
      default: root = new Group(); shadowR = 0;
    }
    const shadow = buildShadowQuad(mt);
    shadow.material = mt.shadow.clone(); // own opacity per shadow
    this.group.add(root, shadow);
    return { root, spin, stream, film, crown, shadow, shadowR };
  }

  private take(key: VisualKey): Visual {
    let pool = this.pools.get(key);
    if (!pool) { pool = []; this.pools.set(key, pool); }
    const n = this.used.get(key) ?? 0;
    if (n >= pool.length) pool.push(this.build(key));
    this.used.set(key, n + 1);
    const v = pool[n];
    v.root.visible = true;
    v.shadow.visible = true;
    v.root.traverse((o) => { o.castShadow = this.shadowsOn && (o as Mesh).isMesh && o.castShadow !== false; });
    return v;
  }

  private hideAll(): void {
    for (const pool of this.pools.values()) for (const v of pool) { v.root.visible = false; v.shadow.visible = false; }
    this.used.clear();
    if (this.drops) this.drops.count = 0;
    if (this.chips) this.chips.count = 0;
  }

  /** Live surface height under a key (cached per key; plans store static heights). */
  private groundOf(sim: Sim, k: ActorKey): number {
    let y = this.live.get(k);
    if (y === undefined) { y = surfaceY(sim, k.x, k.z, k.y); this.live.set(k, y); }
    return y;
  }

  update(frame: FrameInfo): void {
    const sim = frame.sim ?? this.sim;
    this.hideAll();
    this.counts.runs = 0; this.counts.actors = 0; this.counts.drops = 0;
    this.dropCount = 0;
    this.chipCount = 0;
    if (!sim || !this.mt) return;
    for (const run of sim.state.env.human.active) {
      const inst = run.inst;
      if (!inst) continue;
      const plan = humanPlan(sim, inst);
      if (!plan) continue;
      this.counts.runs++;
      const t = planTime(sim.state.tick, frame.alpha, inst.startTick);
      for (const actor of plan.actors) this.drawActor(sim, plan, actor, t);
    }
    if (this.drops) { this.drops.count = this.dropCount; this.drops.instanceMatrix.needsUpdate = true; }
    if (this.chips) {
      this.chips.count = this.chipCount;
      this.chips.instanceMatrix.needsUpdate = true;
      if (this.chips.instanceColor) this.chips.instanceColor.needsUpdate = true;
    }
    this.counts.drops = this.dropCount;
  }

  private drawActor(sim: Sim, plan: HumanPlan, a: Actor, t: number): void {
    const machine = a.kind === 'mower' || a.kind === 'nozzle' || a.kind === 'car' || a.kind === 'jet';
    const p = samplePose(a.keys, t, this.pose, machine);
    if (!p) return;
    // live ground under the segment's nearest key
    const k = a.keys[Math.max(0, Math.min(a.keys.length - 1, nearestKey(a.keys, t)))];
    const ground = this.groundOf(sim, k);
    if (a.kind === 'jet') { this.drawJet(sim, plan, a, p, ground, t); return; }
    const key: VisualKey = a.kind === 'pour' && plan.variant === 'water' ? 'water-pour' : a.kind === 'crumb' && plan.variant === 'pet-feed' ? 'kibble' : a.kind;
    const v = this.take(key);
    this.counts.actors++;
    const r = v.root;
    r.position.set(p.x, ground + Math.max(0, p.lift), p.z);
    r.quaternion.setFromAxisAngle(yAxis, -p.yaw);
    r.scale.set(1, 1, 1);
    switch (a.kind) {
      case 'shoe': case 'child-shoe': {
        // heel rises first, the sole rolls off its toe; mirrored for the other foot
        const pitch = Math.min(0.45, Math.max(0, p.lift) / 500);
        tmpQ.setFromAxisAngle(zAxis, pitch);
        r.quaternion.multiply(tmpQ);
        r.scale.set(1, 1, a.side < 0 ? -1 : 1);
        break;
      }
      case 'crumb': { const s = Math.max(0.5, a.scale); r.scale.set(s, s, s); r.rotation.y += a.scale * 3.1; break; }
      case 'mower': case 'car': {
        const roll = (t * (a.kind === 'car' ? 0.9 : 0.5)) % (Math.PI * 2);
        for (let i = 0; i < v.spin.length; i++) {
          const m = v.spin[i];
          if (a.kind === 'mower' && i === v.spin.length - 1) m.rotation.y = t * 4.2;
          else m.rotation.z = -roll;
        }
        break;
      }
      case 'pour': {
        const extent = plan.extent > 0 ? plan.extent / 2 : 30;
        const fall = Math.max(0, p.lift);
        const since = t - a.keys[1].t;
        // the pour lasts a moment after it reaches the surface, its column breaking up from the top
        const flowing = p.lift > 1 ? 1 : Math.max(0, 1 - since / POUR_FLOW_TICKS);
        const thick = Math.min(9, Math.max(3, extent / 10));
        if (v.stream) {
          const top = a.keys[0].lift;
          v.stream.visible = flowing > 0;
          v.stream.scale.set(thick, Math.max(1, top - fall) * flowing, thick);
          v.stream.position.set(0, 0, 0);
        }
        if (v.crown) {
          v.crown.visible = p.lift <= 1 && flowing > 0;
          v.crown.scale.set(thick * 1.4, thick * (0.6 + flowing), thick * 1.4);
        }
        if (v.film) {
          const grow = Math.min(1, Math.max(0, (since + 3) / FILM_GROW_TICKS));
          v.film.visible = grow > 0;
          v.film.scale.set(extent * grow, Math.max(0.6, extent / 40), extent * grow);
          v.film.position.set(0, -fall, 0);
        }
        r.position.y = ground;
        break;
      }
      default: break;
    }
    this.spray(a, p, ground, t);
    // shadow: wide and faint while high, small and dark when it lands
    const lift = Math.max(0, p.lift);
    const sh = v.shadow;
    const rad = v.shadowR * (1 + lift / 700);
    sh.position.set(p.x, ground + 0.4, p.z);
    sh.scale.set(rad, 1, rad * (a.kind === 'shoe' || a.kind === 'child-shoe' || a.kind === 'broom' || a.kind === 'nozzle' || a.kind === 'car' ? 0.55 : 1));
    sh.quaternion.setFromAxisAngle(yAxis, -p.yaw);
    sh.visible = rad > 0.5;
    (sh.material as MeshBasicMaterial).opacity = SHADOW_MAX_OPACITY * Math.max(0.2, 1 - lift / SHADOW_FADE_LIFT_MM);
  }

  /** Flying bits by actor kind: clippings thrown sideways from the deck, grit puffed from under a sole on landing,
   *  sand thrown from a scoop. Deterministic in the plan time (screenshots repeat). */
  private spray(a: Actor, p: ActorPose, ground: number, t: number): void {
    const chips = this.chips;
    if (!chips) return;
    let n = 0, color = CLIP, spread = 0, up = 0, size = 3, side = 0;
    if (a.kind === 'mower') { n = 160; color = CLIP; spread = 900; up = 260; size = 4; side = 1; }
    else if ((a.kind === 'shoe' || a.kind === 'child-shoe') && p.lift <= 0.5) {
      const since = t - landedAt(a.keys, t);
      if (since >= 0 && since < 4) { n = 40; color = DUST; spread = 120 + since * 60; up = 30 + since * 20; size = 1.6; }
    } else if (a.kind === 'scoop' && p.lift < 100) { n = 80; color = SAND; spread = 500; up = 300; size = 2.5; }
    const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
    for (let i = 0; i < n && this.chipCount < MAX_CHIPS; i++) {
      const ph = (hash01(i * 31 + 7) + t * 0.11) % 1;
      const ang = side ? (hash01(i * 11) - 0.5) * 1.2 + Math.PI / 2 : hash01(i * 11) * Math.PI * 2;
      const d = spread * ph * (0.4 + 0.6 * hash01(i * 19 + 2));
      const lx = side ? -0.3 * d : Math.cos(ang) * d, lz = side ? Math.sin(ang) * d * (i % 2 ? 1 : -1) : Math.sin(ang) * d;
      const x = p.x + lx * c - lz * s, z = p.z + lx * s + lz * c;
      const y = ground + 4 + up * 4 * ph * (1 - ph) * (0.5 + hash01(i * 23));
      const l = size * (0.6 + hash01(i * 3)), w = side ? l * 0.25 : l;
      tmpQ.setFromAxisAngle(yAxis, hash01(i * 5) * 6.28);
      tmpM.compose(tmpV.set(x, y, z), tmpQ, tmpS.set(w, l * 0.3, side ? l * 3 : l));
      chips.setMatrixAt(this.chipCount, tmpM);
      chips.setColorAt(this.chipCount++, color);
    }
  }

  /**
   * Water: the sprinkler head on its riser (or the hose nozzle held up), a jet of streaks along an arc from it to
   * the front, each streak drawn along its direction of flight, and the drops raining around the front.
   */
  private drawJet(sim: Sim, plan: HumanPlan, _a: Actor, p: ActorPose, ground: number, t: number): void {
    const inst = this.drops;
    if (!inst) return;
    const src = plan.impacts[0].fp;
    const sprinkler = plan.variant === 'sprinkler';
    const sx = sprinkler ? src.x : p.x - Math.cos(p.yaw) * 700, sz = sprinkler ? src.z : p.z - Math.sin(p.yaw) * 700;
    const headGround = sprinkler ? surfaceY(sim, sx, sz, src.y) : ground;
    const sy = headGround + (sprinkler ? JET.sprinklerY : JET.hoseY);
    const head = this.take(sprinkler ? 'sprinkler' : 'hose-nozzle');
    this.counts.actors++;
    head.root.position.set(sx, sprinkler ? headGround : sy, sz);
    const aim = Math.atan2(p.z - sz, p.x - sx);
    head.root.quaternion.setFromAxisAngle(yAxis, -aim);
    head.shadow.visible = sprinkler;
    head.shadow.position.set(sx, headGround + 0.4, sz);
    head.shadow.scale.set(head.shadowR, 1, head.shadowR);
    (head.shadow.material as MeshBasicMaterial).opacity = SHADOW_MAX_OPACITY * 0.6;
    const arc = sprinkler ? JET.sprinklerArc : JET.hoseArc;
    const dx = p.x - sx, dz = p.z - sz;
    for (let i = 0; i < JET.drops && this.dropCount < MAX_DROPS; i++) {
      const u = ((i / JET.drops) + (t * 0.07)) % 1;
      // the jet frays as it flies: drops spread sideways and grow apart further out
      const fray = (hash01(i * 29 + 1) - 0.5) * u * 160;
      const x = sx + dx * u - Math.sin(aim) * fray, z = sz + dz * u + Math.cos(aim) * fray;
      const y = sy + (ground - sy) * u + Math.sin(u * Math.PI) * arc;
      // direction of flight (derivative of the arc)
      tmpV.set(dx, ground - sy + Math.cos(u * Math.PI) * Math.PI * arc, dz).normalize();
      tmpQ.setFromUnitVectors(yAxis, tmpV);
      const r = (u < 0.15 ? 3 : 1.6 + 1.6 * hash01(i * 7 + 3));
      tmpM.compose(tmpS.set(x, y, z), tmpQ, tmpScale.set(r, r * (u < 0.15 ? 9 : 5), r));
      inst.setMatrixAt(this.dropCount++, tmpM);
    }
    // the rain of drops landing around the front
    const spread = plan.variant === 'can' ? plan.extent : 350;
    for (let i = 0; i < 90 && this.dropCount < MAX_DROPS; i++) {
      const ang = hash01(i * 13 + 1) * Math.PI * 2, d = Math.sqrt(hash01(i * 17 + 5)) * spread;
      const fallU = (hash01(i * 3 + 11) + t * 0.13) % 1;
      const x = p.x + Math.cos(ang) * d, z = p.z + Math.sin(ang) * d;
      const y = ground + (1 - fallU) * (plan.variant === 'can' ? 350 : 500);
      const r = 1.5 + 2.5 * hash01(i * 5 + 2);
      tmpM.compose(tmpS.set(x, y, z), tmpQ.identity(), tmpScale.set(r, r * 3, r));
      inst.setMatrixAt(this.dropCount++, tmpM);
    }
  }

  dispose(): void {
    this.hideAll();
    for (const pool of this.pools.values()) for (const v of pool) (v.shadow.material as MeshBasicMaterial).dispose();
    (this.chips?.material as MeshStandardMaterial | undefined)?.dispose();
    this.group.traverse((o) => { if ((o as Mesh).isMesh) (o as Mesh).geometry.dispose(); });
    this.scene?.remove(this.group);
    if (this.mt) disposeHumanMaterials(this.mt);
    this.mt = null;
    this.pools.clear();
  }
}

/** Tick of the last landing key (lift 0 after a lifted key) at or before t. */
function landedAt(keys: readonly ActorKey[], t: number): number {
  let at = -Infinity;
  for (let i = 1; i < keys.length && keys[i].t <= t; i++) if (keys[i].lift <= 0 && keys[i - 1].lift > 0) at = keys[i].t;
  return at;
}

function nearestKey(keys: readonly ActorKey[], t: number): number {
  let best = 0, bd = Infinity;
  for (let i = 0; i < keys.length; i++) { const d = Math.abs(keys[i].t - t); if (d < bd) { bd = d; best = i; } }
  return best;
}

function hash01(i: number): number {
  const h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return (Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0) / 4294967296;
}

