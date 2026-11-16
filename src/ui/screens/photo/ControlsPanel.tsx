// The controls panel of photo mode (GDD 08 7.9): 280 dp on the left, collapsible with Tab. Lens (focal length,
// aperture, focus), exposure, roll, look, guides, what to hide, overlays and the shutter. Every control calls an action
// of the photo controller and reads its result back from the published state; nothing here holds the camera's values.
import { Button, KeyHint, SegmentedControl, Select, Slider, Toggle } from '../../components';
import { overlays, setOverlay, toggleOverlay } from '../../overlays/state';
import { OVERLAY_IDS, OVERLAY_WORD, type OverlayId } from '../../overlays/catalogue';
import { formatEV, formatFNumber, formatFocus, logToPos, posToLog, SLIDER_STEPS } from './sliderMap';
import { PHOTO_GUIDES, type PhotoActions, type PhotoFocusMode, type PhotoGuides, type PhotoUi } from './store';

const NO_POST = 'Depth of field needs the post chain (graphics quality Medium or higher), so aperture has no visible effect here.';
const OTHER_OVERLAYS = OVERLAY_IDS.filter((id) => id !== 'scent');

function Row({ label, children }: { label: string; children: preact.ComponentChildren }) {
  return <div class="ph-field"><span class="ph-label">{label}</span>{children}</div>;
}

function LensSliders({ ui, a }: { ui: PhotoUi; a: PhotoActions }) {
  const r = ui.ranges, l = ui.lens;
  return (
    <>
      <Row label="Focal length">
        <Slider min={r.focalMm[0]} max={r.focalMm[1]} step={1} value={Math.round(l.focalMm)} onChange={(v) => a.setFocalMm(v)} format={(v) => `${v} mm`} aria-label="Focal length" />
      </Row>
      <Row label="Aperture">
        <Slider
          min={0} max={SLIDER_STEPS} step={5} value={logToPos(l.fNumber, r.fNumber[0], r.fNumber[1])}
          onChange={(v) => a.setFNumber(posToLog(v, r.fNumber[0], r.fNumber[1]))} format={() => formatFNumber(l.fNumber)} aria-label="Aperture" disabled={!ui.caps.depthOfField}
        />
      </Row>
      <Row label="Focus">
        <Slider
          min={0} max={SLIDER_STEPS} step={5} value={logToPos(l.focusBu, r.focusBu[0], r.focusBu[1])}
          onChange={(v) => a.setFocusBu(posToLog(v, r.focusBu[0], r.focusBu[1]))} format={() => formatFocus(l.focusBu)} aria-label="Focus distance"
        />
      </Row>
      <SegmentedControl<PhotoFocusMode>
        aria-label="Focus mode" value={ui.focusMode} onChange={(m) => a.setFocusMode(m)}
        options={[
          { value: 'subject', label: 'Subject', disabled: !ui.subject, reason: 'No subject: click an ant or creature to pick one.' },
          { value: 'centre', label: 'Centre' },
          { value: 'manual', label: 'Manual' },
        ]}
      />
      {!ui.caps.depthOfField && <p class="ph-note is-warn" data-testid="photo-no-dof">{NO_POST}</p>}
      <Row label="Exposure">
        <Slider min={r.exposureEV[0]} max={r.exposureEV[1]} step={0.25} value={l.exposureEV} onChange={(v) => a.setExposureEV(v)} format={formatEV} aria-label="Exposure" />
      </Row>
      <Row label="Roll">
        <Slider min={r.rollDeg[0]} max={r.rollDeg[1]} step={1} value={Math.round(l.rollDeg)} onChange={(v) => a.setRollDeg(v)} format={(v) => `${v}°`} aria-label="Roll" />
      </Row>
    </>
  );
}

function Overlays() {
  const set = overlays.value;
  const other = (set.other ?? 'none') as OverlayId | 'none';
  return (
    <>
      <Toggle checked={set.scent} onChange={() => toggleOverlay('scent')} label="Scent view" />
      <Row label="Overlay">
        <Select<string>
          aria-label="Overlay" value={other}
          options={[{ value: 'none', label: 'None' }, ...OTHER_OVERLAYS.map((id) => ({ value: id, label: OVERLAY_WORD[id] }))]}
          onChange={(v) => { if (v === 'none') { if (set.other) setOverlay(set.other, false); } else setOverlay(v as OverlayId, true); }}
        />
      </Row>
    </>
  );
}

export function ControlsPanel({ ui, a, onCollapse }: { ui: PhotoUi; a: PhotoActions; onCollapse: () => void }) {
  const scaleOptions = [
    { value: 1, label: `Screen ${ui.caps.width}×${ui.caps.height}` },
    { value: 2, label: '2x', disabled: ui.caps.maxScale < 2, reason: 'This GPU cannot render twice the screen size.' },
  ];
  return (
    <aside class="ph-panel ui-surface" aria-label="Photo controls" data-testid="photo-panel">
      <header class="ph-head">
        <h2 class="ph-title">Photo mode</h2>
        <Button variant="ghost" onClick={onCollapse} aria-label="Collapse controls" data-testid="photo-collapse">Hide</Button>
      </header>
      <p class="ph-dim">Time is stopped. <KeyHint action="photo-mode">Leave</KeyHint></p>
      <div class="ph-subject" data-testid="photo-subject">
        <span class="ph-label">Subject</span>
        <span class="ph-subject-name">{ui.subject ?? 'None'}</span>
        <Button variant="secondary" onClick={() => a.frameSubject()} disabled={!ui.subject} data-testid="photo-frame">Frame</Button>
        <Toggle checked={ui.orbit} onChange={(on) => a.setOrbit(on)} disabled={!ui.subject} label="Orbit subject" />
      </div>
      <LensSliders ui={ui} a={a} />
      <Button variant="ghost" onClick={() => a.resetLens()} data-testid="photo-reset">Reset lens</Button>
      <Row label="Look">
        <SegmentedControl<string> aria-label="Look" value={ui.look} onChange={(v) => a.setLook(v)} options={ui.looks.map((l) => ({ value: l.id, label: l.label }))} />
      </Row>
      <Row label="Guides">
        <SegmentedControl<PhotoGuides> aria-label="Guides" value={ui.guides} onChange={(g) => a.setGuides(g)} options={PHOTO_GUIDES.map((g) => ({ value: g, label: g === 'off' ? 'Off' : g === 'thirds' ? 'Thirds' : 'Centre' }))} />
      </Row>
      <Toggle checked={ui.hideMarkers} onChange={(on) => a.setHideMarkers(on)} label="Hide markers and outlines" />
      <Overlays />
      <Row label="Size">
        <SegmentedControl<number> aria-label="Capture size" value={ui.captureScale} onChange={(n) => a.setCaptureScale(n)} options={scaleOptions} />
      </Row>
      <Button variant="primary" icon="camera" busy={ui.capturing} onClick={() => void a.capture(ui.captureScale)} data-testid="photo-capture">Capture</Button>
      {ui.error && <p class="ph-note is-warn" role="alert" data-testid="photo-error">{ui.error}</p>}
      <p class="ph-dim ph-keys">
        <KeyHint action="ph-capture">Capture</KeyHint> <KeyHint action="ph-guides">Guides</KeyHint> <KeyHint action="ph-focus">Focus here</KeyHint>
      </p>
    </aside>
  );
}
