// Audio demo (task deliverable 6): audition every cue, giant event, UI sound, music season and ambience state on
// a live AudioContext, with an analyser read-out (spectrum, RMS, peak, clipping, band shares) so correctness can
// be checked without ears; plus `window.__audioDemo` for scripts: offline renders + analysis, loop-boundary checks,
// the CPU bench, and which asset back end served the audio (packs in the classic build).
import { AudioRuntime, type RuntimeFrame } from '@/audio';
import { createBrowserAssetLoader } from '@/render/assets';
import { ALL_BED_IDS } from '@/audio/assetIds';
import { HABITAT_GROUPS, type HabitatGroup } from '@/audio/ambience/matrix';
import { WEATHER_STATES, type WeatherState } from '@/sim/types/ids';
import { analyse } from './analysis';
import { bench, type BenchResult } from './bench';
import { AMBIENCE_STATES, CUE_SPECS, SILENT_BY_DESIGN } from './catalog';
import { runFoleyAgainstBed, runLayerLevels, runLoudnessScenes } from './loudnessScenes';
import { ambienceInput, ambienceName, LOOP_FILES, MIX, renderAmbience, renderCue, renderLoopBoundary, specName, type AmbienceState, type CueSpec } from './offline';

const warnings: string[] = [];
const assets = createBrowserAssetLoader({ warn: (m) => { warnings.push(m); console.warn('[assets]', m); } });
const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const controls = $('#controls');
const statusEl = $('#status');
const readout = $('#readout');
const results = $('#results');

let ctx: AudioContext | null = null;
let rt: AudioRuntime | null = null;
const amb: AmbienceState = { group: 'woodland', hour: 13, weather: 'clear', depthBu: 0, nearAnts: 20, humidity: 0.9 };
let ambOn = false;

function frame(): RuntimeFrame {
  return { ambience: ambOn ? ambienceInput(amb) : null, paused: false, criticalActive: false, calmS: 0, season: 'summer', combat: false, musicMode: 'off' };
}

async function start(): Promise<void> {
  if (ctx) return;
  try {
    ctx = new AudioContext();
    await ctx.resume().catch(() => {});
  } catch (e) {
    statusEl.textContent = `AudioContext refused: ${(e as Error).message}. The rest of the page still works.`;
    return;
  }
  rt = new AudioRuntime(ctx, { bytes: assets, seed: 2 });
  rt.applySettings(MIX);
  void rt.preloadEffects();
  rt.listener.bu = 4;
  rt.listener.pos = { x: 0, y: 2, z: 0 };
  rt.listener.hear = { x: 0, y: 2, z: 0 };
  statusEl.textContent = `Audio ${ctx.state}, ${ctx.sampleRate} Hz`;
  let last = performance.now();
  const loop = () => {
    const now = performance.now();
    rt?.update((now - last) / 1000, frame());
    last = now;
    draw();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

const spec = $<HTMLCanvasElement>('#spectrum');
const g2d = spec.getContext('2d')!;
const freq = new Float32Array(1024), time = new Float32Array(2048);
function draw(): void {
  if (!rt) return;
  const an = rt.graph.analyser;
  an.getFloatFrequencyData(freq);
  an.getFloatTimeDomainData(time);
  g2d.fillStyle = '#0d0c0a';
  g2d.fillRect(0, 0, spec.width, spec.height);
  g2d.fillStyle = '#c9b98f';
  const nyq = rt.ctx.sampleRate / 2;
  for (let x = 0; x < spec.width; x++) {
    const f = 20 * Math.pow(nyq / 20, x / spec.width); // log axis 20 Hz .. Nyquist
    const db = freq[Math.min(freq.length - 1, Math.round((f / nyq) * freq.length))];
    const h = Math.max(0, (db + 110) / 110) * spec.height;
    g2d.fillRect(x, spec.height - h, 1, h);
  }
  let peak = 0, sum = 0;
  for (const v of time) { peak = Math.max(peak, Math.abs(v)); sum += v * v; }
  const db = (x: number) => (x > 0 ? (20 * Math.log10(x)).toFixed(1) : '-inf');
  readout.textContent = [
    `RMS ${db(Math.sqrt(sum / time.length))} dBFS   peak ${db(peak)} dBFS   ${peak >= 0.999 ? 'CLIPPING' : 'no clipping'}   ctx ${rt.ctx.currentTime.toFixed(1)} s`,
    `voices ${rt.cues.voices.active}   giants ${rt.giants.kinds().join(', ') || '-'}   ducking ${JSON.stringify(rt.graph.ducking)}`,
    `ambience ${ambOn ? ambienceName(amb) : 'off'}   sources ${JSON.stringify(rt.ambience.sources())}`,
    `last cues: ${rt.log.list().slice(-4).map((e) => `${e.cue}=${e.source}`).join('  ')}`,
  ].join('\n');
}

function section(title: string): HTMLElement {
  const h = document.createElement('h2');
  h.textContent = title;
  controls.appendChild(h);
  const d = document.createElement('div');
  controls.appendChild(d);
  return d;
}

function button(parent: HTMLElement, label: string, fn: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = () => { void start().then(fn); };
  parent.appendChild(b);
  return b;
}

function select<T extends string | number>(parent: HTMLElement, label: string, values: readonly T[], get: () => T, set: (v: T) => void): void {
  const l = document.createElement('label');
  l.textContent = ` ${label} `;
  const s = document.createElement('select');
  for (const v of values) { const o = document.createElement('option'); o.value = String(v); o.textContent = String(v); s.appendChild(o); }
  s.value = String(get());
  s.onchange = () => { const v = values.find((x) => String(x) === s.value); if (v !== undefined) set(v); };
  l.appendChild(s);
  parent.appendChild(l);
}

function play(sp: CueSpec): void {
  if (!rt) return;
  if (sp.kind === 'cue') rt.cues.cue(sp.id, { x: (sp.distBu ?? 2) * 4, y: 0.5, z: 0 }, sp.strength ?? 1, sp.material ?? null);
  else if (sp.kind === 'ui') rt.ui.play(sp.id);
  else if (sp.kind === 'thunder') rt.giants.thunder(1, 0.9);
  else if (sp.kind === 'music') rt.playMusic(sp.season, 'sparse', 'demo');
  else {
    const id = Math.floor(Math.random() * 1e6);
    const at = { x: 120 * 4, y: 0, z: 40 * 4 };
    rt.giants.telegraph(id, sp.id, at, 2);
    setTimeout(() => { rt?.giants.start(id, sp.id, sp.variant ?? null); rt?.giants.impact(id, sp.id, at); }, 2000);
    setTimeout(() => rt?.giants.end(id), 12000);
  }
}

// ---- controls -------------------------------------------------------------------------------------------------
button(section('Engine'), 'Start audio', () => {});
const ambDiv = section('Ambience');
select<HabitatGroup>(ambDiv, 'group', HABITAT_GROUPS, () => amb.group, (v) => { amb.group = v; });
select<number>(ambDiv, 'hour', [2, 6, 9, 13, 18, 20, 23], () => amb.hour, (v) => { amb.hour = v; });
select<WeatherState>(ambDiv, 'weather', WEATHER_STATES, () => amb.weather, (v) => { amb.weather = v; });
select<number>(ambDiv, 'depth BU', [0, 2, 6, 12, 20, 30], () => amb.depthBu ?? 0, (v) => { amb.depthBu = v; if (rt) { rt.listener.underground = v > 0; rt.listener.depthBu = v; } });
const ambBtn = button(ambDiv, 'Ambience on/off', () => { ambOn = !ambOn; ambBtn.classList.toggle('on', ambOn); });
const cueDiv = section('Cues, giants, UI, music');
for (const { spec: sp } of CUE_SPECS) button(cueDiv, specName(sp), () => play(sp));
const benchDiv = section('Checks');
button(benchDiv, 'Run offline analysis', () => { void runAll(); });
button(benchDiv, 'CPU bench (32 voices)', () => { void runBench().then((r) => { results.textContent = JSON.stringify(r); }); });
const note = document.createElement('p');
note.textContent = `Silent by design: ${SILENT_BY_DESIGN.join(', ')}.`;
controls.appendChild(note);

// ---- scripted checks ------------------------------------------------------------------------------------------
async function runBench() {
  await start();
  if (!ctx) return { error: 'no AudioContext' };
  const runs: BenchResult[] = [];
  for (let i = 0; i < 3; i++) runs.push(await bench(ctx, assets));
  const best = (k: 'msMedian' | 'msP95' | 'updateMedian' | 'updateP95' | 'startMs') => Math.min(...runs.map((r) => r[k]));
  return { runs, bestMedianMs: best('msMedian'), bestP95Ms: best('msP95'), bestUpdateMedianMs: best('updateMedian'), bestUpdateP95Ms: best('updateP95'), bestStartMs: best('startMs') };
}

async function runCues() {
  const out = [];
  for (const { spec: sp, expect } of CUE_SPECS) {
    const r = await renderCue(assets, sp);
    const problems = [r.analysis.silent ? 'silent' : null, r.analysis.clipped ? `clipped ${r.analysis.clipped}` : null, expect(r.analysis)].filter(Boolean);
    out.push({ ...r, problems });
  }
  return out;
}

async function runAmbience() {
  const out = [];
  for (const { state, expect } of AMBIENCE_STATES) {
    const r = await renderAmbience(assets, state);
    const problems = [r.analysis.silent ? 'silent' : null, r.analysis.clipped ? `clipped ${r.analysis.clipped}` : null, expect(r.analysis)].filter(Boolean);
    out.push({ ...r, problems });
  }
  return out;
}

async function runLoops() {
  const out = [];
  for (const f of LOOP_FILES) out.push(await renderLoopBoundary(assets, f));
  return out;
}

function table(rows: { name: string; problems: unknown[]; analysis: { rmsDb: number; peakDb: number; centroidHz: number; bands: object } }[]): string {
  return `<table><tr><th>sound</th><th>rms</th><th>peak</th><th>centroid</th><th>bands</th><th>check</th></tr>${rows.map((r) => (
    `<tr><td>${r.name}</td><td>${r.analysis.rmsDb}</td><td>${r.analysis.peakDb}</td><td>${r.analysis.centroidHz}</td><td>${Object.values(r.analysis.bands).join(' ')}</td>`
    + `<td class="${r.problems.length ? 'bad' : 'ok'}">${r.problems.length ? r.problems.join('; ') : 'ok'}</td></tr>`)).join('')}</table>`;
}

async function runAll() {
  results.textContent = 'rendering...';
  const cues = await runCues();
  const ambience = await runAmbience();
  const loops = await runLoops();
  results.innerHTML = `<h2>Cues (${cues.length})</h2>${table(cues)}<h2>Ambience (${ambience.length})</h2>${table(ambience)}`
    + `<h2>Loop boundaries</h2><table><tr><th>file</th><th>crossfade step/dip</th><th>material (control) step/dip</th><th>naive loop step/dip</th><th>check</th></tr>${loops.map((l) => (
      `<tr><td>${l.file}</td><td>${l.crossfade.stepRatio} / ${l.crossfade.rmsDipRatio}</td><td>${l.control.stepRatio} / ${l.control.rmsDipRatio}</td>`
      + `<td>${l.naive.stepRatio} / ${l.naive.rmsDipRatio}${l.naiveFlagged ? ' (defect shows)' : ''}</td><td class="${l.ok ? 'ok' : 'bad'}">${l.ok ? 'ok' : 'discontinuity'}</td></tr>`)).join('')}</table>`;
  return { cues, ambience, loops };
}

/** Loudness ruling (design directions §K): the scene renders measured with BS.1770, and the foley against the calm bed. */
async function runLoudness(only: string[] | null = null) {
  const scenes = await runLoudnessScenes(assets, only && only.includes('foley') ? [...only, 'calm-surface-day'] : only);
  const bed = scenes.find((r) => r.id === 'calm-surface-day');
  const foley = only && !only.includes('foley') ? [] : await runFoleyAgainstBed(assets, bed ? bed.integratedLufs : -27);
  results.innerHTML = `<h2>Loudness</h2><table><tr><th>scene</th><th>integrated</th><th>short-term max</th><th>true peak</th><th>target</th><th>check</th></tr>${scenes.map((r) => (
    `<tr><td>${r.id}</td><td>${r.integratedLufs}</td><td>${r.shortTermMaxLufs}</td><td>${r.truePeakDb}</td><td>${r.targetLufs} ± ${r.tol}</td>`
    + `<td class="${r.ok ? 'ok' : 'bad'}">${r.ok ? 'ok' : r.problems.join('; ')}</td></tr>`)).join('')}</table>`
    + `<h2>Foley vs calm bed</h2><table><tr><th>pattern</th><th>short-term</th><th>bed</th><th>delta</th><th>peak</th><th>check</th></tr>${foley.map((r) => (
      `<tr><td>${r.id}</td><td>${r.shortTermLufs}</td><td>${r.bedLufs}</td><td>${r.deltaLu}</td><td>${r.peakDb}</td><td class="${r.ok ? 'ok' : 'bad'}">${r.ok ? 'ok' : 'outside 8 LU'}</td></tr>`)).join('')}</table>`;
  return { scenes, foley };
}

declare global { interface Window { __audioDemo?: unknown; __ready?: boolean } }
window.__audioDemo = {
  start, runAll, runCues, runAmbience, runLoops, runBench, runLoudness, runLayerLevels: () => runLayerLevels(assets), renderCue: (sp: CueSpec) => renderCue(assets, sp), analyse,
  status: () => ({ ctx: ctx?.state ?? 'none' }),
  /** Which asset back end serves audio (embedded = packs) and whether every file decodes. */
  assetCheck: async () => {
    await assets.init();
    const ids = [...(assets.manifest?.assets.values() ?? [])].filter((a) => a.kind === 'audio').map((a) => a.id);
    const off = new OfflineAudioContext(1, 4800, 48000);
    const rows = [];
    for (const id of ids) {
      const path = assets.manifest!.assets.get(id)!.path;
      const backend = assets.backendFor(path);
      let seconds = -1;
      try { seconds = Math.round((await off.decodeAudioData(await assets.audioData(id))).duration * 100) / 100; } catch { /* decode failed */ }
      rows.push({ id, backend, seconds });
    }
    return { count: ids.length, rows, beds: ALL_BED_IDS.length, warnings };
  },
};
window.__ready = true;
