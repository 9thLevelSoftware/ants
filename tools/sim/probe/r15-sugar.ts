// Round 15 probe (direction 30 item 4): why sugar is left lying while prey is hunted. Restores a hand-over, runs to
// winter and prints (1) one row a game day: stores, need indices, days of stock, departures by target, C sources within
// 300 BU (remaining C, in the colony's news, foragers holding a route to it), (2) for the first departures of each day
// the forager's known sources with their score and the best patch's score, (3) for every trip to a C source that came
// home without reaching it: the closest it got, where it turned, the nav state. Reads state only (the scores are
// recomputed after the tick, for the record).
//   node tools/sim/run-ts.mjs tools/sim/probe/r15-sugar.ts FILE ARCH SEED [PER_DAY]
import type { Ant, ArchetypeId } from '@/sim/types';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { defaultGameConfig } from '@/sim/createGame';
import { generateWorld } from '@/worldgen';
import { restore } from '@/sim/save';
import { TICKS_PER_DAY, currentDayOfYear, currentSeason } from '@/sim/time';
import { daysOfStock } from '@/sim/colony/needs';
import { knownSources, sourceScore } from '@/sim/ants/behaviours/outdoor/choice';
import { choosePatch } from '@/sim/ants/behaviours/outdoor/hunt';
import { FORAGE } from '@/sim/ants/behaviours/outdoor/flavours';
import { distFromHome } from '@/sim/ants/behaviours/outdoor/common';

interface Fs { readFileSync(p: string): Uint8Array }
const f2 = (x: number) => x.toFixed(2);

export default async function main(args: string[]): Promise<void> {
  const { readFileSync } = (await import('node:fs' as string)) as Fs;
  const [file, arch, seedS, perDayS] = args;
  const perDay = Number(perDayS ?? 4);
  const base = defaultGameConfig('lasius-niger', Number(seedS), 'naturalist');
  const config = { ...base, cheats: true, world: { ...base.world, archetype: arch as ArchetypeId } };
  const sim = createSim(restore(new Uint8Array(readFileSync(file))).state, generateWorld(config.world), { systems: SYSTEMS });
  const col = sim.stores.colonies.get(sim.state.player.colonyId)!;
  const bu = sim.world.bu;
  const lastPh = new Map<number, number>();
  type Trip = { src: number; minD: number; t0: number; turnD: number; turnHome: number; why: string; nav: string };
  const trips = new Map<number, Trip>();
  let day = -1, dep: Record<string, number> = {}, logged = 0;
  const failed: string[] = [];
  const kindOf = (id: number) => { const s = sim.stores.sources.get(id); return s ? `${s.kind}${s.c > s.p ? ':C' : ':P'}` : `gone#${id}`; };
  const isC = (id: number) => { const s = sim.stores.sources.get(id); return !!s && s.c > s.p; };
  const tmp: number[] = [];
  const dayRow = () => {
    const d = daysOfStock(col);
    const src: string[] = [];
    for (const s of sim.stores.sources.list) {
      if (!s.alive || s.c <= 0.05 || s.c < s.p) continue;
      const ent = col.nestIds.length ? sim.stores.nests.get(col.nestIds[0])!.entrances[0] : undefined;
      const dist = ent ? Math.hypot(s.pos.x - ent.pos.x, s.pos.z - ent.pos.z) / bu : -1;
      if (dist > 300) continue;
      const news = col.news.some((n) => n.sourceId === s.id) ? 'news' : '-';
      const routes = sim.stores.ants.list.filter((a) => a.alive && a.colony === col.id && a.mem.routes.some((r) => r.sourceId === s.id && r.n >= 2)).length;
      src.push(`#${s.id} ${s.kind}/${s.variant ?? ''} ${dist.toFixed(0)} BU C ${f2(s.c)} ${news} routes ${routes}`);
    }
    console.log(`DAY ${day} doy ${f2(currentDayOfYear(sim.state))} stores C ${f2(col.stores.c)} P ${f2(col.stores.p)} needC ${f2(col.needs.needC)} needP ${f2(col.needs.needP)} days C ${f2(d.c)} P ${f2(d.p)} departures ${JSON.stringify(dep)}`);
    console.log(`  C sources <= 300 BU: ${src.join('; ') || 'none'}`);
  };
  while (currentSeason(sim.state) !== 'winter') {
    sim.tick();
    const d = Math.floor(sim.state.tick / TICKS_PER_DAY);
    if (d !== day) { if (day >= 0) dayRow(); day = d; dep = {}; logged = 0; }
    for (const a of sim.stores.ants.list as Ant[]) {
      if (!a.alive || a.colony !== col.id || a.task !== 'forage') continue;
      const ph = a.bb['fo.ph'] ?? -1, prev = lastPh.get(a.id) ?? -1;
      const tr = trips.get(a.id);
      if (tr && a.nestId < 0) {
        const s = sim.stores.sources.get(tr.src);
        if (s) tr.minD = Math.min(tr.minD, Math.hypot(a.pos.x - s.pos.x, a.pos.z - s.pos.z) / bu);
      }
      if (ph === prev) continue;
      lastPh.set(a.id, ph);
      if (ph === 1 && prev === 0) { // wait -> outbound: a departure
        const src = a.bb['fo.src'] ?? -1;
        const key = src >= 0 ? kindOf(src) : (a.bb['fo.patch'] ?? -1) >= 0 ? 'hunt' : 'marker/other';
        dep[key] = (dep[key] ?? 0) + 1;
        if (src >= 0 && isC(src)) trips.set(a.id, { src, minD: Infinity, t0: sim.state.tick, turnD: -1, turnHome: -1, why: '', nav: '' });
        if (logged < perDay) {
          logged++;
          knownSources(sim, a, tmp);
          const known = tmp.map((id) => { const s = sim.stores.sources.get(id); return s ? `#${id} ${kindOf(id)} U ${sourceScore(sim, a, s).toExponential(2)} d ${(distFromHome(sim, a, s.pos) / bu).toFixed(0)}` : `#${id} gone`; });
          const p = choosePatch(sim, a, FORAGE);
          console.log(`  dep t ${sim.state.tick} ant ${a.id} -> ${key}${src >= 0 ? ` #${src}` : ''}; known [${known.join(', ')}]; patch U ${p ? p.u.toExponential(2) : '-'}`);
        }
      }
      if (ph === 5 && tr && tr.turnD < 0) { // return
        const s = sim.stores.sources.get(tr.src);
        tr.turnD = s ? Math.hypot(a.pos.x - s.pos.x, a.pos.z - s.pos.z) / bu : -1;
        tr.turnHome = distFromHome(sim, a, a.pos) / bu;
        const dec = a.mem.decisions[0];
        tr.why = dec ? String(dec.code) : '?';
        tr.nav = `${a.nav.status}/${a.nav.failReason ?? ''}`;
      }
      if (tr && a.nestId >= 0 && ph !== 1 && ph !== 2 && ph !== 3 && ph !== 4 && ph !== 5) {
        const reached = tr.minD < 20;
        if (!reached) failed.push(`day ${day} ant ${a.id} to #${tr.src} ${kindOf(tr.src)}: closest ${f2(tr.minD)} BU, turned ${f2(tr.turnD)} BU from it, ${f2(tr.turnHome)} BU from home, reason code ${tr.why}, nav ${tr.nav}, ${((sim.state.tick - tr.t0) / 10).toFixed(0)} s`);
        trips.delete(a.id);
      }
    }
  }
  dayRow();
  console.log(`C trips home without reaching the source: ${failed.length}`);
  for (const l of failed) console.log(`  ${l}`);
}
