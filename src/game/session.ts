// One running game: the sim, its driver, the view machine and the possession plumbing (GDD 01 §1.3, §2, §3).
// No DOM and no three here, so the rules are testable in Node; Game.ts adds rendering, input devices and UI.
import { vec3, type Vec3 } from '@/core';
import type { ActionId, Ant, Command, PossessRole, Sim, TargetRef } from '@/sim/types';
import { antForRole, promptView } from '@/sim/ants/player';
import { POSSESS_ROLES } from '@/sim/types';
import { SimDriver } from './loop/simDriver';
import { PossessionEvents, TOASTS } from './possessionEvents';
import { predictedPossessedPose } from './sim/possessedPose';
import { TabCycle } from './tabCycle';
import type { ViewId } from './time/speedRules';
import { AFTER_DEATH_PROMPT, findCorpse, itemSubject } from './views/deathFollow';
import { ViewDirector, type CameraOptions, type ViewSubject } from './views/viewDirector';
import { tabCandidates } from './tabCycle';

/** Real seconds the camera holds on a dead possessed ant before the observer takes over (GDD 01 §3.8). */
export const POSSESS_DEATH_HOLD_S = 3;
/** Real seconds between the last death and the epitaph (GDD 01 §1.2). */
export const EPITAPH_DELAY_S = 5;
/** Tick poses further apart than this (BU) are not interpolated. */
const SNAP_BU = 4;

export interface PromptTarget {
  actionId: ActionId;
  target: TargetRef | null;
}

export class GameSession {
  readonly driver: SimDriver;
  readonly views: ViewDirector;
  readonly events = new PossessionEvents();
  readonly tab = new TabCycle();
  /** Ant the observer follows / the possession camera tracks, -1 none. */
  followId = -1;
  /** Counting down after the possessed ant died (real s), -1 idle. */
  deathHoldS = -1;
  /** Counting up while the colony has no living ant (real s), -1 idle. */
  extinctS = -1;
  /** The possessed ant that died (during and after the hold), -1 none. */
  private deadAntId = -1;
  /** Corpse item the observer follows after the death hold, -1 none. */
  followItemId = -1;
  /** Observer prompt after the possessed ant died ("Tab: take another ant"), null when none. */
  observerPrompt: string | null = null;
  /** Setting autoRepossessOnDeath (GDD 01 §3.7): after the hold, take the nearest nestmate. Game keeps it current. */
  autoRepossessOnDeath = false;
  readonly toasts: string[] = [];
  /** When the per-frame predictor last ran: for which ant, at which tick, from which authoritative position. */
  private readonly predictedAt = { antId: -1, tick: -1, x: 0, y: 0, z: 0 };
  private readonly lastSubjectPos = vec3();
  private readonly subj: ViewSubject = { pos: vec3(), up: vec3(0, 1, 0), fwd: vec3(1, 0, 0), lengthBu: 1, underground: false, airborne: false };

  constructor(readonly sim: Sim, cam: CameraOptions) {
    this.driver = new SimDriver(sim);
    this.views = new ViewDirector({
      bu: sim.world.bu, worldSize: sim.world.size,
      trace: (o, d, max, r) => sim.field.sphereTrace(o, d, max, r),
      groundHeight: (x, z) => sim.field.height(x, z),
    }, cam);
    this.events.attach(sim);
    this.views.placeObserverAbove(sim.world.queenStart.pos);
  }

  get view(): ViewId { return this.views.view; }
  get possessedId(): number { return this.sim.state.player.possessedAntId; }
  possessedAnt(): Ant | undefined { return this.sim.stores.ants.get(this.possessedId); }

  /**
   * Per-frame movement of the possessed ant over `gameS` game seconds (GDD 01 §3.4). While time stands still the
   * last prediction stays valid, so pausing or photo mode does not snap the ant back to its tick pose.
   */
  predict(gameS: number): void {
    const id = this.possessedId;
    if (id < 0 || !(gameS > 0)) return; // nothing integrated: a new tick then reads as "no valid prediction"
    this.sim.integratePossessed(gameS);
    const a = this.possessedAnt();
    if (!a) return;
    const p = this.predictedAt;
    p.antId = id; p.tick = this.sim.state.tick; p.x = a.pos.x; p.y = a.pos.y; p.z = a.pos.z;
  }

  /**
   * The predictor's pose describes the current state: same ant, no tick since it ran (a step) and the ant was not
   * moved by a command applied at once (teleport). A pause by itself keeps it valid, so the ant does not snap back.
   */
  predictionValid(): boolean {
    const p = this.predictedAt;
    if (p.antId < 0 || p.antId !== this.possessedId || p.tick !== this.sim.state.tick) return false;
    const a = this.possessedAnt();
    return !!a && a.pos.x === p.x && a.pos.y === p.y && a.pos.z === p.z;
  }

  /** Pose of an ant for the camera: the per-frame prediction for the possessed ant, else tick-interpolated. */
  subjectOf(a: Ant, alpha: number): ViewSubject {
    const s = this.subj, bu = this.sim.world.bu;
    const pred = a.id === this.possessedId && this.predictionValid() ? predictedPossessedPose(this.sim) : null;
    if (pred) {
      s.pos.x = pred.pos.x; s.pos.y = pred.pos.y; s.pos.z = pred.pos.z;
      s.up.x = pred.up.x; s.up.y = pred.up.y; s.up.z = pred.up.z;
      s.fwd.x = pred.fwd.x; s.fwd.y = pred.fwd.y; s.fwd.z = pred.fwd.z;
    } else {
      const jump = Math.hypot(a.pos.x - a.prevPos.x, a.pos.y - a.prevPos.y, a.pos.z - a.prevPos.z) > SNAP_BU * bu;
      const k = jump ? 1 : alpha, j = 1 - k;
      s.pos.x = a.prevPos.x * j + a.pos.x * k; s.pos.y = a.prevPos.y * j + a.pos.y * k; s.pos.z = a.prevPos.z * j + a.pos.z * k;
      s.up.x = a.prevUp.x * j + a.up.x * k; s.up.y = a.prevUp.y * j + a.up.y * k; s.up.z = a.prevUp.z * j + a.up.z * k;
      s.fwd.x = a.prevFwd.x * j + a.fwd.x * k; s.fwd.y = a.prevFwd.y * j + a.fwd.y * k; s.fwd.z = a.prevFwd.z * j + a.fwd.z * k;
      const ul = Math.hypot(s.up.x, s.up.y, s.up.z) || 1;
      s.up.x /= ul; s.up.y /= ul; s.up.z /= ul;
    }
    s.lengthBu = a.lengthBu;
    s.underground = this.sim.field.substrate(s.pos) < 0;
    s.airborne = a.medium === 'air';
    this.lastSubjectPos.x = s.pos.x; this.lastSubjectPos.y = s.pos.y; this.lastSubjectPos.z = s.pos.z;
    return s;
  }

  /** The subject of the active view this frame, or null. */
  currentSubject(alpha: number): ViewSubject | null {
    if (this.view === 'observer' && this.followId < 0 && this.followItemId >= 0) return this.corpseSubject();
    const id = this.view === 'possess' ? this.possessedId : this.followId;
    const a = id >= 0 ? this.sim.stores.ants.get(id) : undefined;
    if (!a) {
      if (this.view === 'observer' && this.followId >= 0) { this.followId = -1; this.views.unfollow(); }
      return null;
    }
    return this.subjectOf(a, alpha);
  }

  /** The followed corpse; once a nestmate carries it off the observer follows the carrier, once gone nothing. */
  private corpseSubject(): ViewSubject | null {
    const it = this.sim.stores.items.get(this.followItemId);
    const carrier = it && it.carrierIds.length > 0 ? this.sim.stores.ants.get(it.carrierIds[0]) : undefined;
    if (it && !carrier) return itemSubject(this.sim, it, this.subj);
    this.followItemId = -1;
    if (carrier) { this.followId = carrier.id; return this.subjectOf(carrier, 1); }
    this.views.unfollow();
    return null;
  }

  /** Where the camera is centred (nearPos for role possession, Tab centre). */
  focus(out: Vec3 = vec3()): Vec3 {
    return this.views.focusPoint(out);
  }

  setView(view: ViewId, instant = false): void {
    const id = view === 'possess' ? this.possessedId : this.followId;
    const a = id >= 0 ? this.sim.stores.ants.get(id) : undefined;
    this.views.setView(view, a ? this.subjectOf(a, 1) : null, instant);
  }

  /** Builds the possess command (id or role; nearPos is the camera focus so role picks are deterministic). */
  possessCommand(target: number | PossessRole, dropTo1x: boolean, via: 'command' | 'role-key' | 'cycle' | 'last' | 'auto' = 'command'): Command {
    if (typeof target === 'number') return { type: 'possess', antId: target, via, dropTo1x };
    return { type: 'possess', role: target, nearPos: this.focus(), via: via === 'command' ? 'role-key' : via, dropTo1x };
  }

  /** Parses a debug/API target: numeric id, numeric string or a role name. */
  static parseTarget(t: unknown): number | PossessRole | null {
    if (typeof t === 'number' && Number.isFinite(t)) return t;
    if (typeof t === 'string' && /^\d+$/.test(t)) return Number(t);
    if (typeof t === 'string' && (POSSESS_ROLES as readonly string[]).includes(t)) return t as PossessRole;
    return null;
  }

  /** Applies the reactions queued by sim events; real dt drives the death hold and the epitaph delay. */
  update(realDt: number): { epitaph: boolean; repossessId: number } {
    for (const r of this.events.take()) {
      if (r.kind === 'toast') this.toasts.push(r.text);
      else if (r.kind === 'possessed') {
        this.followId = r.antId; this.followItemId = -1; this.deathHoldS = -1; this.observerPrompt = null;
        this.setView('possess');
      } else if (r.kind === 'released') {
        this.followId = r.antId;
        if (r.reason !== 'colony-view' && r.reason !== 'timelapse' && this.view === 'possess') this.setView('observer');
      } else if (r.kind === 'possessed-died') { this.deathHoldS = POSSESS_DEATH_HOLD_S; this.deadAntId = r.antId; }
    }
    let repossessId = -1;
    if (this.deathHoldS >= 0) {
      this.deathHoldS -= realDt;
      if (this.deathHoldS < 0) repossessId = this.endDeathHold();
    }
    if (this.view !== 'observer') this.observerPrompt = null;
    const col = this.sim.state.colonies[0];
    const extinct = !!col && !this.sim.state.ants.some((a) => a.alive && a.colony === col.id);
    this.extinctS = extinct ? Math.max(0, this.extinctS) + realDt : -1;
    return { epitaph: extinct && this.extinctS >= EPITAPH_DELAY_S, repossessId };
  }

  /**
   * GDD 01 §3.7: after the hold the observer follow-orbits the corpse with the prompt "Tab: take another ant"; with
   * autoRepossessOnDeath the nearest nestmate is returned for possession instead (-1 none).
   */
  private endDeathHold(): number {
    const body = this.events.deathPos(this.deadAntId) ?? this.lastSubjectPos;
    this.followId = -1;
    if (this.view !== 'possess') return -1; // the player already left (colony view, photo)
    if (this.autoRepossessOnDeath) {
      const next = tabCandidates(this.sim, body, -1)[0];
      if (next !== undefined) return next;
    }
    const corpse = findCorpse(this.sim, body);
    this.followItemId = corpse ? corpse.id : -1;
    this.views.setView('observer', corpse ? itemSubject(this.sim, corpse, this.subj) : null); // no body: fly free above it
    this.observerPrompt = AFTER_DEATH_PROMPT;
    return -1;
  }

  /** A role key finds somebody (the sim would reject the possess command otherwise). */
  roleAvailable(role: PossessRole): boolean {
    return !!antForRole(this.sim, role, this.focus());
  }

  /** Primary / secondary action of the possessed ant's current prompt (GDD 01 §9), null when none. */
  promptTargets(ant: Ant): { primary: PromptTarget | null; secondary: PromptTarget | null } | null {
    try {
      const v = promptView(this.sim, ant);
      return {
        primary: v.primary?.actionId ? { actionId: v.primary.actionId, target: v.primary.target } : null,
        secondary: v.secondary?.actionId ? { actionId: v.secondary.actionId, target: v.secondary.target } : null,
      };
    } catch {
      return null; // a module in progress must not break input handling
    }
  }

  /** Toast for a role key that found nobody (the sim rejects with 'unknown'). */
  static noRoleToast(role: PossessRole): string {
    return TOASTS.noRole(role);
  }

  dispose(): void {
    this.events.detach();
  }
}
