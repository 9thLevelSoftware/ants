// Roster logic (GDD 08 4.5): filters, sort comparators and the stable-order rule. Pure functions over a minimal ant
// shape, so the snapshot bridge (which has the real ants) and the unit tests (plain literals) use the same code.
import type { UiRosterQuery } from '../../api';

/** The ant fields the roster reads. The simulation's `Ant` satisfies it. */
export interface RosterAnt {
  id: number;
  caste: string;
  task: string;
  physioAgeGd: number;
  hp: number;
  maxHp: number;
  cropC: number;
  cropP: number;
  /** -1 outside any chamber. */
  chamberId: number;
  /** -1 outside any nest. */
  nestId: number;
  carry: { kind: string };
}

export type RosterGroup = 'forage' | 'nurse' | 'dig' | 'defend' | 'idle';

export const SORT_KEYS: readonly UiRosterQuery['sort'][] = ['id', 'age', 'task', 'where', 'health', 'crop', 'carrying'];

export function defaultQuery(): UiRosterQuery {
  return { caste: 'all', group: 'all', where: 'all', search: '', sort: 'id', dir: 'asc', offset: 0, limit: 24, resort: 0 };
}

/** Everything of the query that changes WHICH ants show and in which order (not the scroll window). */
export function queryOrderKey(q: UiRosterQuery): string {
  return `${q.caste}|${q.group}|${q.where}|${q.search.trim()}|${q.sort}|${q.dir}|${q.resort}`;
}

export function health01(a: RosterAnt): number {
  return a.maxHp > 0 ? a.hp / a.maxHp : 0;
}

const isWorkerCaste = (c: string): boolean => c === 'worker' || c === 'minor' || c === 'media' || c === 'major';

/** True when the ant passes the caste, group, location and id-search filters. */
export function matchesQuery(a: RosterAnt, q: UiRosterQuery, group: RosterGroup): boolean {
  if (q.caste !== 'all') {
    if (q.caste === 'worker' ? !isWorkerCaste(a.caste) : a.caste !== q.caste) return false;
  }
  if (q.group !== 'all' && group !== q.group) return false;
  if (q.where === 'nest' && a.nestId < 0) return false;
  if (q.where === 'outside' && a.nestId >= 0) return false;
  const s = q.search.trim().replace(/^#/, '');
  return s === '' || String(a.id).padStart(4, '0').includes(s);
}

function keyOf(a: RosterAnt, sort: UiRosterQuery['sort']): number | string {
  switch (sort) {
    case 'age': return a.physioAgeGd;
    case 'task': return a.task;
    case 'where': return a.chamberId >= 0 ? a.chamberId : a.nestId >= 0 ? 0 : -1;
    case 'health': return health01(a);
    case 'crop': return a.cropC + a.cropP;
    case 'carrying': return a.carry.kind === 'none' ? '' : a.carry.kind;
    default: return a.id;
  }
}

/** Comparator for a sort key and direction; ties break on id so the order is total and stable. */
export function comparator(sort: UiRosterQuery['sort'], dir: UiRosterQuery['dir']): (a: RosterAnt, b: RosterAnt) => number {
  const sign = dir === 'desc' ? -1 : 1;
  return (a, b) => {
    const ka = keyOf(a, sort), kb = keyOf(b, sort);
    if (ka < kb) return -sign;
    if (ka > kb) return sign;
    return a.id - b.id;
  };
}

/**
 * True when the consecutive rows of the window are no longer in sort order: the list was sorted earlier and the
 * values moved since ("Re-sort" chip, GDD 08 4.5). `rows` are the live ants in their frozen order.
 */
export function orderIsStale(rows: readonly RosterAnt[], sort: UiRosterQuery['sort'], dir: UiRosterQuery['dir']): boolean {
  if (sort === 'id') return false;
  const cmp = comparator(sort, dir);
  for (let i = 1; i < rows.length; i++) if (cmp(rows[i - 1], rows[i]) > 0) return true;
  return false;
}

/** Quick-possess roles (GDD 08 4.5): the task sets behind "A forager", "A digger", "A nurse". */
export function roleOfTask(task: string): 'forager' | 'digger' | 'nurse' | null {
  if (task === 'forage' || task === 'scout') return 'forager';
  if (task === 'dig' || task === 'haul') return 'digger';
  if (task === 'nurse' || task === 'queen-care') return 'nurse';
  return null;
}

/** Applies a header click: same key flips the direction, a new key starts ascending. */
export function nextSort(q: UiRosterQuery, key: UiRosterQuery['sort']): Pick<UiRosterQuery, 'sort' | 'dir'> {
  if (q.sort === key) return { sort: key, dir: q.dir === 'asc' ? 'desc' : 'asc' };
  return { sort: key, dir: key === 'health' || key === 'age' || key === 'crop' ? 'desc' : 'asc' };
}
