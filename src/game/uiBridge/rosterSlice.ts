// The Roster page (GDD 08 4.5): the ants matching the open panel's filters, in a frozen sort order, as the window of
// rows the virtualised list shows. Rebuilt at most twice per real second; the order is only re-sorted when the query
// changes or the player presses "Re-sort", so rows never jump under the pointer. Nothing runs while the panel is closed.
import type { Ant, Sim } from '@/sim/types';
import { chamberEntry } from '@/sim/colony/census';
import { zoneAt } from '@/sim/world';
import type { UiRoster, UiRosterQuery, UiRosterRow } from '@/ui/api';
import { comparator, health01, matchesQuery, orderIsStale, queryOrderKey, roleOfTask } from '@/ui/panels/roster/rosterModel';
import { ROSTER_MAX_WINDOW, ROSTER_MIN_INTERVAL_MS } from './balance';
import { groupOfTask } from './hudSlices';
import { antName, taskWord, ZONE_WORDS } from './words';

const cap = (s: string): string => (s.length ? s[0].toUpperCase() + s.slice(1) : s);

function whereOf(sim: Sim, a: Ant): string {
  if (a.chamberId >= 0) {
    const e = chamberEntry(sim, a.chamberId);
    if (e) return `${cap(e.ch.type)} ${a.chamberId}`;
  }
  if (a.nestId >= 0) return 'Tunnel';
  return ZONE_WORDS[zoneAt(sim.world, a.pos.x, a.pos.z)] ?? 'Outside';
}

function carryOf(sim: Sim, a: Ant): string {
  if (a.carry.kind === 'none') return '—';
  if (a.carry.kind === 'brood') return sim.stores.brood.get(a.carry.id)?.stage ?? 'brood';
  const k = sim.stores.items.get(a.carry.id)?.kind ?? 'item';
  return k === 'soil-pellet' ? 'soil pellet' : k.replace(/-/g, ' ');
}

function rowOf(sim: Sim, a: Ant): UiRosterRow {
  return {
    id: a.id, caste: a.caste, name: antName(a.caste, a.id), ageDays: Math.round(a.physioAgeGd * 10) / 10, task: taskWord(a.task),
    where: whereOf(sim, a), health: Math.round(health01(a) * 100) / 100, cropC: Math.round(a.cropC * 100) / 100, cropP: Math.round(a.cropP * 100) / 100,
    carrying: carryOf(sim, a), possessed: a.id === sim.state.player.possessedAntId,
  };
}

/** Holds the frozen order between refreshes. One per Game. */
export class RosterBuilder {
  private sim: Sim | null = null;
  private key = '';
  private order: number[] = [];
  private lastMs = -Infinity;
  private lastQuery: UiRosterQuery | null = null;
  private last: UiRoster | null = null;

  /** The roster page for `q`; `nowMs` is a real-time clock (injected for tests). */
  build(sim: Sim, q: UiRosterQuery, nowMs: number): UiRoster {
    const sameQuery = this.lastQuery !== null && JSON.stringify(q) === JSON.stringify(this.lastQuery);
    if (this.sim === sim && this.last && sameQuery && nowMs - this.lastMs < ROSTER_MIN_INTERVAL_MS) return this.last;
    const orderKey = queryOrderKey(q);
    const resort = this.sim !== sim || orderKey !== this.key;
    const throttled = this.sim === sim && this.last !== null && !resort && nowMs - this.lastMs < ROSTER_MIN_INTERVAL_MS;
    if (throttled && this.last) {
      // only the scroll window moved: new rows from the frozen order, the counts stay
      this.pruneDead(sim);
      const next = { ...this.last, rows: this.rows(sim, q), offset: q.offset, total: this.order.length };
      this.lastQuery = { ...q };
      return (this.last = next);
    }
    this.sim = sim;
    this.key = orderKey;
    this.lastMs = nowMs;
    this.lastQuery = { ...q };
    return (this.last = this.refresh(sim, q, resort));
  }

  /** Ants that died since the order was frozen leave it; the survivors keep their relative order. */
  private pruneDead(sim: Sim): void {
    let kept = 0;
    for (const id of this.order) {
      const a = sim.stores.ants.get(id);
      if (a && a.alive) this.order[kept++] = id;
    }
    this.order.length = kept;
  }

  private rows(sim: Sim, q: UiRosterQuery): UiRosterRow[] {
    const out: UiRosterRow[] = [];
    const n = Math.min(q.limit, ROSTER_MAX_WINDOW);
    for (let i = q.offset; i < q.offset + n && i < this.order.length; i++) {
      const a = sim.stores.ants.get(this.order[i]);
      if (a && a.alive) out.push(rowOf(sim, a));
    }
    return out;
  }

  private refresh(sim: Sim, q: UiRosterQuery, resort: boolean): UiRoster {
    const col = sim.state.colonies[0];
    const byCaste: Record<string, number> = {}, byGroup: Record<string, number> = {};
    const roles = { forager: 0, digger: 0, nurse: 0, queen: 0 };
    const matched: Ant[] = [];
    let all = 0;
    for (const a of sim.state.ants) {
      if (!a.alive || !col || a.colony !== col.id) continue;
      all++;
      byCaste[a.caste] = (byCaste[a.caste] ?? 0) + 1;
      const g = groupOfTask(a.task);
      if (a.caste !== 'queen' && a.caste !== 'gyne' && a.caste !== 'male') {
        byGroup[g] = (byGroup[g] ?? 0) + 1;
        const r = roleOfTask(a.task);
        if (r && a.combat === null && a.carry.kind !== 'brood') roles[r]++;
      }
      if (a.caste === 'queen') roles.queen++;
      if (matchesQuery(a, q, g)) matched.push(a);
    }
    if (resort) {
      matched.sort(comparator(q.sort, q.dir));
      this.order = matched.map((a) => a.id);
    } else {
      this.pruneDead(sim);
    }
    const window = this.rows(sim, q);
    const live: Ant[] = [];
    for (let i = q.offset; i < q.offset + window.length && i < this.order.length; i++) { const a = sim.stores.ants.get(this.order[i]); if (a) live.push(a); }
    const stale = !resort && (matched.length !== this.order.length || orderIsStale(live, q.sort, q.dir));
    const brood = { egg: 0, larva: 0, pupa: 0, byCaste: {} as Record<string, number> };
    for (const b of sim.state.brood) {
      if (!b.alive || !col || b.colony !== col.id) continue;
      if (b.stage === 'egg') brood.egg++; else if (b.stage === 'larva') brood.larva++; else if (b.stage === 'pupa') brood.pupa++;
      brood.byCaste[b.destined] = (brood.byCaste[b.destined] ?? 0) + 1;
    }
    return { rows: window, offset: q.offset, total: this.order.length, all, roles, byCaste, byGroup, stale, brood };
  }
}
