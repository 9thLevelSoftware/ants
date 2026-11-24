// Probe (winter-sugar A3): the unplug stand point against the plug of a hand-over snapshot.
//   node tools/sim/run-ts.mjs tools/sim/probe/standProbe.ts <snapshot.bin>
import { restore } from '@/sim/save';
import { createSim } from '@/sim/sim';
import { generateWorld } from '@/worldgen';
import { nestRuntime } from '@/sim/nest/runtime';
import { VoxelFlag } from '@/sim/types';
import { UNPLUG_STAND_BU } from '@/sim/balance/nestwork';
declare const process: { stdout: { write(s: string): void } };

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const { state } = restore(new Uint8Array(fs.readFileSync(args[0])));
  const sim = createSim(state, generateWorld(state.config.world));
  const out = (s: string) => process.stdout.write(s + '\n');
  const n = sim.state.nests.find((x) => x.colony === sim.state.player.colonyId)!;
  const bu = sim.world.bu, v = sim.carve.voxel, flags = nestRuntime(sim).flags;
  for (const e of n.entrances) {
    out(`entrance ${e.id} ${e.status} plug ${e.plugVoxelCount} pos ${[e.pos.x, e.pos.y, e.pos.z].map((x) => x.toFixed(1))} dir ${[e.dir.x, e.dir.y, e.dir.z].map((x) => x.toFixed(2))} radius ${(e.radius / bu).toFixed(2)} BU`);
    const R = e.radius + 3 * bu;
    let sMin = Infinity, sMax = -Infinity, cnt = 0;
    const rows = new Map<number, string>();
    for (let k = Math.floor((e.pos.z - R) / v); k <= Math.ceil((e.pos.z + R) / v); k++)
      for (let j = Math.floor((e.pos.y - R) / v); j <= Math.ceil((e.pos.y + R) / v); j++)
        for (let i = Math.floor((e.pos.x - R) / v); i <= Math.ceil((e.pos.x + R) / v); i++) {
          const dx = i * v - e.pos.x, dy = j * v - e.pos.y, dz = k * v - e.pos.z;
          if (dx * dx + dy * dy + dz * dz > R * R) continue;
          if ((flags.get(i, j, k) & VoxelFlag.PLUG) === 0 || sim.carve.sampleAt(i, j, k) >= 128) continue;
          const s = (dx * e.dir.x + dy * e.dir.y + dz * e.dir.z) / bu;
          sMin = Math.min(sMin, s); sMax = Math.max(sMax, s); cnt++;
        }
    out(`  closed plug samples ${cnt}, axial extent ${sMin.toFixed(2)} .. ${sMax.toFixed(2)} BU (0 = opening, + out)`);
    for (let s = 1; s >= -8; s -= 0.5) {
      const p = { x: e.pos.x + e.dir.x * s * bu, y: e.pos.y + e.dir.y * s * bu, z: e.pos.z + e.dir.z * s * bu };
      rows.set(s, `  axis ${s.toFixed(1)} BU: f ${(sim.field.sample(p) / bu).toFixed(2)} BU cavity ${(sim.field.cavity(p) / bu).toFixed(2)}`);
      out(rows.get(s)!);
    }
    out(`  old stand point at -${((e.radius + UNPLUG_STAND_BU * bu) / bu).toFixed(2)} BU`);
  }
}
