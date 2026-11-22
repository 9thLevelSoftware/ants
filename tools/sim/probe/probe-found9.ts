// Round 9 probe (temporary; direction 20.1): the founding a first-time player gets, without a browser. A new game on
// ARCHETYPE / SEED; the queen digs where she stands (sweepKit playerCase: the browser player's dig) and seals with E;
// then, as tests/e2e/firstplay.mjs: she walks on down the shaft (3-tick steps along her heading until 8 BU deep, at
// most 40), lays 4 batches (lay-egg held 50 ticks), and the lapse starts ("Tend the brood"). A relay clutch is laid
// the same way. Logs every brood death (cause, stage, chamber, depth, where it lies against the cell) and the end.
//   node tools/sim/run-ts.mjs tools/sim/probe/probe-found9.ts ARCHETYPE SEED
import type { ArchetypeId, Sim } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';
import { assessSite } from '@/sim/colony/founding/siteAssess';
import { generatedWorld, playerCase, sweepSim } from '@/sim/colony/founding/sweepKit';
import { nestOf, phase, queen, stepUntil } from '@/sim/colony/founding/testkit';
import { digSpeedAt } from '@/sim/nest';

/** tests/e2e/lib/firstplay-steps.mjs findSite, in Node (the same queries the debug API answers). */
function findSite(sim: Sim, o: { x: number; z: number }, fromBu: number, toBu: number, stepBu: number): { x: number; y: number; z: number; rBu: number } | null {
  const bu = sim.world.bu, tan = Math.tan((55 * Math.PI) / 180);
  const ground = (x: number, z: number) => sim.field.height(x, z);
  const dig = (x: number, y: number, z: number, pad: number) => { const p = { x, y, z }; return { prim: sim.field.primAt(p, pad), speed: digSpeedAt(sim, sim.species.id, p) }; };
  const clearAbove = (x: number, z: number, gy: number) => [0.3, 1, 2].every((hh) => dig(x, gy + hh * bu, z, bu).prim === null);
  for (let r = fromBu; r <= toBu; r += stepBu) {
    const n = Math.max(1, Math.round((2 * Math.PI * r) / stepBu));
    for (let i = 0; i < n; i++) {
      const ph = (i / n) * 2 * Math.PI, sx = o.x + Math.cos(ph) * r * bu, sz = o.z + Math.sin(ph) * r * bu, sy = ground(sx, sz);
      if (!clearAbove(sx, sz, sy) || dig(sx, sy - 2 * bu, sz, bu).speed < 0.5) continue;
      for (let a = 0; a < 16; a++) {
        const th = (a / 16) * 2 * Math.PI, hx = Math.cos(th), hz = Math.sin(th);
        let ok = true;
        for (let u = -3; u <= 9 && ok; u += 0.5) {
          const x = sx + hx * u * bu, z = sz + hz * u * bu, gy = ground(x, z);
          if (!clearAbove(x, z, gy)) ok = false;
          if (u >= 0 && ok) {
            const d = dig(x, gy - (u * tan + 1) * bu, z, 3 * bu);
            if (d.speed < 0.5 || d.prim !== null) ok = false;
            const deep = dig(x, gy - 11 * bu, z, 3 * bu);
            if (deep.speed < 0.5 || deep.prim !== null) ok = false;
          }
        }
        if (ok) return { x: sx, y: sy, z: sz, rBu: r };
      }
    }
  }
  return null;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

function layLikeFirstplay(sim: Sim): void {
  for (let b = 0; b < 4 && phase(sim) === 'lay'; b++) {
    sim.enqueue({ type: 'action', actionId: 'lay-egg', phase: 'start' });
    stepUntil(sim, () => false, 50);
    sim.enqueue({ type: 'action', actionId: 'lay-egg', phase: 'stop' });
    stepUntil(sim, () => false, 5);
  }
}

export default async function main(args: string[]): Promise<void> {
  const [arch, seedS, siteKind = 'start', waitS = '0'] = args;
  const { world, config } = generatedWorld(arch as ArchetypeId, Number(seedS));
  const sim = sweepSim(world, config);
  const bu = sim.world.bu, q = queen(sim);
  // every 300 ticks from the start: phase, rain, the founding nest's water and its cell's flooded share
  const timeline: string[] = [];
  const tick0 = sim.tick.bind(sim);
  (sim as unknown as { tick: () => void }).tick = () => {
    tick0();
    if (sim.state.tick % 300 !== 0) return;
    const n = sim.state.nests.find((x) => x.alive && x.colony === q.colony && x.founding);
    const fc = n?.chambers.find((c) => c.type === 'founding');
    const fl = (n as unknown as { flood?: { water: number } } | undefined)?.flood;
    timeline.push(`${sim.state.tick} ${phase(sim)} rain ${r2(sim.state.env.weather.rainRateMmH)} water ${r2(fl?.water ?? -1)} cell ${fc ? r2(fc.flooded) : '-'} ents ${n ? n.entrances.map((e) => e.status).join('/') : '-'}`);
  };
  stepUntil(sim, () => false, Number(waitS));
  const site = siteKind === 'browser' ? findSite(sim, q.pos, 2, 120, 1) : null;
  const read = assessSite(sim, site ?? { ...q.pos });
  console.log(JSON.stringify({ site: site ? { rBu: site.rBu, x: r2(site.x / bu), z: r2(site.z / bu) } : 'start' }));
  const seal = playerCase(sim, site, true);
  const nest = nestOf(sim);
  const cell = nest.chambers.find((c) => c.type === 'founding') ?? nest.chambers[0];
  const depth = (p: { x: number; y: number; z: number }) => r2((sim.field.height(p.x, p.z) - p.y) / bu);
  console.log(JSON.stringify({ arch, seed: Number(seedS), reading: { q: r2(read.q), word: read.word }, seal: { ok: seal.ok, phase: seal.phase, note: seal.note, template: seal.template },
    cell: cell ? { id: cell.id, depthBu: depth(cell.center), radii: [r2(cell.radii.x / bu), r2(cell.radii.y / bu), r2(cell.radii.z / bu)] } : null, queen: { depthBu: depth(q.pos), ch: q.chamberId } }));
  { const c = cell as unknown as { flooded?: number } | undefined; const fl = (nestOf(sim) as unknown as { flood?: { w?: number } }).flood;
    console.log(JSON.stringify({ atSeal: { tick: sim.state.tick, flooded: r2(c?.flooded ?? -1), nestFlood: fl ?? null } })); }
  if (phase(sim) !== 'lay') { console.log(JSON.stringify({ end: phase(sim) })); return; }
  const colId = q.colony;
  const where = new Map<number, Record<string, unknown>>();
  const note = () => {
    for (const b of sim.state.brood) {
      if (!b.alive || b.colony !== colId) continue;
      const dc = cell ? r2(Math.hypot(b.pos.x - cell.center.x, b.pos.y - cell.center.y, b.pos.z - cell.center.z) / bu) : -1;
      where.set(b.id, { ch: b.chamberId, depthBu: depth(b.pos), fromCellBu: dc });
    }
  };
  const deaths: Record<string, unknown>[] = [];
  sim.events.on('brood-died', (e) => {
    if (e.colonyId !== colId) return;
    deaths.push({ t: sim.state.tick, cause: e.cause, stage: e.stage, ...where.get(e.broodId), lapseP: sim.state.player.timelapse ? r2(sim.state.player.timelapse.progress) : null });
  });
  let laid = 0;
  sim.events.on('egg-laid', () => laid++);
  // down the shaft as the script does (its heading: the queen's facing)
  const h = Math.hypot(q.fwd.x, q.fwd.z) || 1, H = { x: q.fwd.x / h, y: 0, z: q.fwd.z / h };
  const intent = sim.state.player.intent;
  for (let i = 0; i < 40 && depth(q.pos) < 8; i++) { intent.dir.x = H.x; intent.dir.z = H.z; stepUntil(sim, () => false, 3); }
  intent.dir.x = 0; intent.dir.z = 0;
  const t = sim.state.env.time as unknown as Record<string, unknown>;
  console.log(JSON.stringify({ layAt: { depthBu: depth(q.pos), ch: q.chamberId, tick: sim.state.tick, time: t } }));
  const floodLog: Record<string, unknown>[] = [];
  const mo = sim.state.env.moisture;
  const theta = () => { if (!cell || mo.nx <= 0) return -1; const ix = Math.floor(cell.center.x / mo.cell), iz = Math.floor(cell.center.z / mo.cell); return r2(mo.theta1[iz * mo.nx + ix] / 255); };
  const flood = () => { const c = nestOf(sim).chambers.find((x) => x.id === cell?.id) as unknown as { flooded?: number } | undefined; floodLog.push({ t: sim.state.tick, flooded: r2(c?.flooded ?? -1), theta1: theta(), rain: r2((sim.state.env.weather as unknown as { rainRateMmH?: number }).rainRateMmH ?? -1) }); };
  let relays = 0;
  const t0 = sim.state.tick;
  for (;;) {
    layLikeFirstplay(sim);
    note();
    console.log(JSON.stringify({ laid, phase: phase(sim), eggs: [...where.values()].slice(-12) }));
    if (phase(sim) === 'lay') sim.enqueue({ type: 'openingBeginTimelapse' });
    stepUntil(sim, () => { if (sim.state.tick % 10 === 0) note(); if (sim.state.tick % 600 === 0) flood(); return ['handover', 'done', 'failed', 'lay'].includes(phase(sim)); }, 8 * TICKS_PER_DAY);
    if (phase(sim) !== 'lay' || relays >= 2) break;
    relays++;
  }
  const op = sim.state.player.opening as unknown as { lapse?: { outcome?: string } } | null;
  const by: Record<string, number> = {};
  for (const d of deaths) { const k = `${d.stage}:${d.cause}`; by[k] = (by[k] ?? 0) + 1; }
  console.log(JSON.stringify({ end: phase(sim), gd: r2((sim.state.tick - t0) / TICKS_PER_DAY), outcome: op?.lapse?.outcome ?? null, laid, relays, deathsBy: by,
    workers: sim.state.ants.filter((a) => a.alive && a.colony === colId && a.caste === 'worker').length }));
  for (const d of deaths.slice(0, 40)) console.log(JSON.stringify(d));
  for (const f of floodLog.slice(0, 20)) console.log(JSON.stringify(f));
  for (const l of timeline.slice(0, 60)) console.log(l);
}
