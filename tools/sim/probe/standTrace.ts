// Probe (winter-sugar, A3 release defect): every worker in dig.unplug after a cached hand-over, tick by tick until the
// entrance opens - her position along / across the throat axis, the stand point unplugStandPoint gives her from there,
// her walk's status and fail reason, and the moment she is barred (bb bn.uu). Axial s: + out of the nest, 0 = opening.
//   node tools/sim/run-ts.mjs tools/sim/probe/standTrace.ts <snapshot.bin> [ticks=1500]
import { restore } from '@/sim/save';
import { createSim } from '@/sim/sim';
import { generateWorld } from '@/worldgen';
import { entranceToUnplug, unplugStandPoint } from '@/sim/nest';
import { SEAL_THROAT_BU } from '@/sim/balance/actions';
import { SLOT_STALL_ACCEPT_BU } from '@/sim/balance/nestwork';
import type { Vec3 } from '@/core/math/vec3';
import type { Entrance } from '@/sim/types';
declare const process: { stdout: { write(s: string): void } };

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const { state } = restore(new Uint8Array(fs.readFileSync(args[0])));
  const sim = createSim(state, generateWorld(state.config.world));
  const out = (s: string) => process.stdout.write(s + '\n');
  const col = sim.state.player.colonyId, t0 = sim.state.tick, ticks = Number(args[1] ?? 1500), bu = sim.world.bu;
  const nest = sim.state.nests.find((x) => x.colony === col)!;
  const ax = (e: Entrance, p: Vec3) => {
    const dx = p.x - e.pos.x, dy = p.y - e.pos.y, dz = p.z - e.pos.z;
    const s = dx * e.dir.x + dy * e.dir.y + dz * e.dir.z;
    const r = Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - s * s));
    return `s ${(s / bu).toFixed(2)} r ${(r / bu).toFixed(2)} f ${(sim.field.sample(p) / bu).toFixed(2)}`;
  };
  const e0 = nest.entrances[0];
  out(`entrance ${e0.id} ${e0.status} radius ${(e0.radius / bu).toFixed(2)} BU dir ${[e0.dir.x, e0.dir.y, e0.dir.z].map((x) => x.toFixed(2))} plug ${e0.plugVoxelCount}`);
  const last = new Map<number, string>();
  const stand: Vec3 = { x: 0, y: 0, z: 0 };
  for (let t = 1; t <= ticks; t++) {
    sim.tick();
    const rel = sim.state.tick - t0;
    const e = entranceToUnplug(sim, nest.id);
    if (!e) { out(`+${rel} nothing to unplug (status ${nest.entrances.map((x) => x.status).join(',')})`); break; }
    for (const a of sim.state.ants) {
      if (!a.alive || a.colony !== col || a.state !== 'dig.unplug') continue;
      const reach = SEAL_THROAT_BU * bu + e.radius - SLOT_STALL_ACCEPT_BU * bu;
      const ok = unplugStandPoint(sim, e, a.pos, reach, stand);
      const barred = (a.bb['bn.uu'] ?? 0) > sim.state.tick;
      const line = `nav ${a.nav.status}${a.nav.failReason ? '/' + a.nav.failReason : ''} act ${a.action?.id ?? '-'}${barred ? ' BARRED' : ''}`;
      if (last.get(a.id) !== line || rel % 25 === 0) {
        out(`+${rel} ant ${a.id} at ${ax(e, a.pos)} | stand ${ok ? ax(e, stand) + ` d ${(Math.hypot(stand.x - a.pos.x, stand.y - a.pos.y, stand.z - a.pos.z) / bu).toFixed(2)}` : 'none'} | nav dest ${ax(e, a.nav.dest)} | ${line}`);
        last.set(a.id, line);
      }
    }
  }
}
