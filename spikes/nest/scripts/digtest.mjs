export default async ({ page, shot, log }) => {
  const S = (f, ...a) => page.evaluate(([f, a]) => window.__spike[f](...a), [f, a]);
  for (const [slope, walk, z] of [[0.52, 0.06, 300]]) {
    await S('setDigSlope', slope);
    await S('teleport', 190, 20, z, { heading: 0 });
    const tr = [];
    for (let i = 0; i < 26; i++) {
      await S('dig');
      await S('setInput', { forward: 1, desired: [Math.cos(slope), -Math.sin(slope), 0] });
      const st = await S('step', walk, { render: false });
      await S('setInput', { forward: 0 });
      tr.push(st.pos.map((v) => +v.toFixed(1)).join(',') + ' up ' + st.up.map((v) => +v.toFixed(2)).join(',') + ' f ' + st.f);
    }
    log(slope, '\n' + tr.join('\n'));
    await S('step', 0.3);
    await shot(`dig-3p-${slope}`);
    await S('setCamera', 'cutaway', { plane: z, xray: false, yaw: 0, pitch: 0.12, dist: 110, target: [215, -15, z] });
    await shot(`dig-cut-${slope}`);
    await S('setCamera', 'third', { pitch: 0 });
  }
};
