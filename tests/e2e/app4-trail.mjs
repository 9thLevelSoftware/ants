// app-seams-4 fix pass, item 7 (the trail beat 13 -> 14 on a colony whose larder is full): explores a stored hand-over (firstplay's FIRSTPLAY_CHECKPOINT) without
// the founding: what the colony needs, what it stores, which sources it knows, whether a trail forms to a source of the nutrient it needs.
//   APP4_TRAIL_SAVE=test-output/app4-fix/s3-handover.save APP4_TRAIL_FOOD=sugar|protein node tools/harness/play.mjs --root . --query "test=1&quality=test&seed=3&autostart=1" \
//     --script tests/e2e/app4-trail.mjs --out test-output/app4-fix/trail --script-timeout 3000000
import fs from 'node:fs';

export default async ({ page, log }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const step = (n) => g((k) => window.__game.step(k), n);
  await page.waitForFunction(() => window.__game?.summary().mode === 'playing', null, { timeout: 600000, polling: 250 });
  const r = await g((t) => window.__game.saves.importText(t, 'now'), fs.readFileSync(process.env.APP4_TRAIL_SAVE, 'utf8'));
  log('import', JSON.stringify(r));
  await page.waitForFunction(() => window.__game.summary().mode === 'playing', null, { timeout: 600000, polling: 250 });
  await step(2);
  const state = () => g(() => {
    const sim = window.__hud.game.session.sim, col = sim.state.colonies.find((c) => c.isPlayer);
    const q = window.__game.query;
    return {
      tick: sim.state.tick, needs: col.needs && { needC: col.needs.needC, needP: col.needs.needP, sC: col.needs.sC, sP: col.needs.sP },
      workers: q.ants().filter((a) => a.caste === 'worker' && a.colony === col.id).length,
      known: col.knownSourceIds?.length ?? null, growth: q.growth(), alerts: (window.__game.summary().alerts ?? []).map((a) => a.kind),
      stores: window.__game.summary().stores ?? null,
    };
  });
  log('state0', JSON.stringify(await state()));
  const nest = await g(() => window.__game.query.nest()[0]);
  const ent = nest.entrances.find((e) => e.status === 'open') ?? nest.entrances[0];
  const bu = await g(() => window.__game.query.world().bu);
  log('sources before', JSON.stringify((await g(() => window.__game.query.sources())).map((s) => ({ id: s.id, kind: s.kind, variant: s.variant, units: Math.round(s.units), d: 0, pos: [Math.round(s.pos.x), Math.round(s.pos.z)] })).slice(0, 30)));
  // spill 22 BU from the entrance in the first open direction
  let spot = null;
  for (let k = 0; k < 16 && !spot; k++) {
    const th = 0.7 + (k * Math.PI) / 8, x = ent.pos.x + Math.cos(th) * 22 * bu, z = ent.pos.z + Math.sin(th) * 22 * bu;
    const f = await g(([x, z]) => window.__game.query.field(x, 0, z), [x, z]);
    const dig = await g(([x, y, z]) => window.__game.query.dig(x, y + 0.5 * window.__game.query.world().bu, z, window.__game.query.world().bu), [x, f.height, z]);
    if (dig.prim === null) spot = { x, y: f.height, z };
  }
  const kind = process.env.APP4_TRAIL_FOOD ?? 'sugar';
  const variant = kind === 'sugar' ? 'sugary-spill' : (process.env.APP4_TRAIL_VARIANT ?? 'insect-medium');
  const sp = await g(([p, k, v, sugar]) => window.__game.cheat.raw({ type: 'cheat.spawnFood', kind: k, variant: v, pos: p, units: sugar ? 400 : 1, stage: sugar ? null : 'fresh' }), [spot, kind === 'sugar' ? 'sugar' : 'carrion', variant, kind === 'sugar']);
  log('spawn', kind, variant, JSON.stringify(sp));
  const food = (await g(() => window.__game.query.sources())).sort((a, b) => b.id - a.id)[0];
  log('food', JSON.stringify({ id: food.id, kind: food.kind, variant: food.variant, units: food.units, c: food.c, p: food.p }));
  const mid = { x: (ent.pos.x + food.pos.x) / 2, y: (ent.pos.y + food.pos.y) / 2, z: (ent.pos.z + food.pos.z) / 2 };
  let trail = 0, waited = 0;
  for (let i = 0; i < 40 && trail <= 0; i++) {
    await step(300); waited += 300;
    trail = await g((m) => window.__game.query.scent(m.x, m.y, m.z), mid);
    if (i % 5 === 4 || trail > 0) log('t', waited, 'trail', trail, JSON.stringify(await state()));
  }
  log('result', JSON.stringify({ kind, variant, trail, waited, final: await state() }));
  return { kind, trail, waited };
};
