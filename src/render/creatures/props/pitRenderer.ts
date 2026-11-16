/**
 * Antlion pits (GDD 05 §2.2b / §2.4: "pit visible as a smooth cone", loose sand on the rim): one cone mesh per pit
 * hazard, drawn through the unbroken ground with the pit depth rule (shader/pitDepth.ts). A pit whose antlion is
 * gone (state `collapsed`) fills in over ANTLION_EMPTY_PIT_FILL_GD.
 *
 * Sunk pits: where the world's ground height at the pit centre is already lowered by at least half the pit depth (the
 * sim registered the pit as a height overlay, pitProfile.ts), walkers stand on the real slope, so the cone is drawn
 * at its real depth (a hair above the ground) without the depth rule, and ants in the pit are not hidden by it.
 */
import { Frustum, Group, Mesh, Sphere, Vector3, type BufferGeometry, type Material, type Uniform } from 'three';
import { ANTLION_EMPTY_PIT_FILL_GD } from '@/sim/balance/creatures';
import { TICKS_PER_DAY } from '@/sim/time';
import { pitGeometry } from '../geometry/props';
import { makePitMaterial } from '../shader/materials';
import type { HazardView, WorldLookup } from '../simAdapter';
import { PIT_DEPTH, PIT_LOOK } from '../tuning';

interface PitSlot { mesh: Mesh; material: Material; uniforms: { uPitC: Uniform<Vector3>; uPitR: Uniform<number> } }

/** Effective depth of a pit now (mm): full while occupied, filling in once collapsed. */
export function pitDepthNow(h: HazardView, tick: number): number {
  if (h.state !== 'collapsed') return h.depth;
  if (h.untilTick === undefined) return h.depth * 0.3;
  const fill = ANTLION_EMPTY_PIT_FILL_GD * TICKS_PER_DAY;
  return h.depth * Math.min(1, Math.max(0, (h.untilTick - tick) / fill));
}

/** Whether the ground under a pit already follows it (lowered by at least half its depth at the centre). */
export function pitIsSunk(h: HazardView, depth: number, groundAtCentre: number): boolean {
  return depth > 0 && groundAtCentre <= h.pos.y - depth * 0.5;
}

export class PitRenderer {
  readonly group = new Group();
  private geo: BufferGeometry = pitGeometry();
  private slots: PitSlot[] = [];
  private sph = new Sphere();
  private sunk = new Set<number>();
  drawn = 0;

  constructor() { this.group.name = 'creatures:pits'; }

  private slot(i: number): PitSlot {
    let s = this.slots[i];
    if (!s) {
      const { material, uniforms } = makePitMaterial();
      const mesh = new Mesh(this.geo, material);
      mesh.renderOrder = 2; mesh.receiveShadow = false; mesh.castShadow = false; mesh.frustumCulled = false; mesh.name = 'antlion-pit';
      this.group.add(mesh);
      s = { mesh, material, uniforms };
      this.slots[i] = s;
    }
    return s;
  }

  /** Whether pit `id` was drawn as sunk (real depths) in the last update. */
  isSunk(id: number): boolean { return this.sunk.has(id); }

  /** Draws every visible pit; `lookup` gives the ground height (null: assume the flat sim ground). */
  update(hazards: readonly HazardView[], tick: number, frustum: Frustum, lookup: WorldLookup | null): void {
    let n = 0;
    this.sunk.clear();
    for (const h of hazards) {
      if (h.kind !== 'antlion-pit') continue;
      const depth = pitDepthNow(h, tick);
      const ground = lookup ? lookup.height(h.pos.x, h.pos.z, h.pos.y) : h.pos.y;
      const sunk = pitIsSunk(h, depth, ground);
      if (sunk) this.sunk.add(h.id);
      if (depth < 0.2 || h.radius <= 0) continue;
      this.sph.center.set(h.pos.x, h.pos.y, h.pos.z); this.sph.radius = h.radius * (1 + PIT_LOOK.lipFraction) + depth;
      if (!frustum.intersectsSphere(this.sph)) continue;
      const s = this.slot(n++);
      s.mesh.visible = true;
      s.mesh.position.set(h.pos.x, h.pos.y + (sunk ? PIT_LOOK.sunkLiftMm : 0), h.pos.z);
      s.mesh.scale.set(h.radius, depth, h.radius);
      s.uniforms.uPitC.value.set(h.pos.x, h.pos.y + PIT_DEPTH.liftMm, h.pos.z);
      // radius 0 switches the depth rule off (shader/pitDepth.ts)
      s.uniforms.uPitR.value = sunk ? 0 : h.radius;
    }
    for (let i = n; i < this.slots.length; i++) this.slots[i]!.mesh.visible = false;
    this.drawn = n;
  }

  dispose(): void {
    for (const s of this.slots) s.material.dispose();
    this.geo.dispose();
    this.group.removeFromParent();
  }
}
