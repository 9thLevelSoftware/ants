// Probe (round 6, deleted at the end of the round): live vs restored field overlays after a snapshot.
// node tools/sim/run-ts.mjs tools/sim/probe/probe-restore6.ts ARCH SEED TICKS CACHE_DIR
import fs from 'node:fs';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { defaultGameConfig } from '@/sim/createGame';
import { generateWorld } from '@/worldgen';
import { restore, snapshot, stateHash } from '@/sim/save';
import type { Sim } from '@/sim/types';

type Ov = { id: number; x0: number; z0: number; cell: number; nx: number; nz: number; h: Float32Array };
const ovs = (s: Sim): Ov[] => (s.field as unknown as { overlays: Ov[] }).overlays;

function compare(a: Sim, b: Sim, label: string): void {
  const A = ovs(a), B = ovs(b);
  console.log(`${label}: overlays live ${A.length} restored ${B.length}`);
  const ids = new Set([...A.map((o) => o.id), ...B.map((o) => o.id)]);
  for (const id of ids) {
    const oa = A.find((o) => o.id === id), ob = B.find((o) => o.id === id);
    if (!oa || !ob) { console.log(`  overlay ${id}: only in ${oa ? 'live' : 'restored'}`); continue; }
    let diff = 0, maxD = 0, at = -1;
    for (let i = 0; i < oa.h.length; i++) { const d = Math.abs(oa.h[i] - ob.h[i]); if (d > 0) { diff++; if (d > maxD) { maxD = d; at = i; } } }
    const geo = oa.x0 !== ob.x0 || oa.z0 !== ob.z0 || oa.cell !== ob.cell || oa.nx !== ob.nx;
    const m = a.state.worldDelta.mounds.find((x) => x.id === id);
    const sameArr = m ? m.h === oa.h : null;
    let stateDiff = 0;
    if (m) for (let i = 0; i < m.h.length; i++) if (m.h[i] !== oa.h[i]) stateDiff++;
    if (diff || geo || stateDiff) console.log(`  overlay ${id}: cells differing ${diff} (max ${maxD.toFixed(3)} mm at ${at}) geo ${geo} live-overlay-is-state-array ${sameArr} live overlay vs state cells ${stateDiff}`);
  }
}

export default function main(args: string[]): void {
  const [arch, seedS, ticksS, cache, splitsS] = args;
  const seed = Number(seedS), ticks = Number(ticksS), splits = Number(splitsS ?? 1);
  const base = defaultGameConfig('lasius-niger', seed, 'naturalist');
  const config = { ...base, cheats: true, world: { ...base.world, archetype: arch as never } };
  const world = generateWorld(config.world);
  const bytes = fs.readFileSync(`${cache}/founded-lasius-niger-${arch}-${seed}-naturalist-d-any.bin`);
  const a = createSim(restore(new Uint8Array(bytes)).state, world, { systems: SYSTEMS });
  for (let k = 0; k < splits; k++) {
    for (let t = 0; t < ticks; t++) a.tick();
    const snap = snapshot(a);
    const split = a.state.tick;
    const b = createSim(restore(snap).state, world, { systems: SYSTEMS });
    const live = snapshot(a); // continue a copy of the live run, so the live run itself goes on unchanged
    const a2 = a;
    let differs = -1;
    const ovLive = ovs(a2).length, ovRest = ovs(b).length;
    // compare a copy: step a scratch restore of the live sim? No: step the live sim itself for 20 ticks, then rewind
    const keep = createSim(restore(live).state, world, { systems: SYSTEMS }); void keep;
    for (let t = 1; t <= 20; t++) {
      a2.tick(); b.tick();
      if (stateHash(a2.state) !== stateHash(b.state)) { differs = t; break; }
    }
    console.log(`split at tick ${split}: overlays at split live ${ovLive} restored ${ovRest}; state hash ${differs < 0 ? 'equal for 20 ticks' : `differs after ${differs} ticks`}`);
    if (differs >= 0) compare(a2, b, '  at divergence');
  }
}
