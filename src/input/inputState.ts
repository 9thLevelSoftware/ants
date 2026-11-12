// The action layer: maps raw device state to per-frame action queries. Pure (no DOM): the DOM adapter in
// domAdapter.ts, or a test, feeds events and calls update(nowMs) once per rendered frame.
//
// Queries for button actions: pressed / held / released (edges and level), tap / holdStart (tap-hold split),
// active (hold-or-toggle aware), pressedRepeat (auto-repeat while held).
// Queries for axes: axis2 (rate -1..1: move, pan), look (degrees this frame), zoom (log-distance step this frame),
// dragPx (raw drag pixels this frame).
import { ACTIONS, actionDef, axisComponents, axisDef } from './actions';
import { bindingsOf, defaultBindings, type BindingSet } from './bindings';
import { ContextStack } from './contexts';
import {
  DEVICE_SWITCH_HYST_S, HOLD_THRESHOLD_MS, PAD_AXIS, ZOOM_STEP_PER_NOTCH, ZOOM_STEP_PER_SECOND_KEYS, ZOOM_STEP_PER_SECOND_PAD,
  defaultInputSettings, type InputSettings,
} from './defaults';
import { PadTracker, applyResponse, padHasInput, radialDeadzone } from './gamepad';
import { PointerLockPolicy } from './pointerLock';
import { emptyFrame, RawSources, type FrameSnapshot, type PadAxisModifier } from './sources';
import type { ActionDef, Binding, InputDevice, InputEvent, PadSnapshot, Vec2 } from './types';

interface ActionRuntime {
  held: boolean;
  pressed: boolean;
  released: boolean;
  tap: boolean;
  holdStart: boolean;
  downSince: number;
  holdFired: boolean;
  latched: boolean;
  repeatCount: number;
}

const newRuntime = (): ActionRuntime => ({ held: false, pressed: false, released: false, tap: false, holdStart: false, downSince: 0, holdFired: false, latched: false, repeatCount: 0 });

/** Binding evaluation result: level and one-frame pulses. */
interface SourceState { held: boolean; pulses: number; value: number }

export class InputState {
  readonly contexts = new ContextStack();
  readonly pointer = new PointerLockPolicy();
  readonly raw = new RawSources();
  settings: InputSettings;
  private bindingSet: BindingSet;
  private pads = new PadTracker();
  private runtime = new Map<string, ActionRuntime>();
  private frame: FrameSnapshot = emptyFrame();
  private events: InputEvent[] = [];
  private suspendedFlag = false;
  private mouseHolds: number[] = [];
  private padHolds: number[] = [];
  private device: InputDevice = 'kbm';
  private deviceSince = -Infinity;
  private pendingDevice: InputDevice | null = null;
  private liveRevision = -1;
  private liveIds = new Set<string>();

  constructor(bindings: BindingSet = defaultBindings(), settings: InputSettings = defaultInputSettings()) {
    this.bindingSet = bindings;
    this.settings = settings;
    for (const a of ACTIONS) this.runtime.set(a.id, newRuntime());
    this.collectHoldThresholds();
  }

  // ------------------------------------------------------------------ configuration
  get bindings(): BindingSet {
    return this.bindingSet;
  }

  setBindings(b: BindingSet): void {
    this.bindingSet = b;
    this.liveRevision = -1;
    this.collectHoldThresholds();
  }

  private collectHoldThresholds(): void {
    const mh = new Set<number>(), ph = new Set<number>();
    for (const a of ACTIONS) {
      for (const b of bindingsOf(this.bindingSet, a.id)) {
        if (b.kind === 'mouse' && b.gesture === 'hold') mh.add(b.holdMs ?? HOLD_THRESHOLD_MS);
        if (b.kind === 'pad' && b.gesture === 'hold') ph.add(b.holdMs ?? HOLD_THRESHOLD_MS);
      }
    }
    this.mouseHolds = [...mh];
    this.padHolds = [...ph];
  }

  /** Text field focused: every game binding is suspended (GDD 01 5.8). */
  setSuspended(on: boolean): void {
    if (on && !this.suspendedFlag) this.raw.releaseAll();
    this.suspendedFlag = on;
  }

  get suspended(): boolean {
    return this.suspendedFlag;
  }

  // ------------------------------------------------------------------ device events (adapter or tests)
  /** Returns true when the key is bound in a live context (the adapter then calls preventDefault). */
  keyDown(code: string, mods: { shift?: boolean; ctrl?: boolean; alt?: boolean; meta?: boolean; repeat?: boolean } = {}): boolean {
    if (this.suspendedFlag || mods.ctrl || mods.alt || mods.meta) return false; // never steal browser shortcuts
    this.raw.keyDown(code, !!mods.shift, !!mods.repeat);
    return this.isCodeBoundLive(code, !!mods.shift);
  }

  keyUp(code: string): void {
    this.raw.keyUp(code);
  }

  mouseDown(button: number, x: number, y: number, nowMs: number): void {
    if (this.suspendedFlag) return;
    this.raw.mouseDown(button, x, y, nowMs, this.pointer.locked);
  }

  mouseMove(x: number, y: number, dx: number, dy: number): void {
    if (this.suspendedFlag) return;
    this.raw.mouseMove(x, y, dx, dy, this.pointer.locked);
  }

  mouseUp(button: number, x: number, y: number, nowMs: number): void {
    this.raw.mouseUp(button, x, y, nowMs, this.pointer.locked);
  }

  wheel(deltaY: number, deltaMode: number, shift: boolean): void {
    if (this.suspendedFlag) return;
    this.raw.wheel(deltaY, deltaMode, shift && this.liveUsesShiftWheel());
  }

  /** Window blur / hidden tab: synthesise release for every held input; the game may auto-pause on the event. */
  focusLost(): void {
    this.raw.releaseAll();
    this.events.push({ type: 'focus-lost' });
  }

  /** All connected pads (as navigator.getGamepads() returns them, converted to snapshots). Call before update(). */
  setPads(pads: readonly (PadSnapshot | null)[]): void {
    const from = this.events.length;
    const player = this.pads.update(pads, this.settings.deadZone, this.events);
    // "was the active device": the player pad AND the device that produced the latest input (GDD 01 5.8)
    for (let i = from; i < this.events.length; i++) {
      const e = this.events[i];
      if (e.type === 'pad-disconnected') e.wasActiveDevice = e.wasActiveDevice && this.device === 'pad';
    }
    this.raw.setPad(player);
  }

  // ------------------------------------------------------------------ per frame
  update(nowMs: number): void {
    this.refreshLive();
    this.frame = this.raw.latch(nowMs, this.mouseHolds, this.padHolds, this.liveAxisModifiers());
    this.pumpPointerNotices();
    this.trackDevice(nowMs);
    for (const a of ACTIONS) this.evaluate(a, nowMs);
  }

  drainEvents(): InputEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  get activeDevice(): InputDevice {
    return this.device;
  }

  private pumpPointerNotices(): void {
    for (const n of this.pointer.notices.splice(0)) {
      this.events.push({ type: 'pointer-lock', state: n.kind === 'refused' ? 'refused' : n.kind });
    }
  }

  private trackDevice(now: number): void {
    const padInput = this.raw.pad && !this.raw.padSuppressed && padHasInput(this.raw.pad, this.settings.deadZone);
    const latest: InputDevice | null = padInput ? 'pad' : this.frame.kbmActivity ? 'kbm' : null;
    if (latest && latest !== this.device) this.pendingDevice = latest;
    else if (latest === this.device) this.pendingDevice = null;
    if (this.pendingDevice && (now - this.deviceSince) / 1000 >= DEVICE_SWITCH_HYST_S) {
      this.device = this.pendingDevice;
      this.deviceSince = now;
      this.pendingDevice = null;
      this.events.push({ type: 'device-changed', device: this.device });
    }
  }

  private refreshLive(): void {
    if (this.liveRevision === this.contexts.revision) return;
    this.liveRevision = this.contexts.revision;
    this.liveIds.clear();
    for (const a of ACTIONS) if (this.contexts.isLive(a.contexts)) this.liveIds.add(a.id);
  }

  isLive(id: string): boolean {
    this.refreshLive();
    return !this.suspendedFlag && this.liveIds.has(id);
  }

  // ------------------------------------------------------------------ binding evaluation
  /** Is there a live binding of `code` that requires Shift? (then the unshifted binding of that code yields) */
  private shiftedVariantLive(code: string): boolean {
    for (const id of this.liveIds) for (const b of this.bindingSet.kbm[id] ?? []) if (b && b.kind === 'key' && b.code === code && b.shift) return true;
    return false;
  }

  /** Is there a live pad binding on `button` whose modifier is currently held? (then the plain binding yields) */
  private modifiedVariantHeld(button: number): boolean {
    for (const id of this.liveIds) {
      const b = this.bindingSet.pad[id];
      if (b && b.kind === 'pad' && b.button === button && b.mod !== undefined && this.raw.padButtonDown(b.mod)) return true;
    }
    return false;
  }

  /** Pad axes claimed by a live modified padAxis binding whose modifier is held (LB + RS vertical = zoom). */
  private claimedAxis(axis: number): boolean {
    for (const id of this.liveIds) {
      const b = this.bindingSet.pad[id];
      if (b && b.kind === 'padAxis' && b.axis === axis && b.mod !== undefined && this.raw.padButtonDown(b.mod)) return true;
    }
    return false;
  }

  /** Live modified padAxis / padStick bindings: their modifier button is "used" while the axis is deflected. */
  private liveAxisModifiers(): PadAxisModifier[] {
    const out: PadAxisModifier[] = [];
    if (this.suspendedFlag) return out;
    for (const id of this.liveIds) {
      const b = this.bindingSet.pad[id];
      if (!b || (b.kind !== 'padAxis' && b.kind !== 'padStick') || b.mod === undefined) continue;
      if (b.kind === 'padAxis') out.push({ mod: b.mod, axes: [b.axis], deadZone: this.settings.deadZone });
      else {
        const ax = b.stick === 'left' ? PAD_AXIS.LX : PAD_AXIS.RX;
        out.push({ mod: b.mod, axes: [ax, ax + 1], deadZone: this.settings.deadZone });
      }
    }
    return out;
  }

  private liveUsesShiftWheel(): boolean {
    this.refreshLive();
    for (const id of this.liveIds) for (const b of this.bindingSet.kbm[id] ?? []) if (b && b.kind === 'wheel' && b.shift) return true;
    return false;
  }

  private isCodeBoundLive(code: string, shift: boolean): boolean {
    this.refreshLive();
    for (const id of this.liveIds) {
      for (const b of this.bindingSet.kbm[id] ?? []) if (b && b.kind === 'key' && b.code === code && (!b.shift || shift)) return true;
    }
    return false;
  }

  private keyMatches(b: Extract<Binding, { kind: 'key' }>, shiftAtDown: boolean): boolean {
    return b.shift ? shiftAtDown : !(shiftAtDown && this.shiftedVariantLive(b.code));
  }

  private source(b: Binding, a: ActionDef): SourceState {
    const f = this.frame;
    switch (b.kind) {
      case 'key': {
        const k = this.raw.keys.get(b.code);
        const held = !!k && this.keyMatches(b, k.shift);
        let pulses = 0;
        for (const e of f.keyDownEdges) if (e.code === b.code && this.keyMatches(b, e.shift)) pulses++;
        return { held, pulses: held ? 0 : pulses, value: held ? 1 : 0 };
      }
      case 'mouse': {
        if (b.button === 0 && this.settings.leftButton === 'orbit' && !b.gesture) return { held: false, pulses: 0, value: 0 };
        if (b.gesture === 'click') return { held: false, pulses: f.pulses.get(`click:${b.button}`) ?? 0, value: 0 };
        if (b.gesture === 'dbl') return { held: false, pulses: f.pulses.get(`dbl:${b.button}`) ?? 0, value: 0 };
        if (b.gesture === 'hold') return { held: false, pulses: f.pulses.get(`hold:${b.button}:${b.holdMs ?? HOLD_THRESHOLD_MS}`) ?? 0, value: 0 };
        const held = this.raw.mouse.has(b.button);
        return { held, pulses: held ? 0 : f.pulses.get(`press:${b.button}`) ?? 0, value: held ? 1 : 0 };
      }
      case 'wheel': {
        const n = f.pulses.get(`${b.shift ? 'wheelshift' : 'wheel'}:${b.dir}`) ?? 0;
        const amount = Math.max(0, (b.shift ? f.wheelShift : f.wheel) * b.dir);
        return { held: false, pulses: n, value: amount };
      }
      case 'drag':
        return { held: false, pulses: 0, value: 0 }; // read by dragPx()
      case 'pad': {
        const modOk = b.mod === undefined ? !this.modifiedVariantHeld(b.button) : this.raw.padButtonDown(b.mod);
        if (!modOk) return { held: false, pulses: 0, value: 0 };
        if (b.gesture === 'tap') {
          const lim = b.holdMs ?? HOLD_THRESHOLD_MS;
          return { held: false, pulses: f.padTaps.filter((t) => t.button === b.button && t.ms < lim).length, value: 0 };
        }
        if (b.gesture === 'hold') return { held: false, pulses: f.pulses.get(`padhold:${b.button}:${b.holdMs ?? HOLD_THRESHOLD_MS}`) ?? 0, value: 0 };
        // a plain binding on a button that also has a tap gesture elsewhere still fires on press (LB in menus)
        const held = this.raw.padButtonDown(b.button);
        const v = this.raw.pad?.buttons[b.button] ?? 0;
        return { held, pulses: held ? 0 : f.pulses.get(`padpress:${b.button}`) ?? 0, value: held ? v : 0 };
      }
      case 'padAxis': {
        if (this.raw.padSuppressed || !this.raw.pad) return { held: false, pulses: 0, value: 0 };
        if (b.mod !== undefined ? !this.raw.padButtonDown(b.mod) : this.claimedAxis(b.axis)) return { held: false, pulses: 0, value: 0 };
        const raw = (this.raw.pad.axes[b.axis] ?? 0) * b.dir;
        const dz = this.settings.deadZone;
        const v = raw <= dz ? 0 : Math.min(1, (raw - dz) / (1 - dz));
        return { held: v > 0.5, pulses: 0, value: v };
      }
      case 'padStick':
        void a;
        return { held: false, pulses: 0, value: 0 }; // read by stickOf()
    }
  }

  private evaluate(a: ActionDef, now: number): void {
    const r = this.runtime.get(a.id)!;
    const live = this.isLive(a.id);
    let held = false, pulses = 0;
    if (live) {
      for (const b of bindingsOf(this.bindingSet, a.id)) {
        const s = this.source(b, a);
        held = held || s.held;
        pulses += s.pulses;
      }
    }
    const wasHeld = r.held;
    const holdMs = a.holdMs ?? HOLD_THRESHOLD_MS;
    r.pressed = (held && !wasHeld) || pulses > 0;
    r.released = (wasHeld && !held) || (pulses > 0 && !held);
    r.holdStart = false;
    r.tap = false;
    if (held && !wasHeld) { r.downSince = now; r.holdFired = false; r.repeatCount = 0; }
    if (held && !r.holdFired && now - r.downSince >= holdMs) { r.holdFired = true; r.holdStart = true; }
    if (r.released) {
      // a pulse (click, tap gesture, press+release inside one frame) always counts as a tap
      if (pulses > 0 && !held) r.tap = true;
      else if (!r.holdFired && now - r.downSince < holdMs) r.tap = true;
    }
    r.held = held;
    const toggle = a.holdToggle && this.bindingSet.holdToggle[a.id] === 'toggle';
    if (toggle) {
      if (a.type === 'tapHold' ? r.holdStart : r.pressed) r.latched = !r.latched;
    }
  }

  // ------------------------------------------------------------------ button queries
  private rt(id: string): ActionRuntime {
    const r = this.runtime.get(id);
    if (!r) throw new Error(`input: unknown action '${id}'`);
    return r;
  }

  pressed(id: string): boolean { return this.rt(id).pressed; }
  held(id: string): boolean { return this.rt(id).held; }
  released(id: string): boolean { return this.rt(id).released; }
  /** Released before its hold threshold (or a click / tap gesture). */
  tap(id: string): boolean { return this.rt(id).tap; }
  /** Crossed its hold threshold this frame. */
  holdStart(id: string): boolean { return this.rt(id).holdStart; }

  /**
   * Hold-or-toggle aware level: for 'hold' actions held (hold mode) or the latch (toggle mode); for 'tapHold'
   * actions the hold part (held past the threshold) or the latch.
   */
  active(id: string): boolean {
    const a = actionDef(id)!;
    const r = this.rt(id);
    if (a.holdToggle && this.bindingSet.holdToggle[id] === 'toggle') return r.latched;
    return a.type === 'tapHold' ? r.held && r.holdFired : r.held;
  }

  /** Pressed now, then again every 1/hz s while held (colony slice up/down repeat 8/s). */
  pressedRepeat(id: string, hz: number): boolean {
    const r = this.rt(id);
    if (r.pressed) return true;
    if (!r.held) return false;
    const n = Math.floor(((this.frame.now - r.downSince) / 1000) * hz);
    if (n > r.repeatCount) { r.repeatCount = n; return true; }
    return false;
  }

  /** Raw physical key query, independent of bindings (debug tools and demos). */
  codeHeld(code: string): boolean {
    return this.raw.keys.has(code);
  }

  codePressed(code: string): boolean {
    return this.frame.keyDownEdges.some((e) => e.code === code);
  }

  /** Any keyboard / mouse / wheel event or pad input above dead zone arrived for this frame (wake on-demand loops). */
  get anyActivity(): boolean {
    return this.frame.kbmActivity || (!!this.raw.pad && !this.raw.padSuppressed && padHasInput(this.raw.pad, this.settings.deadZone));
  }

  get frameDt(): number {
    return this.frame.dt;
  }

  // ------------------------------------------------------------------ axes
  private comp(axisId: string, c: string): number {
    const id = `${axisId}.${c}`;
    if (!this.runtime.has(id) || !this.isLive(id)) return 0;
    let v = 0;
    const a = actionDef(id)!;
    for (const b of bindingsOf(this.bindingSet, id)) v = Math.max(v, this.source(b, a).value);
    return v;
  }

  private stickOf(axisId: string, out: Vec2): Vec2 {
    out.x = 0; out.y = 0;
    const id = `${axisId}.stick`;
    if (!this.runtime.has(id) || !this.isLive(id) || this.raw.padSuppressed || !this.raw.pad) return out;
    const b = this.bindingSet.pad[id];
    if (!b || b.kind !== 'padStick') return out;
    if (b.mod !== undefined && !this.raw.padButtonDown(b.mod)) return out;
    const ax = b.stick === 'left' ? PAD_AXIS.LX : PAD_AXIS.RX;
    const x = this.claimedAxis(ax) ? 0 : this.raw.pad.axes[ax] ?? 0;
    const y = this.claimedAxis(ax + 1) ? 0 : this.raw.pad.axes[ax + 1] ?? 0;
    radialDeadzone(out, x, -y, this.settings.deadZone); // standard mapping: stick up = -1; we report up = +y
    return out;
  }

  private axisLive(axisId: string): boolean {
    for (const c of axisComponents(axisId)) if (this.isLive(c.id)) return true;
    return false;
  }

  /** Raw drag pixels this frame from the axis' drag bindings (x right, y down). */
  dragPx(axisId: string): Vec2 {
    const out = { x: 0, y: 0 };
    const id = `${axisId}.drag`;
    if (!this.runtime.has(id) || !this.isLive(id)) return out;
    const buttons = new Set<number>();
    for (const b of this.bindingSet.kbm[id] ?? []) if (b && b.kind === 'drag') buttons.add(b.button);
    if (buttons.has(2) && this.settings.leftButton === 'orbit') buttons.add(0);
    for (const button of buttons) {
      const d = this.frame.drag.get(button);
      if (d) { out.x += d.dx; out.y += d.dy; }
    }
    return out;
  }

  /** Rate axis (move, pan): x right, y forward/up, length <= 1. Keys and pad add up (simultaneous devices). */
  axis2(axisId: string): Vec2 {
    const s = this.stickOf(axisId, { x: 0, y: 0 });
    let x = this.comp(axisId, 'right') - this.comp(axisId, 'left') + s.x;
    let y = this.comp(axisId, 'up') - this.comp(axisId, 'down') + s.y;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }

  /** Look axis in degrees this frame: x = yaw to the right, y = pitch up. Includes drag, locked mouse, keys, stick. */
  look(axisId: string): Vec2 {
    const def = axisDef(axisId);
    if (!def) throw new Error(`input: unknown axis '${axisId}'`);
    const st = this.settings, dt = this.frame.dt;
    const rates = def.keyRateDeg ?? [0, 0];
    let x = (this.comp(axisId, 'right') - this.comp(axisId, 'left')) * rates[0] * dt;
    let y = (this.comp(axisId, 'up') - this.comp(axisId, 'down')) * rates[1] * dt;
    const d = this.dragPx(axisId);
    x += d.x * st.orbitSensDrag * st.mouseSensitivity;
    y += -d.y * st.orbitSensDrag * st.mouseSensitivity;
    if (def.lockedMouse && this.pointer.locked && this.axisLive(axisId)) {
      x += this.frame.lockedDx * st.orbitSensLocked * st.mouseSensitivity;
      y += -this.frame.lockedDy * st.orbitSensLocked * st.mouseSensitivity;
    }
    const s = applyResponse({ x: 0, y: 0 }, this.stickOf(axisId, { x: 0, y: 0 }), st.stickResponse);
    x += s.x * st.stickYawRate * dt;
    y += s.y * st.stickPitchRate * dt;
    if (st.invertX) x = -x;
    if (st.invertY) y = -y;
    return { x, y };
  }

  /** Zoom axis: natural-log distance change this frame (positive = farther). Multiply distance by exp(zoom). */
  zoom(axisId: string): number {
    const dt = this.frame.dt;
    const id = (c: string) => `${axisId}.${c}`;
    if (!this.runtime.has(id('in'))) throw new Error(`input: unknown zoom axis '${axisId}'`);
    let wheel = 0, keys = 0, pad = 0;
    for (const [c, sign] of [['in', -1], ['out', 1]] as const) {
      if (!this.isLive(id(c))) continue;
      const a = actionDef(id(c))!;
      for (const b of bindingsOf(this.bindingSet, id(c))) {
        const v = this.source(b, a).value;
        if (b.kind === 'wheel') wheel += sign * v;
        else if (b.kind === 'key') keys += sign * v;
        else pad += sign * v;
      }
    }
    return wheel * Math.log(ZOOM_STEP_PER_NOTCH) + keys * Math.log(ZOOM_STEP_PER_SECOND_KEYS) * dt + pad * Math.log(ZOOM_STEP_PER_SECOND_PAD) * dt;
  }

  /** Compact view of what is held / pressed, for overlays and the debug API. */
  debugSummary(): { contexts: string[]; device: InputDevice; held: string[]; pressed: string[]; pointer: string } {
    const held: string[] = [], pressed: string[] = [];
    for (const [id, r] of this.runtime) {
      if (r.held) held.push(id);
      if (r.pressed) pressed.push(id);
    }
    return { contexts: this.contexts.live(), device: this.device, held, pressed, pointer: this.pointer.effectiveMode() };
  }
}
