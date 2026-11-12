// Four hyaline wings folded flat over the gaster (alates). uv = (span 0..1 from the base, chord 0 trailing .. 1
// leading); venation is drawn in the wing fragment shader. Separate geometry because wings are blended.
import { MeshBuilder, type V3, add, cross, lin, norm, scl } from './meshBuilder';
import type { Assembly } from './context';
import type { GasterInfo } from './gaster';
import { PART } from './rig';

export function buildWings(A: Assembly, g: GasterInfo): MeshBuilder {
  const { p, BL, mesoAt, zF, zB } = A;
  const w = new MeshBuilder(); w.color = lin(p.colors.wingMembrane);
  const S = p.wingLength * BL;
  const specs = [
    { s: 0.42, span: S, chord: 0.3, fore: 1, lift: 0.03 },
    { s: 0.62, span: S * 0.72, chord: 0.24, fore: 0, lift: 0.012 },
  ];
  for (const sp of specs) {
    const m = mesoAt(sp.s);
    const left = new MeshBuilder(); left.color = w.color; left.rigV = [PART.WING, 1, sp.fore, 0];
    const base: V3 = [m.a * 0.7, m.top - 0.01 * BL + sp.lift * BL, zF + (zB - zF) * sp.s];
    // span runs backward, slightly toward the midline; the costa (leading edge) faces outward
    const spanDir = norm([-0.05, -0.08, -1]); const chordDir = norm([1, 0.1, -0.05]); const nrm = norm(cross(spanDir, chordDir));
    const N = 18; const top: number[] = [], bot: number[] = [], top2: number[] = [], bot2: number[] = [];
    const C = sp.chord * sp.span;
    for (let i = 0; i <= N; i++) {
      const u = i / N; const x = u * sp.span;
      const wdt = C * Math.pow(Math.sin(Math.min(1, u * 1.05) * Math.PI * 0.5 + 0.05), 0.8) * Math.sqrt(Math.max(0, 1 - Math.pow(u, 6)));
      const lead = wdt * 0.38, trail = -wdt * 0.62;
      const centre = add(add(base, scl(spanDir, x)), [0, -0.06 * BL * u * u, 0]);
      // lie on top of the gaster (queens have a tall gaster), forewing above the hindwing
      const zr = (centre[2] - g.gC[2]) / (g.GL / 2);
      const gTop = g.gC[1] + g.gb * Math.sqrt(Math.max(0, 1 - zr * zr)) * 1.02;
      centre[1] = Math.max(centre[1], gTop + (sp.fore ? 0.03 : 0.016) * BL);
      const off = (sp.fore ? -0.25 : -0.05) * C;
      const pl = add(centre, scl(chordDir, lead + off)); const pt = add(centre, scl(chordDir, trail + off));
      top.push(left.vert(pl, nrm, [u, 1])); bot.push(left.vert(pt, nrm, [u, 0]));
      top2.push(left.vert(pl, scl(nrm, -1), [u, 1])); bot2.push(left.vert(pt, scl(nrm, -1), [u, 0]));
    }
    for (let i = 0; i < N; i++) {
      left.tri(bot[i]!, bot[i + 1]!, top[i]!); left.tri(top[i]!, bot[i + 1]!, top[i + 1]!);
      left.tri(bot2[i]!, top2[i]!, bot2[i + 1]!); left.tri(top2[i]!, top2[i + 1]!, bot2[i + 1]!);
    }
    w.append(left);
    w.append(left.mirrored(0, (r) => [r[0]!, -1, r[2]!, r[3]!]));
  }
  return w;
}
