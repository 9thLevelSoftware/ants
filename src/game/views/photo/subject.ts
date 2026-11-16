// The subject of a photo (GDD 01 6.9, task photo 4): the possessed ant by default, else the ant the observer follows,
// else what the player had selected; any picked thing can take over. Resolves a reference to a point to focus on and
// a short name for the panel. Pure reads of the session.
import { vec3, type Vec3 } from '@/core';
import type { Ant } from '@/sim/types';
import type { GameSession } from '../../session';
import type { PickTarget } from '../picking/entityPick';
import { PHOTO_BODY_LIFT_L } from './constants';

export type SubjectKind = 'ant' | 'creature' | 'brood' | 'item' | 'source' | 'chamber' | 'entrance';
export interface SubjectRef { kind: SubjectKind; id: number }
export interface Subject extends SubjectRef {
  /** Focus point, mm. */
  pos: Vec3;
  /** "Queen", "Worker", "Spider" ... with the id. */
  label: string;
}

const cap = (s: string): string => (s.length ? s[0].toUpperCase() + s.slice(1) : s);

/** Who the photo is of when photo mode opens: possessed ant, followed ant, the selection, nobody. */
export function defaultSubjectRef(s: GameSession, selected: PickTarget | null): SubjectRef | null {
  if (s.possessedId >= 0 && s.sim.stores.ants.get(s.possessedId)) return { kind: 'ant', id: s.possessedId };
  if (s.followId >= 0 && s.sim.stores.ants.get(s.followId)) return { kind: 'ant', id: s.followId };
  if (selected && alive(s, { kind: selected.kind, id: selected.id })) return { kind: selected.kind, id: selected.id };
  return null;
}

function alive(s: GameSession, r: SubjectRef): boolean {
  const st = s.sim.stores;
  switch (r.kind) {
    case 'ant': return !!st.ants.get(r.id);
    case 'creature': return !!st.creatures.get(r.id);
    case 'brood': return !!st.brood.get(r.id);
    case 'item': return !!st.items.get(r.id);
    case 'source': return !!st.sources.get(r.id);
    default: return true; // chambers and entrances are checked where they are read
  }
}

const _p = vec3();

/**
 * Where an ant is drawn, `lift` mm above its body along its up: the renderer blends the previous and the current tick
 * pose by `alpha` (photo mode never uses the possessed ant's prediction), so the focus and the orbit pivot follow suit.
 */
function drawnAntPoint(a: Ant, alpha: number, lift: number, out: Vec3): Vec3 {
  const k = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 1, j = 1 - k;
  let ux = a.prevUp.x * j + a.up.x * k, uy = a.prevUp.y * j + a.up.y * k, uz = a.prevUp.z * j + a.up.z * k;
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul; uy /= ul; uz /= ul;
  const up = lift - (a.footOffset || 0); // the body is drawn footOffset below the walker point
  out.x = a.prevPos.x * j + a.pos.x * k + ux * up;
  out.y = a.prevPos.y * j + a.pos.y * k + uy * up;
  out.z = a.prevPos.z * j + a.pos.z * k + uz * up;
  return out;
}

/** The subject's focus point and name, or null when it is gone (died, was carried away, was eaten). `alpha`: the frame's tick interpolation. */
export function resolveSubject(s: GameSession, ref: SubjectRef, alpha = 1): Subject | null {
  const sim = s.sim, bu = sim.world.bu, st = sim.stores;
  const out = (pos: Vec3, label: string): Subject => ({ ...ref, pos: { x: pos.x, y: pos.y, z: pos.z }, label });
  switch (ref.kind) {
    case 'ant': {
      const a = st.ants.get(ref.id);
      if (!a) return null;
      return out(drawnAntPoint(a, alpha, PHOTO_BODY_LIFT_L * a.lengthBu * bu, _p), `${cap(String(a.caste))} #${a.id}`);
    }
    case 'creature': {
      const c = st.creatures.get(ref.id);
      return c ? out(c.pos, `${cap(String(c.kind))} #${c.id}`) : null;
    }
    case 'brood': {
      const b = st.brood.get(ref.id);
      return b ? out(b.pos, `${cap(String(b.stage))} #${b.id}`) : null;
    }
    case 'item': {
      const i = st.items.get(ref.id);
      return i ? out(i.pos, `${cap(String(i.kind))} #${i.id}`) : null;
    }
    case 'source': {
      const o = st.sources.get(ref.id);
      return o ? out(o.pos, `${cap(String(o.kind))} #${o.id}`) : null;
    }
    case 'chamber': {
      for (const n of sim.state.nests) for (const c of n.chambers) if (c.id === ref.id) return out(c.center, `${cap(String(c.type))} chamber`);
      return null;
    }
    case 'entrance': {
      for (const n of sim.state.nests) for (const e of n.entrances) if (e.id === ref.id) return out(e.pos, 'Nest entrance');
      return null;
    }
  }
}
