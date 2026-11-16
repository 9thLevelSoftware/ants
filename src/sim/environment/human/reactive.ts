// The world answers (GDD 04 §15.6): player-colony deliveries from interior food on two consecutive days, or a
// trail held on a worktop for 0.5 GD, bring a bait station 0.5-1 GD later (placement 18:00-20:00) near the busiest
// interior trail; a worktop trail held 0.25 GD brings one extra wipe that day; Harsh also baits the patio after 2 GD
// of patio crumb use. Deliveries are counted from the `delivery` event (listener installed once per Sim).

import { rngInt, rngRange } from '@/core/rng';
import type { HumanEventInst, Sim } from '@/sim/types';
import type { Vec3 } from '@/core/math/vec3';
import {
  BAIT_COUNTER_TRAIL_GD, BAIT_OFFSET_MM, BAIT_PATIO_GD, BAIT_PLACE_HOURS, BAIT_TRIGGER_VISITS, COUNTER_TRAIL_MIN,
  EXTRA_WIPE_DELAY_H, EXTRA_WIPE_TRAIL_GD, HUMAN_REACTIVE_EVERY,
} from '@/sim/balance/human';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '@/sim/time';
import { humanExtra } from './extra';
import { isFreeAt, zoneIdAt } from './grid';
import { baitMode, humanActivityOff } from './rules';
import { humanSites, sitesOf } from './sites';
import { noteBaitVisit } from './effects/bait';
import { humanRng } from './effects/common';

const listening = new WeakSet<Sim>();

function playerColony(sim: Sim): number {
  return sim.state.colonies.find((c) => c.isPlayer)?.id ?? -1;
}

function zoneTypeAt(sim: Sim, x: number, z: number): string | undefined {
  const id = zoneIdAt(sim.world, x, z);
  return sim.world.zones.find((zd) => zd.id === id)?.type;
}

/** Counts player deliveries from interior and patio food and from bait gels (once per Sim). */
export function ensureListener(sim: Sim): void {
  if (listening.has(sim)) return;
  listening.add(sim);
  sim.events.on('delivery', (e) => {
    if (e.colonyId !== playerColony(sim)) return;
    noteBaitVisit(sim, e.sourceId);
    const s = sim.stores.sources.get(e.sourceId);
    if (!s) return;
    const zt = zoneTypeAt(sim, s.pos.x, s.pos.z);
    if (zt === 'interior') sim.state.env.human.reactive.interiorVisits[0]++;
    const patio = sitesOf(sim.world, 'patio')[0];
    if (patio && patio.zoneIds.includes(zoneIdAt(sim.world, s.pos.x, s.pos.z))) humanExtra(sim).patioVisitsToday++;
  });
}

/** Day rollover of the counters; may set the bait due time (`dayStartTick` = state tick of 00:00 today). */
export function reactiveNewDay(sim: Sim, day: number, dayStartTick: number): void {
  const h = sim.state.env.human, ex = humanExtra(sim), mode = baitMode(sim);
  if (ex.visitDay < 0) { ex.visitDay = day; return; }
  if (day === ex.visitDay) return;
  ex.visitDay = day;
  const v = h.reactive.interiorVisits;
  const twoDays = v[0] >= BAIT_TRIGGER_VISITS && v[1] >= BAIT_TRIGGER_VISITS;
  v[1] = v[0];
  v[0] = 0;
  ex.patioDays = ex.patioVisitsToday > 0 ? ex.patioDays + 1 : 0;
  ex.patioVisitsToday = 0;
  if (mode === 'off' || humanActivityOff(sim) || ex.baitDueTick >= 0 || ex.baits.length > 0) return;
  const rng = humanRng(sim);
  const placeAt = dayStartTick + Math.round(rngRange(rng, BAIT_PLACE_HOURS[0], BAIT_PLACE_HOURS[1]) * TICKS_PER_HOUR);
  if (twoDays) { ex.baitDueTick = placeAt; ex.baitDuePatio = false; }
  else if (mode === 'interior-garden' && ex.patioDays >= BAIT_PATIO_GD) { ex.baitDueTick = placeAt; ex.baitDuePatio = true; }
}

/** Worktop trail checks (every HUMAN_REACTIVE_EVERY ticks): extra wipe at 0.25 GD, bait at 0.5 GD. */
export function reactiveCheck(sim: Sim, queue: (inst: HumanEventInst) => void): void {
  const h = sim.state.env.human, ex = humanExtra(sim);
  const counter = sitesOf(sim.world, 'counter')[0];
  if (!counter) return;
  const col = playerColony(sim);
  let trail = false;
  for (const r of counter.rects) {
    for (let x = r.x0 + 50; x < r.x1 && !trail; x += 100) {
      for (let z = r.z0 + 50; z < r.z1 && !trail; z += 100) {
        if (sim.phero.sample(col, 'trail', { x, y: r.y + sim.world.bu * 0.5, z }) >= COUNTER_TRAIL_MIN) trail = true;
      }
    }
  }
  h.reactive.counterTrailTicks = trail ? h.reactive.counterTrailTicks + HUMAN_REACTIVE_EVERY : 0;
  // with people switched off the trail is still measured, but nobody answers it (GDD 04 App. E 24)
  if (humanActivityOff(sim)) return;
  const day = Math.floor((sim.state.tick + sim.state.env.calendar.startTick) / TICKS_PER_DAY);
  if (h.reactive.counterTrailTicks >= EXTRA_WIPE_TRAIL_GD * TICKS_PER_DAY && ex.extraWipeDay !== day) {
    ex.extraWipeDay = day;
    queue(newInst(sim, 'sweeping', 'wipe', counter.id, sim.state.tick + Math.round(EXTRA_WIPE_DELAY_H * TICKS_PER_HOUR), null));
  }
  if (baitMode(sim) !== 'off' && ex.baitDueTick < 0 && ex.baits.length === 0
    && h.reactive.counterTrailTicks >= BAIT_COUNTER_TRAIL_GD * TICKS_PER_DAY) {
    const dayStart = day * TICKS_PER_DAY - sim.state.env.calendar.startTick;
    let t = dayStart + Math.round(BAIT_PLACE_HOURS[0] * TICKS_PER_HOUR);
    if (t < sim.state.tick) t += TICKS_PER_DAY;
    ex.baitDueTick = t;
    ex.baitDuePatio = false;
  }
}

export function newInst(sim: Sim, kind: HumanEventInst['kind'], variant: HumanEventInst['variant'], regionId: number, startTick: number,
  at: Vec3 | null): HumanEventInst {
  return { id: sim.state.nextId++, kind, variant, startTick, laneId: -1, regionId, seed: rngInt(humanRng(sim), 1, 0x7fffffff), cancelled: false, at, param: -1 };
}

/** Where the station goes: 100-300 mm from the strongest player trail cell indoors (or on the patio). */
export function baitSpot(sim: Sim, patio: boolean): Vec3 | null {
  const sites = humanSites(sim.world);
  const site = patio ? sitesOf(sim.world, 'patio')[0] : sites.list.find((s) => s.kind === 'interior-floor');
  if (!site) return null;
  const col = playerColony(sim);
  const r = site.rect;
  let best = -1, bx = 0, by = 0, bz = 0;
  sim.phero.forEachActiveCell?.(col, 'trail', (x, y, z, v) => {
    if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1 || v <= best) return;
    best = v; bx = x; by = y; bz = z;
  });
  if (best < 0) {
    // no trail cell: the busiest interior source instead
    const s = sim.stores.sources.list.find((q) => q.alive && q.pos.x >= r.x0 && q.pos.x <= r.x1 && q.pos.z >= r.z0 && q.pos.z <= r.z1);
    if (!s) return null;
    bx = s.pos.x; by = s.pos.y; bz = s.pos.z;
  }
  const rng = humanRng(sim);
  for (let i = 0; i < 24; i++) {
    const a = rngRange(rng, 0, Math.PI * 2), d = rngRange(rng, BAIT_OFFSET_MM[0], BAIT_OFFSET_MM[1]);
    const x = bx + Math.cos(a) * d, z = bz + Math.sin(a) * d;
    const onCounter = sitesOf(sim.world, 'counter')[0]?.rects.find((q) => x >= q.x0 + 40 && x <= q.x1 - 40 && z >= q.z0 + 40 && z <= q.z1 - 40);
    const raised = by > (Number.isFinite(site.y) ? site.y : 0) + 100;
    if (raised && onCounter) return { x, y: onCounter.y, z };
    if (!raised && site.grid && isFreeAt(site.grid, x, z)) return { x, y: Number.isFinite(site.y) ? site.y : sim.field.height(x, z), z };
  }
  return { x: bx, y: by, z: bz };
}
