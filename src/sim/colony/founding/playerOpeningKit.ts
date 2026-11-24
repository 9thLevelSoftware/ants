// Test support (task opening-fix item 2; never imported by game code): the player's opening, headless: the same
// commands as beats 04-13 of
// tests/e2e/firstplay.mjs (tests/e2e/lib/firstplay-steps.mjs), issued straight to the sim instead of through
// window.__game: the New colony screen's game for a seed (Lasius, suburban garden, standard, Naturalist, natural
// start), the queen walked to the first diggable site the script's search finds, the shaft and the cell dug with
// the script's bites, the seal (one press of E), four lay batches, the time-lapse to its end, the hand-over
// ("Take a worker") and 30 x 250 ticks waiting for the entrance to open and a worker to walk out.
//
// CLI: tools/sim/opening.ts (node tools/sim/run-ts.mjs tools/sim/opening.ts --seed 2 [--out DIR] [--until 11]);
// long test: playerOpening.long.test.ts.
//
// What cannot match the browser exactly: the browser's LOD observer follows the camera focus (here the possessed
// ant, else the last focus), and its T key is read as a tap (antennate) by the input system (here: antennate, then
// sniff when no read-out shows, exactly the script's fallback). Everything else is the same command sequence.

import type { Vec3 } from '@/core/math/vec3';
import type { Command, PlayerIntent, Sim } from '@/sim/types';
import { createNewGame, defaultGameConfig, syncWorldParams } from '@/sim/createGame';
import { applyRules } from '@/sim/config/rules';
import { createSim } from '@/sim/sim';
import { generateWorld } from '@/worldgen';
import { foundingView } from '@/sim/colony/founding/view';
import { digSpeedAt } from '@/sim/nest';
import { setLocoObserver } from '@/sim/locomotion';
import { stateHash } from '@/sim/save';

// the script's constants (tests/e2e/lib/firstplay-steps.mjs)
const SHAFT_DEPTH_BU = 9;
const SHAFT_MAX_BITES = 260;
const SHAFT_SLOPE_DEG = 55;
const ROOM_MAX_ROUNDS = 4;
const SITE_MAX_R_BU = 120;

/** src/game/possessionEvents.ts EVENT_LOG_SIZE: the debug API's event log is this long. */
const EVENT_LOG_SIZE = 200;

interface Logged { seq: number; tick: number; type: string; ev: Record<string, unknown> }

/** The headless stand-in for window.__game: a sim, an event log with sequence numbers, the LOD focus feed. */
export class Driver {
  readonly log: Logged[] = [];
  private seq = 0;
  private lastFocus: Vec3 | null = null;
  onTick: ((d: Driver) => void) | null = null;
  constructor(readonly sim: Sim) {
    sim.events.onAny((type, payload) => {
      this.log.push({ seq: ++this.seq, tick: sim.state.tick, type: String(type), ev: (payload ?? {}) as Record<string, unknown> });
      if (this.log.length > EVENT_LOG_SIZE) this.log.shift(); // the game's log keeps the last 200 (it decides what the script sees)
    });
  }
  get bu(): number { return this.sim.world.bu; }
  possessed() { return this.sim.stores.ants.get(this.sim.state.player.possessedAntId); }
  /** Game.command on the manual clock: applied at once. */
  command(cmd: Command): void { this.sim.enqueue(cmd); this.sim.applyPendingCommands(); this.sim.events.flush(); }
  act(action: string, phase: 'start' | 'stop' = 'start', target?: unknown): void {
    this.command({ type: 'action', actionId: action, phase, secondary: false, ...(target ? { target } : {}) } as Command);
  }
  setIntent(dir: Vec3 | null): void {
    const intent: PlayerIntent = { dir: { x: 0, y: 0, z: 0 }, hurry: false, grip: false, held: [], flight: null };
    if (dir) { const l = Math.hypot(dir.x, dir.y, dir.z); if (l > 1e-9) { const k = Math.min(1, l) / l; intent.dir = { x: dir.x * k, y: dir.y * k, z: dir.z * k }; } }
    this.sim.setPlayerIntent(intent);
  }
  possessRole(role: 'queen'): void {
    const a = this.possessed() ?? this.sim.stores.ants.get(this.sim.stores.colonies.get(this.sim.state.player.colonyId)?.queenId ?? -1);
    const near = a ? { x: a.pos.x, y: a.pos.y, z: a.pos.z } : this.lastFocus ?? { x: 0, y: 0, z: 0 };
    this.command({ type: 'possess', role, nearPos: near, via: 'role-key', dropTo1x: true } as Command);
  }
  possessId(id: number): void { this.command({ type: 'possess', antId: id, via: 'command', dropTo1x: true } as Command); }
  release(): void { if (this.sim.state.player.possessedAntId !== -1) this.command({ type: 'release', reason: 'player' } as Command); }
  /** SimDriver.step with the LOD observer fed before every tick (Game.startPlaying's beforeTick). */
  step(n: number): void {
    for (let i = 0; i < n; i++) {
      const a = this.possessed();
      const f = a ? a.pos : this.lastFocus;
      if (f && (!this.lastFocus || Math.hypot(f.x - this.lastFocus.x, f.y - this.lastFocus.y, f.z - this.lastFocus.z) > this.bu)) {
        this.lastFocus = { x: f.x, y: f.y, z: f.z };
        setLocoObserver(this.sim, this.lastFocus);
      }
      this.sim.tick();
      this.onTick?.(this);
    }
  }
  lastSeq(): number { return this.seq; }
  events(type: string, since = 0): Logged[] { return this.log.filter((e) => e.seq > since && e.type === type); }
  view() { return foundingView(this.sim); }
  phase() { return this.view()?.phase ?? null; }
  height(x: number, z: number): number { return this.sim.field.height(x, z); }
  dig(x: number, y: number, z: number, pad: number) {
    const p = { x, y, z };
    const prim = this.sim.field.primAt(p, pad);
    return { speed: digSpeedAt(this.sim, this.sim.species.id, p), prim: prim ? prim.material : null };
  }
  nest() { return this.sim.state.nests.find((n) => n.colony === this.sim.state.player.colonyId) ?? this.sim.state.nests[0]; }
}

/** The New colony screen's request for an 8-hex-digit seed code (src/ui/screens/newgame/form.ts + options.ts). */
export function openingSim(seed: number): Sim {
  const preset = defaultGameConfig('lasius-niger', seed, 'naturalist');
  const base = applyRules(preset, {}).config;
  const world = { ...base.world, seedText: String(seed), archetype: 'suburban-garden' as const, sizeClass: 'standard' as const };
  const config = syncWorldParams({ ...base, world, cheats: true });
  const created = createNewGame(config, generateWorld(config.world));
  const sim = createSim(created.state, created.world);
  return sim;
}

/** findSite of firstplay-steps.mjs. */
function findSite(d: Driver, o: Vec3, fromBu: number, toBu: number, stepBu: number) {
  const bu = d.bu, tan = Math.tan((SHAFT_SLOPE_DEG * Math.PI) / 180);
  const clearAbove = (x: number, z: number, gy: number) => [0.3, 1, 2].every((hh) => d.dig(x, gy + hh * bu, z, bu).prim === null);
  for (let r = fromBu; r <= toBu; r += stepBu) {
    const n = Math.max(1, Math.round((2 * Math.PI * r) / stepBu));
    for (let i = 0; i < n; i++) {
      const ph = (i / n) * 2 * Math.PI, sx = o.x + Math.cos(ph) * r * bu, sz = o.z + Math.sin(ph) * r * bu, sy = d.height(sx, sz);
      if (!clearAbove(sx, sz, sy) || d.dig(sx, sy - 2 * bu, sz, bu).speed < 0.5) continue;
      for (let a = 0; a < 16; a++) {
        const th = (a / 16) * 2 * Math.PI, hx = Math.cos(th), hz = Math.sin(th);
        let ok = true;
        for (let u = -3; u <= 9 && ok; u += 0.5) {
          const x = sx + hx * u * bu, z = sz + hz * u * bu, gy = d.height(x, z);
          if (!clearAbove(x, z, gy)) ok = false;
          if (u >= 0 && ok) {
            const dd = d.dig(x, gy - (u * tan + 1) * bu, z, 3 * bu);
            if (dd.speed < 0.5 || dd.prim !== null) ok = false;
            const deep = d.dig(x, gy - 11 * bu, z, 3 * bu);
            if (deep.speed < 0.5 || deep.prim !== null) ok = false;
          }
        }
        if (ok) return { x: sx, y: sy, z: sz, h: { x: hx, y: 0, z: hz }, rBu: r };
      }
    }
  }
  return null;
}

function steerTo(d: Driver, gx: number, gz: number, tol: number, maxSteps = 600): boolean {
  for (let i = 0; i < maxSteps; i++) {
    const p = d.possessed()?.pos;
    if (!p) return false;
    const dx = gx - p.x, dz = gz - p.z, dist = Math.hypot(dx, dz);
    if (dist < tol) { d.setIntent(null); return true; }
    d.setIntent({ x: dx / dist, y: 0, z: dz / dist });
    d.step(dist > 3 * d.bu ? 2 : 1);
  }
  d.setIntent(null);
  return false;
}

function walkDir(d: Driver, ticks: number, v: Vec3): void { d.setIntent(v); d.step(ticks); d.setIntent(null); }

function digBite(d: Driver, slopeDeg: number, ticks: number, hd: Vec3): void {
  const p = d.possessed();
  if (!p) { d.possessRole('queen'); return; }
  const k = 8;
  d.act('dig-bite', 'start', { kind: 'point', id: -1, pos: { x: p.pos.x + hd.x * k, y: p.pos.y - Math.tan((slopeDeg * Math.PI) / 180) * k, z: p.pos.z + hd.z * k } });
  d.step(2);
  d.act('dig-bite', 'stop');
  for (let t = 0; t < ticks; t += 2) { if (!d.sim.stores.ants.get(p.id)?.action) break; d.step(2); }
}

export interface OpeningOptions {
  seed: number; until: string; afterTicks: number;
  onBeat?: (name: string, d: Driver) => void;
  /** Probes: called after every tick. */
  onTick?: (d: Driver) => void;
  /** One line per beat (tick, phase, water, the possessed ant). */
  log?: (line: string) => void;
  /** Called right after "Take a worker" (the CLI's --save-handover snapshot). */
  onHandover?: (sim: Sim) => void;
}

export interface OpeningResult {
  seed: number; beats: string[]; failure: string | null; checks: Record<string, unknown>; hashes: Record<string, string>;
}

/** Runs beats 04-13. Never throws on a failed check: `failure` names it and the run stops there. */
export function runOpening(o: OpeningOptions, sim: Sim = openingSim(o.seed)): { result: OpeningResult; driver: Driver } {
  const d = new Driver(sim);
  d.onTick = o.onTick ?? null;
  const res: OpeningResult = { seed: o.seed, beats: [], failure: null, checks: {}, hashes: {} };
  const bu = d.bu;
  class Fail extends Error {}
  const expect = (c: unknown, msg: string, data?: unknown) => { if (!c) { res.failure = `${msg} ${data === undefined ? '' : JSON.stringify(data).slice(0, 800)}`; throw new Fail(msg); } };
  const beat = (name: string) => {
    res.beats.push(name);
    res.hashes[name] = stateHash(sim.state);
    const water = sim.state.nests.find((n) => n.colony === sim.state.player.colonyId)?.flood.water ?? 0;
    o.log?.(`[opening ${o.seed}] beat ${name} tick ${sim.state.tick} phase ${d.phase()} water ${water.toFixed(3)} possessed ${d.possessed() ? `${d.possessed()!.caste}@${d.possessed()!.pos.x.toFixed(1)},${d.possessed()!.pos.y.toFixed(1)},${d.possessed()!.pos.z.toFixed(1)}` : 'none'}`);
    o.onBeat?.(name, d);
    if (o.until && name.startsWith(o.until)) throw new Fail('until');
  };
  try {
    // Game.startPlaying: possess the queen (auto), then the script's step(1) and beat 03
    d.command({ type: 'possess', role: 'queen', nearPos: { ...sim.world.queenStart.pos }, via: 'auto', dropTo1x: true } as Command);
    expect(d.phase() === 'intro-card', 'a new game starts on the intro card', d.phase());
    d.step(1);
    beat('03-world-intro-card');
    d.command({ type: 'openingSkipIntro' } as Command);
    d.step(1);
    expect(d.phase() === 'dealation', 'the intro card did not close', d.phase());
    d.step(85);
    expect(d.phase() === 'search', 'dealation did not end in search', d.phase());
    beat('04-queen-surface');

    const q0 = d.possessed()!.pos;
    const start = { x: q0.x, y: q0.y, z: q0.z };
    const site = findSite(d, start, 2, SITE_MAX_R_BU, 1);
    expect(site, 'no diggable founding site', start);
    const H = site!.h;
    expect(steerTo(d, site!.x - H.x * 1.5 * bu, site!.z - H.z * 1.5 * bu, 0.8 * bu), 'the queen did not reach the site', site);
    walkDir(d, 2, H);
    d.step(5);
    d.act('antennate');
    d.step(20);
    let v = d.view()!;
    if (!(v.site && v.site.active)) { d.act('sniff'); d.step(20); v = d.view()!; }
    expect(v.site && v.site.active, 'no site read-out after sniffing', v.site);
    res.checks.site = { x: site!.x, z: site!.z, h: H, rBu: site!.rBu, q: v.site!.q, word: v.site!.word };
    beat('05-site-readout');

    const mouth = { ...d.possessed()!.pos };
    const depthBu = (p: Vec3) => (mouth.y - p.y) / bu;
    for (let k = 0; k < 6 && d.phase() === 'search'; k++) {
      digBite(d, SHAFT_SLOPE_DEG, 30, H);
      if (d.phase() === 'search') walkDir(d, 2, H);
    }
    expect(d.phase() === 'dig', 'the first bite did not start the dig', d.phase());
    let bites = 1, depth = 0, depthBar = 0, best = 0, bestAt = 0, shotMound = false, shotShaft = false;
    while (bites < SHAFT_MAX_BITES && (depthBar < 1 || depth < SHAFT_DEPTH_BU - 2) && bites - bestAt < 60) {
      const seq0 = d.lastSeq();
      digBite(d, SHAFT_SLOPE_DEG, 30, H);
      const failed = d.events('action-failed', seq0).filter((e) => e.ev.reason !== 'blocked').slice(-5).length;
      if (failed > 0) walkDir(d, 3, H);
      bites++;
      depth = depthBu(d.possessed()!.pos);
      depthBar = d.view()!.readiness?.depth ?? 0;
      if (depth > best + 0.1) { best = depth; bestAt = bites; }
      if (!shotMound && depth > 3) {
        shotMound = true;
        d.release();
        beat('06-digging-entrance-mound');
        d.possessRole('queen');
        d.step(2);
      }
      if (!shotShaft && depth > 5.5) { shotShaft = true; beat('07-inside-shaft'); }
    }
    res.checks.shaft = { bites, depthBu: depth, depthBar };
    expect(depthBar >= 1, 'the shaft did not get deep enough', res.checks.shaft);

    const rot = (deg: number) => { const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180); return { x: H.x * c - H.z * s, y: 0, z: H.x * s + H.z * c }; };
    const centre = { ...d.possessed()!.pos };
    for (let r = 0; r < ROOM_MAX_ROUNDS && d.phase() === 'dig'; r++) {
      for (let k = 0; k < 8; k++) {
        if (d.phase() !== 'dig') break;
        const dir = rot(k * 45 + (r % 2) * 22.5);
        steerTo(d, centre.x, centre.z, 0.4 * bu);
        walkDir(d, 1, dir);
        for (let b = 0; b < 2; b++) digBite(d, 3, 40, dir);
      }
      d.step(60);
    }
    v = d.view()!;
    res.checks.readiness = v.readiness;
    expect(v.phase === 'seal', 'the founding cell never became ready', { phase: v.phase, readiness: v.readiness });
    beat('08-founding-chamber');

    d.act('dig-bite', 'stop');
    d.step(20);
    d.act('seal-entrance');
    for (let t = 0; t < 3000 && d.phase() === 'seal'; t += 50) d.step(50);
    for (let i = 0; i < 5 && d.phase() === 'seal'; i++) d.step(20);
    res.checks.seal = { entrances: d.nest().entrances.map((e) => `${e.status}:${e.plugVoxelCount ?? ''}`) };
    expect(d.phase() === 'lay', 'the entrance was not sealed', res.checks.seal);
    beat('09-sealed');

    for (let i = 0; i < 40; i++) { if (depthBu(d.possessed()!.pos) >= SHAFT_DEPTH_BU - 1) break; walkDir(d, 3, H); }
    const layBatch = () => { d.act('lay-egg'); d.step(50); d.act('lay-egg', 'stop'); d.step(5); };
    for (let b = 0; b < 4; b++) layBatch();
    v = d.view()!;
    if (!v.clutch || v.clutch.eggs === 0) {
      const cell = d.nest().chambers.find((c) => c.type === 'founding');
      for (let i = 0; i < 3 && cell && (!v.clutch || v.clutch.eggs === 0); i++) {
        steerTo(d, cell.center.x, cell.center.z, 0.6 * bu);
        for (let b = 0; b < 4; b++) layBatch();
        v = d.view()!;
      }
    }
    res.checks.clutch = v.clutch;
    expect(v.clutch && v.clutch.eggs >= 6, 'no eggs laid', v.clutch);
    beat('10-first-clutch');

    // "Tend the brood": FoundingFlow.beginLapse
    if (d.phase() === 'lay') d.command({ type: 'openingBeginTimelapse' } as Command);
    res.hashes['lapse-start'] = stateHash(sim.state); // the browser's FIRSTPLAY_DUMP 'lapse-start' (before the step)
    d.step(1);
    expect(d.phase() === 'timelapse', 'Tend the brood did not start the time-lapse', d.phase());
    let relay = 0;
    for (let i = 0; i < 400; i++) {
      const t = d.view()!.timelapse;
      if (t && t.counters.larvae > 0) break;
      if (!t) {
        if (d.phase() !== 'lay' || relay >= 2) break;
        relay++;
        for (let b = 0; b < 4; b++) layBatch();
        // the script waits for the tend button (flowView canBeginLapse: lay phase with eggs)
        for (let k = 0; k < 120 && !((d.view()?.clutch?.eggs ?? 0) > 0) && d.phase() === 'lay'; k++) { layBatch(); d.step(25); }
        if (d.phase() === 'lay') d.command({ type: 'openingBeginTimelapse' } as Command);
        d.step(1);
        continue;
      }
      d.step(50);
    }
    res.checks.relayClutches = relay;
    expect(d.phase() === 'timelapse', 'beat 11: the lapse is not on screen', { phase: d.phase(), opening: lapseEnd(sim) });
    beat('11-timelapse');
    // skip: one tick at a time to the lapse's end (FoundingFlow.skipLapse on the manual clock)
    for (let n = 0; n < 400000 && d.phase() === 'timelapse'; n++) d.step(1);
    d.step(1);
    v = d.view()!;
    res.checks.outcome = v.outcome;
    expect(v.phase === 'handover' || v.phase === 'done', 'skip did not end the lapse', { phase: v.phase, opening: lapseEnd(sim) });
    beat('12-outcome-card');
    d.step(1); // closeOutcome, then the script's step(1)

    // "Take a worker" (FoundingFlow.takeWorker: the first living worker of the player's colony)
    const col = sim.state.player.colonyId;
    const w = sim.state.ants.find((a) => a.alive && a.colony === col && a.caste === 'worker');
    if (w) d.possessId(w.id); else d.release();
    o.onHandover?.(sim);
    d.step(2);
    res.checks.afterHandover = { possessed: d.possessed()?.caste ?? null, possessedId: sim.state.player.possessedAntId, handoverTick: sim.state.tick };
    const outside = () => {
      const n = d.nest();
      return sim.state.ants.some((a) => a.alive && a.caste === 'worker' && a.colony === col && d.height(a.pos.x, a.pos.z) - a.pos.y < 0.5 * bu
        && n.entrances.every((e) => Math.hypot(a.pos.x - e.pos.x, a.pos.z - e.pos.z) > 3 * bu));
    };
    let opened = false, outOk = false, openedTick = -1, outTick = -1;
    const t0 = sim.state.tick;
    const total = Math.max(250, o.afterTicks);
    for (let i = 0; i < Math.ceil(total / 250) && !(opened && outOk); i++) {
      d.step(250);
      if (!opened && d.nest().entrances.some((e) => e.status === 'open')) { opened = true; openedTick = sim.state.tick - t0; }
      if (opened && !outOk && outside()) { outOk = true; outTick = sim.state.tick - t0; }
    }
    res.checks.reopened = { opened, outside: outOk, openedAfterTicks: openedTick, outsideAfterTicks: outTick, phase: d.phase(), entrances: d.nest().entrances.map((e) => `${e.status}:${e.plugVoxelCount}`) };
    expect(opened && outOk, 'the first workers did not reopen the entrance and walk out', res.checks.reopened);
    beat('13-first-workers-entrance');
  } catch (e) {
    if (!(e instanceof Fail)) throw e;
  }
  return { result: res, driver: d };
}

/** The opening record's end of the lapse (why a lapse ended): phase, failure, hazard log tail. */
export function lapseEnd(sim: Sim): unknown {
  const op = sim.state.player.opening;
  if (!op) return null;
  return { phase: op.phase, lapse: op.lapse, hazards: op.hazardLog.slice(-6), tick: sim.state.tick };
}

