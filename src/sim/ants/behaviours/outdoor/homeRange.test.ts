// sim-fix-ants item 5: passive home-range marking (GDD 02 §8.2 HOME_DEPOSIT 0.04 ph per BU walked by every colony
// ant outside) had no owner, so the scouts' bias away from home-marked ground (GDD 02 §10.1, HOME_EXPLORED) never
// acted. The colony's own walking now marks the ground around the entrance, and scouts there turn away from home.
import { describe, expect, it } from 'vitest';
import { HOME_DEPOSIT_PER_BU, HOME_EXPLORED } from '@/sim/balance/pheromone';
import { requestTask } from '@/sim/colony';
import { navTo } from '@/sim/locomotion';
import { perceiveNow, homeHere } from '@/sim/ants/perception';
import { PC } from '@/sim/ants/perception/keys';
import { bestHeading } from './phaseScout';
import { forageScenario } from './testkit';

describe('passive home marks (GDD 02 §8.2) and the scout bias (§10.1)', () => {
  it('an ant walking outside lays HOME_DEPOSIT_PER_BU ph per BU on its colony home channel', () => {
    const { sim, entrance, col } = forageScenario({ workers: 1, seed: 3 });
    const bu = sim.world.bu;
    const a = sim.stores.ants.list.find((x) => x.caste === 'worker')!;
    sim.enqueue({ type: 'cheat.teleport', antId: a.id, pos: { x: entrance.pos.x + 30 * bu, y: 0, z: entrance.pos.z } });
    sim.tick();
    a.thinkTick = 1e9; // no behaviour: just the walk
    let laid = 0;
    const deposit = sim.phero.deposit.bind(sim.phero);
    sim.phero.deposit = (colony, ch, p, amount) => { if (ch === 'home' && colony === col.id) laid += amount; deposit(colony, ch, p, amount); };
    const from = { ...a.pos };
    navTo(sim, a, { x: from.x + 40 * bu, y: 0, z: from.z }, bu);
    let walked = 0;
    for (let t = 0; t < 300 && a.nav.status === 'moving'; t++) {
      sim.tick();
      walked += Math.hypot(a.pos.x - a.prevPos.x, a.pos.y - a.prevPos.y, a.pos.z - a.prevPos.z);
    }
    expect(walked / bu).toBeGreaterThan(30);
    expect(laid).toBeCloseTo(HOME_DEPOSIT_PER_BU * (walked / bu), 0);
    expect(laid / (HOME_DEPOSIT_PER_BU * (walked / bu))).toBeGreaterThan(0.85);
    expect(sim.phero.sample(col.id, 'home', a.pos)).toBeGreaterThan(0);
  });

  it('a scout on home-marked ground near the entrance turns away from home (memory and position set by the test)', () => {
    // direction 28: the scout's surroundings are set here, not by a run of free foraging, so the assertion does not
    // move with every change of trajectory: home marks laid around the entrance as the colony's walking lays them,
    // the whole map explored (the scout's frontier term is then the same in every direction), one scout at the probe
    const { sim, entrance, col } = forageScenario({ workers: 4, seed: 5 });
    const bu = sim.world.bu;
    for (let r = 2; r <= 20; r += 2) for (let k = 0; k < 16; k++) {
      const a = (k / 16) * 2 * Math.PI, x = entrance.pos.x + r * bu * Math.cos(a), z = entrance.pos.z + r * bu * Math.sin(a);
      sim.phero.deposit(col.id, 'home', { x, y: sim.field.height(x, z), z }, 40 * HOME_DEPOSIT_PER_BU);
    }
    col.exploredBits = new Uint8Array(Math.max(col.exploredBits.length, 1 << 16)).fill(255);
    const probe = { x: entrance.pos.x + 8 * bu, y: 0, z: entrance.pos.z };
    probe.y = sim.field.height(probe.x, probe.z);
    const home = sim.phero.sample(col.id, 'home', probe);
    expect(home, 'home ph near the entrance').toBeGreaterThan(HOME_EXPLORED);
    const s = sim.stores.ants.list.find((x) => x.caste === 'worker')!;
    requestTask(sim, s, 'scout', 'job:test');
    sim.enqueue({ type: 'cheat.teleport', antId: s.id, pos: probe });
    sim.tick();
    perceiveNow(sim, s);
    expect(homeHere(s)).toBeGreaterThan(HOME_EXPLORED);
    // heading straight home (west, angle pi): the leg chosen on marked ground turns further away from home than the
    // same choice on unmarked ground (the scout's perceived home reading zeroed), over the same candidate draws
    const n = 80, awayCos = (h: number) => Math.cos(h); // away from the entrance = east = angle 0
    let marked = 0, unmarked = 0;
    const reading = homeHere(s);
    for (let i = 0; i < n; i++) marked += awayCos(bestHeading(sim, s, s.pos, Math.PI, 0.4));
    s.bb[PC.home] = 0;
    for (let i = 0; i < n; i++) unmarked += awayCos(bestHeading(sim, s, s.pos, Math.PI, 0.4));
    s.bb[PC.home] = reading;
    expect(marked / n - unmarked / n).toBeGreaterThan(0.1);
  }, 120_000);
});
