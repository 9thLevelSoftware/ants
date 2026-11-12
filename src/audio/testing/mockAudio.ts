// A minimal Web Audio stand-in for Node unit tests (vitest runs without a browser). It records the node graph,
// parameter automation and source start/stop so tests can check what the engine builds; it renders nothing.
// Real rendering is checked in the browser with OfflineAudioContext (spikes/audio-demo + harness).

export class MockParam {
  value: number;
  events: { kind: string; v: number | Float32Array; t: number; d?: number }[] = [];
  inputs: MockNode[] = [];
  constructor(v = 0) { this.value = v; }
  setValueAtTime(v: number, t: number) { this.check(t); this.events.push({ kind: 'set', v, t }); this.value = v; return this; }
  linearRampToValueAtTime(v: number, t: number) { this.check(t); this.events.push({ kind: 'lin', v, t }); return this; }
  exponentialRampToValueAtTime(v: number, t: number) {
    this.check(t);
    if (v <= 0) throw new RangeError('exponential ramp to a non-positive value');
    this.events.push({ kind: 'exp', v, t });
    return this;
  }
  setTargetAtTime(v: number, t: number, tau: number) { this.check(t); if (!(tau > 0)) throw new RangeError('tau'); this.events.push({ kind: 'target', v, t }); return this; }
  setValueCurveAtTime(c: Float32Array, t: number, d: number) {
    this.check(t);
    if (!(d > 0)) throw new RangeError('curve duration');
    for (const e of this.events) if (e.kind === 'curve' && t < e.t + (e.d ?? 0) && e.t < t + d) throw new Error('overlapping value curves');
    this.events.push({ kind: 'curve', v: c, t, d });
    return this;
  }
  cancelScheduledValues(t: number) { this.events = this.events.filter((e) => e.t < t); return this; }
  private check(t: number) { if (!Number.isFinite(t)) throw new RangeError(`non-finite time ${t}`); }
}

export class MockNode {
  outputs: (MockNode | MockParam)[] = [];
  inputs: MockNode[] = [];
  channelCount = 2;
  channelCountMode = 'max';
  channelInterpretation = 'speakers';
  constructor(readonly ctx: MockContext, readonly kind: string) { ctx.nodes.push(this); }
  connect<T extends MockNode | MockParam>(n: T): T {
    this.outputs.push(n);
    n.inputs.push(this);
    return n;
  }
  disconnect() { this.outputs = []; }
}

export class MockGain extends MockNode { gain = new MockParam(1); constructor(c: MockContext) { super(c, 'gain'); } }
export class MockFilter extends MockNode {
  type = 'lowpass'; frequency = new MockParam(350); Q = new MockParam(1); gain = new MockParam(0);
  constructor(c: MockContext) { super(c, 'biquad'); }
}
export class MockPanner extends MockNode { pan = new MockParam(0); constructor(c: MockContext) { super(c, 'panner'); } }
export class MockDelay extends MockNode { delayTime = new MockParam(0); constructor(c: MockContext) { super(c, 'delay'); } }
export class MockCompressor extends MockNode {
  threshold = new MockParam(-24); knee = new MockParam(30); ratio = new MockParam(12); attack = new MockParam(0.003); release = new MockParam(0.25);
  constructor(c: MockContext) { super(c, 'compressor'); }
}
export class MockAnalyser extends MockNode { fftSize = 2048; constructor(c: MockContext) { super(c, 'analyser'); } }

export class MockSource extends MockNode {
  startAt = -1; stopAt = Infinity; offset = 0; duration: number | undefined;
  onended: (() => void) | null = null;
  constructor(c: MockContext, kind: string) { super(c, kind); }
  start(t = 0, offset = 0, duration?: number) {
    if (this.startAt >= 0) throw new Error('start called twice');
    if (!Number.isFinite(t)) throw new RangeError('start time');
    this.startAt = t; this.offset = offset; this.duration = duration;
  }
  stop(t = 0) { if (this.startAt < 0) throw new Error('stop before start'); this.stopAt = t; }
}
export class MockBufferSource extends MockSource {
  buffer: MockBuffer | null = null; loop = false; playbackRate = new MockParam(1);
  constructor(c: MockContext) { super(c, 'buffer-source'); }
}
export class MockOsc extends MockSource {
  type = 'sine'; frequency = new MockParam(440); detune = new MockParam(0);
  constructor(c: MockContext) { super(c, 'oscillator'); }
}

export class MockBuffer {
  private data: Float32Array[];
  constructor(readonly numberOfChannels: number, readonly length: number, readonly sampleRate: number) {
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  get duration() { return this.length / this.sampleRate; }
  getChannelData(i: number) { return this.data[i]; }
}

export class MockContext {
  nodes: MockNode[] = [];
  currentTime = 0;
  sampleRate = 48000;
  state: 'suspended' | 'running' | 'closed' = 'running';
  onstatechange: (() => void) | null = null;
  destination: MockNode;
  decodeFails = new Set<number>();
  constructor() { this.destination = new MockNode(this, 'destination'); }
  createGain() { return new MockGain(this); }
  createBiquadFilter() { return new MockFilter(this); }
  createStereoPanner() { return new MockPanner(this); }
  createDelay() { return new MockDelay(this); }
  createDynamicsCompressor() { return new MockCompressor(this); }
  createAnalyser() { return new MockAnalyser(this); }
  createBufferSource() { return new MockBufferSource(this); }
  createOscillator() { return new MockOsc(this); }
  createBuffer(ch: number, len: number, sr: number) { return new MockBuffer(ch, len, sr); }
  decodeAudioData(bytes: ArrayBuffer): Promise<MockBuffer> {
    if (bytes.byteLength === 0) return Promise.reject(new Error('cannot decode'));
    return Promise.resolve(new MockBuffer(1, Math.round(this.sampleRate * (bytes.byteLength / 1000)), this.sampleRate));
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
  sources(): MockSource[] { return this.nodes.filter((n): n is MockSource => n instanceof MockSource); }
}

/** Casts the mock to the Web Audio type the engine expects. */
export function asCtx(m: MockContext): AudioContext {
  return m as unknown as AudioContext;
}

/** True when `from` reaches `to` through node connections. */
export function reaches(from: MockNode, to: MockNode): boolean {
  const seen = new Set<MockNode>();
  const stack: MockNode[] = [from];
  while (stack.length) {
    const n = stack.pop()!;
    if (n === to) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const o of n.outputs) if (o instanceof MockNode) stack.push(o);
  }
  return false;
}
