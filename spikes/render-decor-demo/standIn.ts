/**
 * A 4 mm stand-in worker for framing (the real ant renderer is another module) and the foot-height marker: six
 * bright foot beads exactly on the walker's surface point, where the ant renderer puts the feet (walker position
 * minus the foot offset). If draped decor rose above foot height the beads would sink into it.
 */
import { CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from 'three';

const cuticle = new MeshStandardMaterial({ color: 0x1b120c, roughness: 0.38, metalness: 0 });
const bead = new MeshStandardMaterial({ color: 0xff5a10, emissive: 0x401000, roughness: 0.4 });

export function makeStandIn(): Group {
  const g = new Group();
  g.name = 'standIn';
  const sph = new SphereGeometry(1, 16, 12);
  const part = (x: number, y: number, sx: number, sy: number, sz: number) => {
    const m = new Mesh(sph, cuticle);
    m.position.set(x, y, 0); m.scale.set(sx, sy, sz); m.castShadow = true;
    g.add(m);
  };
  // body along +x (head forward), heights above the surface point, mm
  part(-1.35, 0.95, 0.95, 0.75, 0.75); // gaster
  part(-0.35, 0.8, 0.22, 0.3, 0.2); // petiole
  part(0.35, 0.85, 0.6, 0.38, 0.33); // mesosoma
  part(1.25, 0.95, 0.48, 0.42, 0.45); // head
  const leg = new CylinderGeometry(0.06, 0.05, 1, 6);
  const foot = new SphereGeometry(0.13, 10, 8);
  for (const [ax, fz] of [[0.6, 1], [0.25, 1], [-0.1, 1], [0.6, -1], [0.25, -1], [-0.1, -1]] as const) {
    const hip = new Vector3(ax, 0.75, 0.2 * fz), toe = new Vector3(ax * 2.2 - 0.3, 0, 1.55 * fz);
    const m = new Mesh(leg, cuticle);
    m.position.copy(hip).add(toe).multiplyScalar(0.5);
    m.scale.y = hip.distanceTo(toe);
    m.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), toe.clone().sub(hip).normalize());
    m.castShadow = true;
    g.add(m);
    const b = new Mesh(foot, bead);
    b.position.set(toe.x, 0.13, toe.z); // bead resting on the surface point
    g.add(b);
  }
  return g;
}
