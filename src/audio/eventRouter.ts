// Turns simulation events into sounds (the `sound` rows of eventMap.ts). It reads the sim for positions the events do
// not carry (an ant, a creature, a nest entrance) and calls an AudioSink, so the whole mapping is testable in Node
// with a recording sink. Sim `cue` events pass through here too, for three rules the cue table cannot express:
//   - a `bite` is a hit or a whiff, and a hit crunches only on hard prey (decided from the target the sim names in the
//     `combat-hit` that precedes it; the cue's own strength is the fallback),
//   - a dig bite is emitted twice per bite (nest/bite.ts's `dig-bite.<material>` at the carve hit, then the action
//     runner's plain `dig-bite` at the ant, straight after the effect): the plain one that follows a material one
//     is dropped, wherever the two sit,
//   - the alarm shimmer follows the alarm setting.
// Any other duplicate (a `lay-egg` cue and the `egg-laid` event of the same ant) is dropped by (tick, cue, exact
// place): one ant is at one place within a tick, and two ants are not, so neighbours' sounds stay separate.
//
// Events do not carry the position of the body they are about, and the sim delivers them after its end-of-tick sweep,
// so a body that died is already out of the stores. For creatures (the only dead body the router sounds) `track()`
// keeps the last place seen each frame. A positional sound whose position is unknown is dropped rather than played
// flat at full gain.
import type { Vec3 } from '@/core/math/vec3';
import { CASTE_COMBAT_OVERRIDES } from '@/sim/balance/combat';
import { CREATURE_STATS } from '@/sim/balance/creatures';
import type { Sim, SimEvent, SimEventOf } from '@/sim/types';
import type { HumanEventKind } from '@/sim/types/ids';
import { TICKS_PER_SECOND } from '@/sim/time';
import type { MusicTrigger } from './music/compose';
import type { UiSoundId } from './uiSounds';
import { EVENT_ROUTER, EVENT_STRENGTH as STRENGTH } from './tuning';

export interface CueExtra { delayS?: number; gainDb?: number }

/** What the router needs from the audio runtime. */
export interface AudioSink {
  cue(cue: string, pos: Vec3 | null, strength: number, material?: string | null, extra?: CueExtra): void;
  ui(id: UiSoundId, extraDb?: number): void;
  giantTelegraph(instId: number, kind: HumanEventKind, origin: Vec3, toImpactS: number): void;
  giantStart(instId: number, kind: HumanEventKind, variant: string | null): void;
  giantImpact(instId: number, kind: HumanEventKind, footprint: Vec3, contact: string): void;
  giantEnd(instId: number): void;
  thunder(delayS: number, intensity: number): void;
  musicTrigger(kind: MusicTrigger): void;
  /** Gain, dB, that a surface sound loses at the listener (0 on the surface, negative underground). */
  surfaceDb(): number;
}

export interface RouterOptions {
  /** The alarm shimmer setting (default on). */
  alarmShimmer: () => boolean;
}

type Ev<K extends SimEvent['type']> = SimEventOf<K>;

interface Recent { tick: number; family: string; x: number; y: number; z: number; flat: boolean }

const WOOD_FAMILY = 'dig';

function familyOf(cue: string): string {
  return cue.startsWith('dig-bite') || cue === 'wood-chew' ? WOOD_FAMILY : cue;
}

export class EventRouter {
  private recent: Recent[] = [];
  private recentTick = -1;
  /** Last place each creature was seen, and the frame it was last seen in (see track()). */
  private readonly seen = new Map<number, { pos: Vec3; frame: number }>();
  private frame = 0;
  /** Tick of the last `dig-bite.<material>` whose runner cue has not been seen yet (-1: none). */
  private digPairTick = -1;
  private hit: { tick: number; targetId: number } | null = null;
  private lastFlood = new Map<number, number>();
  private lastPuddleTick = -1e9;
  private lastSubmergedTick = -1e9;
  private readonly opts: RouterOptions;

  constructor(private readonly sink: AudioSink, opts?: Partial<RouterOptions>) {
    this.opts = { alarmShimmer: () => true, ...opts };
  }

  /** Forget per-game state (a new game attached). */
  reset(): void {
    this.recent.length = 0;
    this.recentTick = -1;
    this.seen.clear();
    this.digPairTick = -1;
    this.hit = null;
    this.lastFlood.clear();
    this.lastPuddleTick = -1e9;
    this.lastSubmergedTick = -1e9;
  }

  /**
   * Call once per frame, before that frame's events are handled: remembers where the creatures are, so the death of
   * one that the sweep has already removed still sounds where it was (a creature seen last frame is kept for this
   * frame's events and forgotten after).
   */
  track(sim: Sim): void {
    const frame = ++this.frame;
    for (const c of sim.stores.creatures.list) {
      if (!c.alive) continue;
      const o = this.seen.get(c.id);
      if (o) { o.pos.x = c.pos.x; o.pos.y = c.pos.y; o.pos.z = c.pos.z; o.frame = frame; }
      else this.seen.set(c.id, { pos: { x: c.pos.x, y: c.pos.y, z: c.pos.z }, frame });
    }
    for (const [id, o] of this.seen) if (o.frame < frame - 1) this.seen.delete(id);
  }

  /** Handles an event that came out of the sim at `tick`. Events that are not the router's are ignored. */
  handle(sim: Sim, e: SimEvent, tick: number): void {
    const at = this.where(sim, e) ?? null;
    switch (e.type) {
      case 'action-failed': this.digPairTick = -1; break;
      case 'cue': this.simCue(sim, e, tick); break;
      case 'combat-hit': if (e.kind === 'bite') this.hit = { tick, targetId: e.targetId }; break;

      // ---- human events and weather
      case 'human.telegraph': {
        const speed = Math.max(1, sim.state.env.time.speed);
        this.sink.giantTelegraph(e.instId, e.kind, e.origin, (e.impactTick - sim.state.tick) / TICKS_PER_SECOND / speed);
        break;
      }
      case 'human.start': this.sink.giantStart(e.instId, e.kind, e.variant); break;
      case 'human.impact': this.sink.giantImpact(e.instId, e.kind, e.footprint, e.contact); break;
      case 'human.end': case 'human.cancelled': this.sink.giantEnd(e.instId); break;
      case 'human.bait-placed': this.sink.cue('giant.bait-station', e.pos, 1); break;
      case 'human.bait-removed': this.sink.cue('giant.bait-station', e.pos, 1, null, { gainDb: EVENT_ROUTER.baitRemovedDb }); break;
      case 'weather.thunder': this.sink.thunder(e.delayS, e.intensity); break;
      case 'weather.gust': {
        const k = Math.min(1, Math.max(EVENT_ROUTER.gustMinStrength, (e.windMs - EVENT_ROUTER.gustCalmMs) / EVENT_ROUTER.gustSpanMs));
        this.sink.cue('ev.gust', null, k, null, { gainDb: this.sink.surfaceDb() });
        break;
      }
      case 'weather.changed': this.rainOnset(e); break;
      case 'weather.puddle':
        if (e.cellsAdded > 0 && tick - this.lastPuddleTick >= EVENT_ROUTER.puddleMinTicks) {
          this.lastPuddleTick = tick;
          this.sink.cue('water-trickle', null, STRENGTH['weather.puddle'], null, { gainDb: EVENT_ROUTER.puddleDb + this.sink.surfaceDb() });
        }
        break;

      // ---- creatures
      case 'predator-telegraph': this.playAt(sim, tick, 'creature-step', at, STRENGTH['predator-telegraph']); break;
      case 'predator-strike': this.playAt(sim, tick, 'ev.strike', at, e.hit ? STRENGTH['predator-strike'] : STRENGTH['predator-strike-miss']); break;
      case 'ant-seized': this.playAt(sim, tick, 'grapple', at, STRENGTH['ant-seized']); break;
      case 'antlion-grab': this.playAt(sim, tick, 'antlion-flick', at, STRENGTH['antlion-grab']); break;
      case 'bird-approach': this.play(sim, tick, 'ev.bird-whoosh', e.pos, STRENGTH['bird-approach']); break;
      case 'bird-left': this.play(sim, tick, 'ev.bird-whoosh', e.pos, STRENGTH['bird-left']); break;
      case 'creature-died': this.playAt(sim, tick, 'creature-step', at, STRENGTH['creature-died']); break;
      case 'phorid-strike': this.playAt(sim, tick, 'wing-buzz', at, STRENGTH['phorid-strike']); break;

      // ---- combat and rivals
      case 'combat-lock': this.playAt(sim, tick, 'grapple', at, STRENGTH['combat-lock']); break;
      case 'combat-pin': this.playAt(sim, tick, 'grapple', at, STRENGTH['combat-pin']); break;
      case 'combat-spray': this.play(sim, tick, 'acid-spray', e.pos, STRENGTH['combat-spray']); break;
      case 'rival-encounter':
        this.play(sim, tick, e.outcome === 'fight' ? 'grapple' : 'antennate', e.pos, e.outcome === 'withdraw' ? STRENGTH['rival-withdraw'] : STRENGTH['rival-encounter']);
        break;
      case 'rival-discovered':
        this.play(sim, tick, 'antennate', e.pos, STRENGTH['rival-discovered']);
        this.sink.cue('antennate', e.pos, EVENT_ROUTER.discoverEchoStrength, null, { delayS: EVENT_ROUTER.discoverEchoDelayS });
        break;
      case 'rival-raid-started': {
        const door = this.nestEntrance(sim, e.target);
        if (!door) break;
        for (let i = 0; i < EVENT_ROUTER.raidScuffles; i++) this.sink.cue('grapple', door, EVENT_ROUTER.raidScuffleStrength, null, { delayS: i * EVENT_ROUTER.raidScuffleGapS });
        break;
      }
      case 'brood-raided': {
        const door = this.nestEntrance(sim, e.from);
        if (!door) break;
        const n = Math.min(EVENT_ROUTER.broodRaidMaxSounds, Math.max(1, e.count));
        for (let i = 0; i < n; i++) this.sink.cue('pick-up', door, EVENT_ROUTER.broodRaidStrength, null, { delayS: i * EVENT_ROUTER.broodRaidGapS });
        break;
      }

      // ---- nest, water, soil
      case 'flood-started': this.playAt(sim, tick, 'flood', this.chamberCenter(sim, e.nestId, e.chambers[0]), STRENGTH['flood-started']); break;
      case 'flood-level': {
        const last = this.lastFlood.get(e.nestId) ?? -1e9;
        if (tick - last < EVENT_ROUTER.floodLevelMinTicks) break;
        this.lastFlood.set(e.nestId, tick);
        this.playAt(sim, tick, 'water-trickle', this.chamberCenter(sim, e.nestId, e.chambers[0]), STRENGTH['flood-level']);
        break;
      }
      case 'ant-submerged':
        if (tick - this.lastSubmergedTick < EVENT_ROUTER.submergedMinTicks) break;
        this.lastSubmergedTick = tick;
        this.play(sim, tick, 'flood', e.pos, STRENGTH['ant-submerged']);
        break;
      case 'world.cave-in': this.play(sim, tick, 'mound-slump', e.center, STRENGTH['world.cave-in']); break;
      case 'founding-sealed': this.playAt(sim, tick, 'seal-tamp', this.entrancePos(sim, e.nestId, e.entranceId), STRENGTH['founding-sealed']); break;
      case 'egg-laid': this.playAt(sim, tick, 'lay-egg', at, STRENGTH['egg-laid']); break;
      case 'queen.egg-eaten': this.playAt(sim, tick, 'bite', at, STRENGTH['queen.egg-eaten']); break;
      case 'pellet-expelled': this.play(sim, tick, 'pellet-drop', e.pos, STRENGTH['pellet-expelled']); break;
      case 'pellet-dumped': this.playAt(sim, tick, 'pellet-drop', at, STRENGTH['pellet-dumped']); break;
      case 'waste-dumped': this.playAt(sim, tick, 'frass-drop', at, STRENGTH['waste-dumped']); break;
      case 'corpse-removed': this.playAt(sim, tick, 'drop', at, STRENGTH['corpse-removed']); break;
      case 'frass-ejected': this.play(sim, tick, 'frass-drop', e.pos, STRENGTH['frass-ejected']); break;

      // ---- species
      case 'drum': this.play(sim, tick, 'drum', e.pos, STRENGTH['drum']); break;
      case 'seed-milled': this.playAt(sim, tick, 'seed-crack', at, STRENGTH['seed-milled']); break;
      case 'radicle-gnawed': this.playAt(sim, tick, 'seed-crack', at, STRENGTH['radicle-gnawed']); break;
      case 'honeydew-relay': this.playAt(sim, tick, 'trophallaxis', at, STRENGTH['honeydew-relay']); break;
      case 'flight.launched': this.sink.cue('wing-buzz', null, STRENGTH['flight.launched']); break;

      // ---- interface-level moments
      case 'opening.timelapse': if (e.kind === 'start' || e.kind === 'end') this.sink.ui('page'); break;
      case 'overwinter.begin': this.sink.ui('page'); break;
      case 'overwinter.end': this.sink.ui('page'); this.sink.musicTrigger('timelapse-end'); break;
      case 'aim.completed': this.sink.ui('toggle'); break;
      case 'codex.unlocked': this.sink.ui('page'); break;
      case 'time.phase': if (e.phase === 'dawn' || e.phase === 'dusk') this.sink.musicTrigger(e.phase); break;
      default: break;
    }
  }

  // ---- sim cues ----------------------------------------------------------------------------------------------

  private simCue(sim: Sim, e: Ev<'cue'>, tick: number): void {
    if (e.cue === 'alarm-burst' && !this.opts.alarmShimmer()) return;
    if (e.cue === 'bite') { this.bite(sim, e, tick); return; }
    if (e.cue === 'dig-bite' && this.digPairTick === tick) { this.digPairTick = -1; return; } // the runner's twin of a material cue
    this.play(sim, tick, e.cue, e.pos, e.strength);
    if (e.cue.startsWith('dig-bite.')) this.digPairTick = tick;
  }

  /** A bite is a hit (paired with the `combat-hit` of the same tick) or a whiff; only a hard target crunches. */
  private bite(sim: Sim, e: Ev<'cue'>, tick: number): void {
    const h = this.hit && this.hit.tick === tick ? this.hit : null;
    this.hit = null;
    if (!h) {
      if (e.strength > 0) this.play(sim, tick, 'bite', e.pos, e.strength); // a hit whose combat-hit did not arrive: trust the cue
      else this.play(sim, tick, 'bite', e.pos, 0, { gainDb: EVENT_ROUTER.whiffDb });
      return;
    }
    this.play(sim, tick, 'bite', e.pos, this.hardness(sim, h.targetId) ?? e.strength);
  }

  /**
   * Armour 0..1 of the bitten body, from the balance tables the sim reads (creature kinds, per-caste combat
   * overrides; everything else has none), null when the target is gone. Read from data, not from the sim's combat
   * module: importing that from the audio would tie the two modules' load order together.
   */
  private hardness(sim: Sim, id: number): number | null {
    const c = sim.stores.creatures.get(id);
    if (c) return CREATURE_STATS[c.kind]?.armour ?? null;
    const a = sim.stores.ants.get(id);
    if (!a) return null;
    const species = sim.stores.colonies.get(a.colony)?.species ?? sim.species.id;
    return CASTE_COMBAT_OVERRIDES[`${species}:${a.caste}`]?.armour ?? null;
  }

  // ---- helpers -----------------------------------------------------------------------------------------------

  /** Plays through the sink unless the same cue family already sounded this tick at exactly this place. */
  private play(sim: Sim, tick: number, cue: string, pos: Vec3 | null, strength: number, extra?: CueExtra): void {
    if (this.duplicate(sim.world.bu, tick, cue, pos)) return;
    this.sink.cue(cue, pos, strength, null, extra);
  }

  /** A sound of a body at a place: with no place to hear it from (the body is gone), it is not played. */
  private playAt(sim: Sim, tick: number, cue: string, pos: Vec3 | null, strength: number, extra?: CueExtra): void {
    if (pos) this.play(sim, tick, cue, pos, strength, extra);
  }

  /**
   * One ant is at one place within a tick, so the same cue family at the same place in the same tick is one sound
   * (the sim's cue and the event that report the same act); a neighbour's is a different sound.
   */
  private duplicate(bu: number, tick: number, cue: string, pos: Vec3 | null): boolean {
    if (tick !== this.recentTick) { this.recent.length = 0; this.recentTick = tick; }
    const family = familyOf(cue);
    const p = pos ?? { x: 0, y: 0, z: 0 };
    const r = EVENT_ROUTER.samePlaceBu * bu;
    for (const o of this.recent) {
      if (o.family !== family || o.flat !== (pos === null)) continue;
      if (pos === null || Math.hypot(o.x - p.x, o.y - p.y, o.z - p.z) <= r) return true;
    }
    this.recent.push({ tick, family, x: p.x, y: p.y, z: p.z, flat: pos === null });
    return false;
  }

  private rainOnset(e: Ev<'weather.changed'>): void {
    if (e.from === e.to || (e.to !== 'rain' && e.to !== 'storm')) return;
    if (e.from === 'rain' || e.from === 'storm') return;
    const R = EVENT_ROUTER;
    const strength = e.to === 'storm' ? R.onsetStorm : e.intensityClass === 'downpour' ? R.onsetDownpour : e.intensityClass === 'shower' ? R.onsetShower : R.onsetLight;
    for (let i = 0; i < R.onsetDrops; i++) {
      this.sink.cue('raindrop-hit', null, strength, null, { delayS: R.onsetFirstS + i * R.onsetGapS, gainDb: this.sink.surfaceDb() });
    }
  }

  /** Where the body an event is about is: undefined if it is not about one in the sim's stores, null if it is gone. */
  private where(sim: Sim, e: SimEvent): Vec3 | null | undefined {
    switch (e.type) {
      case 'predator-telegraph': return this.creaturePos(sim, e.creatureId) ?? e.aimPoint;
      case 'predator-strike': return this.creaturePos(sim, e.creatureId) ?? this.antPos(sim, e.targetId);
      case 'creature-died': return this.creaturePos(sim, e.id);
      case 'ant-seized': case 'antlion-grab': case 'phorid-strike': case 'waste-dumped': case 'corpse-removed':
      case 'seed-milled': case 'radicle-gnawed': return this.antPos(sim, e.antId);
      case 'combat-lock': case 'combat-pin': return this.antPos(sim, e.holderId);
      case 'egg-laid': case 'queen.egg-eaten': return this.antPos(sim, e.queenId);
      case 'honeydew-relay': return this.antPos(sim, e.fromAnt);
      case 'pellet-dumped': return this.itemPos(sim, e.itemId);
      default: return undefined;
    }
  }

  private antPos(sim: Sim, id: number): Vec3 | null { return sim.stores.ants.get(id)?.pos ?? null; }
  private creaturePos(sim: Sim, id: number): Vec3 | null { return sim.stores.creatures.get(id)?.pos ?? this.seen.get(id)?.pos ?? null; }
  private itemPos(sim: Sim, id: number): Vec3 | null { return sim.stores.items.get(id)?.pos ?? null; }

  private chamberCenter(sim: Sim, nestId: number, chamberId: number | undefined): Vec3 | null {
    const n = sim.state.nests.find((x) => x.id === nestId);
    if (!n) return null;
    const c = (chamberId !== undefined ? n.chambers.find((ch) => ch.id === chamberId) : undefined) ?? n.chambers[0];
    return c ? c.center : (n.entrances[0]?.pos ?? null);
  }

  private entrancePos(sim: Sim, nestId: number, entranceId: number): Vec3 | null {
    const n = sim.state.nests.find((x) => x.id === nestId);
    return n?.entrances.find((en) => en.id === entranceId)?.pos ?? n?.entrances[0]?.pos ?? null;
  }

  /** First entrance of the nests a colony owns. */
  private nestEntrance(sim: Sim, colonyId: number): Vec3 | null {
    for (const n of sim.state.nests) if (n.colony === colonyId && n.entrances[0]) return n.entrances[0].pos;
    return null;
  }
}
