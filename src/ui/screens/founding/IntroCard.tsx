// The wordless intro card (GDD 06 §5.3): a field-journal plate. A line drawing of the queen, small serif captions
// (species, locality and place token, season, day, time, weather and temperature) and three input glyphs. Any key
// or click skips it; it also closes by itself after 6 s (the flow).
import { KeyCap, hintLabel, currentBindings } from '../../components';
import type { FoundingUi } from './store';

/** A plain line drawing of a dealate queen in profile (original; head right). */
function QueenPlate() {
  return (
    <svg viewBox="0 0 208 144" aria-hidden="true" fill="none" stroke="#2b241b" stroke-width="1.6" stroke-linecap="round">
      <ellipse cx="62" cy="76" rx="40" ry="24" />
      <path d="M38 64 q24 -10 48 0" stroke-width="0.9" />
      <path d="M36 78 q26 -8 52 0" stroke-width="0.9" />
      <ellipse cx="114" cy="70" rx="22" ry="13" />
      <circle cx="104" cy="74" r="4" />
      <ellipse cx="152" cy="64" rx="14" ry="12" />
      <circle cx="158" cy="60" r="2.2" fill="#2b241b" />
      <path d="M163 70 l10 6 M163 72 l8 9" />
      <path d="M158 53 q14 -20 32 -14 M156 52 q8 -22 26 -28" />
      <path d="M108 82 q-8 18 -20 26 M116 83 q2 20 -6 34 M124 81 q12 16 18 34" />
      <path d="M100 80 l-14 22 l-10 6 M114 84 l-2 22 l-8 12 M126 80 l12 20 l12 10" stroke-width="1.1" />
      <path d="M118 58 l4 -6 M126 58 l2 -7" stroke-width="0.9" />
    </svg>
  );
}

export function IntroCard({ ui, reducedMotion, onSkip }: { ui: FoundingUi; reducedMotion: boolean; onSkip: () => void }) {
  const i = ui.intro;
  const key = (id: string, fallback: string) => hintLabel(currentBindings.value, id) ?? fallback;
  return (
    <div class={`fo-intro${reducedMotion ? ' is-instant' : ''}`} data-testid="founding-intro" onClick={onSkip}>
      <div class="fo-plate">
        <QueenPlate />
        <div class="fo-plate-cap">
          <div class="fo-plate-common">{i.common}</div>
          <div class="fo-plate-binomial">{i.binomial}</div>
          <div class="fo-plate-place">{i.locality} · {i.place}</div>
          <div class="fo-plate-when">{i.season} {i.day} · {i.clock}</div>
          <div class="fo-plate-when">{i.weather} · {i.tempC} °C</div>
        </div>
        <div class="fo-plate-glyphs" aria-hidden="true">
          <span class="fo-glyph"><KeyCap label="W" /><KeyCap label="A" /><KeyCap label="S" /><KeyCap label="D" /></span>
          <span class="fo-glyph"><KeyCap label={key('inspect', 'T')} /></span>
          <span class="fo-glyph"><KeyCap label={key('dig', 'F')} /></span>
        </div>
      </div>
    </div>
  );
}
