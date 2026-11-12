// A growable InstancedMesh with per-instance colour: write instances each frame with set(), then commit().
// Capacity doubles when exceeded (the mesh is recreated, which is rare).
import { Color, InstancedMesh, Matrix4, type BufferGeometry, type Group, type Material } from 'three';

const _c = new Color();

export class InstancePool {
  mesh: InstancedMesh;
  private n = 0;

  constructor(private readonly parent: Group, private readonly geometry: BufferGeometry, private readonly material: Material,
    private capacity = 64, private readonly name = 'instances') {
    this.mesh = this.make(capacity);
  }

  private make(cap: number): InstancedMesh {
    const m = new InstancedMesh(this.geometry, this.material, cap);
    m.name = this.name;
    m.count = 0;
    m.frustumCulled = false; // instances span the world; bounds would need recomputing every frame
    m.setColorAt(0, _c.setHex(0xffffff));
    this.parent.add(m);
    return m;
  }

  begin(): void {
    this.n = 0;
  }

  set(matrix: Matrix4, colorHex: number): void {
    if (this.n >= this.capacity) {
      const old = this.mesh;
      this.capacity *= 2;
      this.mesh = this.make(this.capacity);
      for (let i = 0; i < this.n; i++) {
        old.getMatrixAt(i, _tmp);
        this.mesh.setMatrixAt(i, _tmp);
        old.getColorAt(i, _c);
        this.mesh.setColorAt(i, _c);
      }
      this.parent.remove(old);
      old.dispose();
    }
    this.mesh.setMatrixAt(this.n, matrix);
    this.mesh.setColorAt(this.n, _c.setHex(colorHex));
    this.n++;
  }

  commit(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  get count(): number {
    return this.n;
  }

  dispose(): void {
    this.parent.remove(this.mesh);
    this.mesh.dispose();
  }
}

const _tmp = new Matrix4();
