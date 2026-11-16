/**
 * Herd density layer (GDD 05 §1.4: "up to 200 instances; above that, density texture"): the aphids of a herd beyond
 * the instanced cap are drawn as small textured quads lying on the plant surface, one soft aphid-shaped spot each
 * (2 triangles), tinted with the herd's colour, all herds in one draw call. No shadows.
 */
import {
  Color, DataTexture, DoubleSide, InstancedMesh, Matrix4, MeshStandardMaterial, PlaneGeometry, RGBAFormat, type Group,
} from 'three';

const W = 32, H = 16;

/** Alpha mask of one aphid seen from above: an egg-shaped body, a little narrower toward the head (+v). */
function spotTexture(): DataTexture {
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = (x + 0.5) / W * 2 - 1, v = (y + 0.5) / H * 2 - 1;
    const half = 0.62 + 0.38 * (1 - Math.max(0, u)) * 0.8; // tapered toward +u (the head)
    const e = Math.hypot(u, v / half);
    const a = Math.max(0, Math.min(1, (1 - e) * 6));
    const shade = Math.round(255 * (0.6 + 0.3 * (1 - e))); // a little darker than the lit instances: no self-shading
    const i = (y * W + x) * 4;
    data[i] = shade; data[i + 1] = shade; data[i + 2] = shade; data[i + 3] = Math.round(a * 255);
  }
  const t = new DataTexture(data, W, H, RGBAFormat);
  t.needsUpdate = true;
  return t;
}

export class HerdDecals {
  private mesh!: InstancedMesh;
  private readonly geometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2); // in XZ, facing +Y; long side along X
  private readonly material: MeshStandardMaterial;
  private readonly tex = spotTexture();
  private cap = 0;
  private readonly color = new Color();
  n = 0;

  constructor(private readonly parent: Group) {
    // grey shading in the map's colour (a darker rim), the spot's outline in its alpha (alphaTest cuts it out)
    this.material = new MeshStandardMaterial({ map: this.tex, alphaTest: 0.5, roughness: 0.55, metalness: 0, side: DoubleSide });
    this.alloc(256);
  }

  private alloc(cap: number): void {
    const old = this.mesh;
    const mesh = new InstancedMesh(this.geometry, this.material, cap);
    mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true; mesh.count = 0; mesh.visible = false;
    mesh.name = 'herd-density';
    mesh.setColorAt(0, this.color.setRGB(1, 1, 1));
    if (old) {
      (mesh.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array as Float32Array);
      (mesh.instanceColor!.array as Float32Array).set(old.instanceColor!.array as Float32Array);
      this.parent.remove(old); old.dispose();
    }
    this.parent.add(mesh);
    this.mesh = mesh; this.cap = cap;
  }

  begin(): void { this.n = 0; }

  /** One spot: frame columns (left, up, fwd) unit, position, length mm, colour (linear rgb). */
  add(m: Matrix4, rgb: readonly number[]): void {
    if (this.n >= this.cap) this.alloc(this.cap * 2);
    this.mesh.setMatrixAt(this.n, m);
    this.mesh.setColorAt(this.n, this.color.setRGB(rgb[0]!, rgb[1]!, rgb[2]!));
    this.n++;
  }

  commit(): void {
    const m = this.mesh;
    m.count = this.n; m.visible = this.n > 0;
    if (this.n === 0) return;
    m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, this.n * 16); m.instanceMatrix.needsUpdate = true;
    const c = m.instanceColor!;
    c.clearUpdateRanges(); c.addUpdateRange(0, this.n * 3); c.needsUpdate = true;
  }

  get triangles(): number { return this.n * 2; }

  dispose(): void {
    this.parent.remove(this.mesh); this.mesh.dispose();
    this.geometry.dispose(); this.material.dispose(); this.tex.dispose();
  }
}
