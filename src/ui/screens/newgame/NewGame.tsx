// New Game setup (GDD 08 3.7): species cards, locality archetype, size, seed, starting season, difficulty presets
// with custom rules, hints, Begin. Reads and writes the form signal; Begin sends the request through the facade
// and the snapshot then switches to the loading screen. No game logic here.
import { useState } from 'preact/hooks';
import type { ArchetypeId, DifficultyId, SpeciesId } from '@/sim/types';
import { Icon } from '../../icons';
import { Button, Field, RadioCards, ScrollArea, SegmentedControl, Stepper, TextField, Toggle, BookPage, cx, type RadioCardOption } from '../../components';
import { facade } from '../../store';
import { updateNav } from '../nav';
import { AntPlate } from '../plates/AntPlate';
import { applyPreset, buildRequest, isCustom, lastRequest, LOCALITY_ARCHETYPES, newGameForm, setRule, type NewGameForm } from './form';
import { randomSeedText, resolveSeed, SEED_MAX_CHARS } from './seed';
import { suitability, zoneChips } from './locality';
import { isSpeciesAvailable, SHOW_UNRELEASED_SPECIES, SPECIES_CARDS, speciesCard } from './species';

const ARCHETYPE_NAMES: Record<ArchetypeId | 'random', string> = {
  'woodland-edge': 'Woodland Edge', 'suburban-garden': 'Suburban Garden', 'playground-park': 'Playground Park',
  'car-park-verge': 'Car Park Verge', 'kitchen-door': 'Kitchen Door', 'field-margin': 'Field Margin', random: 'Random',
};

const SIZE_BU = { compact: 3000, standard: 4000, large: 5000 } as const;

const PRESET_TEXT: Record<DifficultyId, { name: string; text: string }> = {
  gentle: { name: 'Gentle', text: 'Fewer predators and rivals, kinder weather and a lenient first season. Mistakes can be recovered from.' },
  naturalist: { name: 'Naturalist', text: 'Close to the biology. The first season is risky, the seasons are real and the colony is yours to keep alive.' },
  harsh: { name: 'Harsh', text: 'Dense predators and rivals, severe weather and a strict founding. Losing colonies is the usual outcome.' },
};

function Complexity({ n }: { n: number }) {
  return (
    <span class="ui-dots" role="img" aria-label={`Complexity ${n} of 3`}>
      {[1, 2, 3].map((i) => <span key={i} class={cx('ui-dot', i <= n && 'is-on')} />)}
    </span>
  );
}

function SpeciesColumn({ form, set }: { form: NewGameForm; set: (f: NewGameForm) => void }) {
  const options: RadioCardOption<SpeciesId>[] = SPECIES_CARDS
    .filter((c) => SHOW_UNRELEASED_SPECIES || isSpeciesAvailable(c.id))
    .sort((a, b) => Number(isSpeciesAvailable(b.id)) - Number(isSpeciesAvailable(a.id)))
    .map((c) => ({ value: c.id, disabled: !isSpeciesAvailable(c.id), reason: 'Not yet available' }));
  return (
    <RadioCards
      aria-label="Species" options={options} value={form.species} onChange={(species) => set({ ...form, species })} class="ui-stack"
      render={(o, selected) => {
        const c = speciesCard(o.value);
        return (
          <div class="ui-species">
            <AntPlate species={c.id} class="ui-species-plate" />
            <div class="ui-species-body">
              <h3 class="ui-species-name">{c.commonName}</h3>
              <p class="ui-binomial">{c.binomial}</p>
              <p class="ui-species-line">{c.playstyle}</p>
              <p class="ui-species-meta"><span class="ui-meta-key">Founding</span> {c.founding}</p>
              <div class="ui-species-foot">
                <span class="ui-species-castes">{c.castes.map((i) => <Icon key={i} name={i} size={20} label={i.replace('ant-', '')} />)}</span>
                <Complexity n={c.complexity} />
              </div>
              {o.disabled && <span class="ui-species-flag">Not yet available</span>}
              {selected && <Icon name="check" size={18} class="ui-card-check" decorative />}
            </div>
          </div>
        );
      }}
    />
  );
}

function LocalityColumn({ form, set }: { form: NewGameForm; set: (f: NewGameForm) => void }) {
  const resolved = resolveSeed(form.seedText);
  const ids: (ArchetypeId | 'random')[] = [...LOCALITY_ARCHETYPES, 'random'];
  const options: RadioCardOption<ArchetypeId | 'random'>[] = ids.map((value) => ({ value }));
  const card = speciesCard(form.species);
  const seasonWord = card.foundingSeason[0].toUpperCase() + card.foundingSeason.slice(1);
  return (
    <>
      <RadioCards
        aria-label="Locality" options={options} value={form.archetype} onChange={(archetype) => set({ ...form, archetype })} class="ui-stack is-tight"
        render={(o, selected) => (
          <div class="ui-locality">
            <span class="ui-locality-name">{ARCHETYPE_NAMES[o.value]}</span>
            <span class="ui-locality-chips">
              {o.value === 'random' ? <span class="ui-zonechip">chosen for your species</span> : zoneChips(o.value).map((z) => <span key={z} class="ui-zonechip">{z}</span>)}
            </span>
            {o.value !== 'random' && <span class={cx('ui-suit', `is-${suitability(o.value, form.species).toLowerCase()}`)}>{suitability(o.value, form.species)}</span>}
            {selected && <Icon name="check" size={18} class="ui-card-check" decorative />}
          </div>
        )}
      />
      <Field label="Size" layout="stack">
        <SegmentedControl
          value={form.size} onChange={(size) => set({ ...form, size })}
          options={[{ value: 'compact', label: 'Compact' }, { value: 'standard', label: 'Standard' }, { value: 'large', label: 'Large' }]}
        />
        <span class="ui-field-help">Locality edge: {SIZE_BU[form.size]} body units.</span>
      </Field>
      <Field label="Seed" layout="stack">
        <div class="ui-seedrow">
          <TextField
            value={form.seedText} onInput={(seedText) => set({ ...form, seedText })} mono maxLength={SEED_MAX_CHARS}
            aria-label="Seed" data-testid="seed-field"
          />
          <Button icon="dice" onClick={() => set({ ...form, seedText: randomSeedText() })} data-testid="randomise">Randomise</Button>
        </div>
        <span class="ui-seed-code" data-testid="seed-code">Seed code <span class="ui-mono">{resolved.code}</span>{resolved.mode === 'hash' ? ' (from your text)' : ''}</span>
      </Field>
      <Field label="Starting season" layout="stack">
        <SegmentedControl
          value={form.startSeason} onChange={(startSeason) => set({ ...form, startSeason })}
          options={[
            { value: 'natural', label: 'Natural' }, { value: 'spring', label: 'Spring' }, { value: 'summer', label: 'Summer' },
            { value: 'autumn', label: 'Autumn' }, { value: 'winter' as never, label: 'Winter', disabled: true, reason: 'Queens do not found in frost.' },
          ]}
        />
        <span class="ui-field-help">Natural begins in {seasonWord}, on day 3, the season {card.commonName.toLowerCase()} queens found in.</span>
      </Field>
    </>
  );
}

function CustomRules({ form, set }: { form: NewGameForm; set: (f: NewGameForm) => void }) {
  const [open, setOpen] = useState(false);
  const r = form.rules;
  return (
    <div class="ui-custom">
      <button type="button" class="ui-disclosure" aria-expanded={open ? 'true' : 'false'} aria-controls="custom-rules" onClick={() => setOpen(!open)} data-testid="custom-toggle">
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={18} decorative />
        <span>Custom rules</span>
      </button>
      {open && (
        <div id="custom-rules" class="ui-custom-body">
          <Field label="Predators" layout="stack">
            <SegmentedControl value={r.predators} onChange={(v) => set(setRule(form, 'predators', v))} options={[{ value: 'off', label: 'Off' }, { value: 'few', label: 'Few' }, { value: 'normal', label: 'Normal' }, { value: 'many', label: 'Many' }]} />
          </Field>
          <Field label="Rival colonies">
            <Stepper value={r.rivals} min={0} max={4} step={1} onChange={(v) => set(setRule(form, 'rivals', v))} />
          </Field>
          <Field label="Human activity" layout="stack">
            <SegmentedControl value={r.humanActivity} onChange={(v) => set(setRule(form, 'humanActivity', v))} options={[{ value: 'off', label: 'Off' }, { value: 'low', label: 'Low' }, { value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }]} />
          </Field>
          <Field label="Weather severity" layout="stack">
            <SegmentedControl value={r.weatherSeverity} onChange={(v) => set(setRule(form, 'weatherSeverity', v))} options={[{ value: 'none', label: 'None' }, { value: 'mild', label: 'Mild' }, { value: 'normal', label: 'Normal' }, { value: 'severe', label: 'Severe' }]} />
          </Field>
          <Field label="Season length (days)" layout="stack">
            <SegmentedControl value={r.seasonLengthDays} onChange={(v) => set(setRule(form, 'seasonLengthDays', v))} options={[{ value: 5, label: '5' }, { value: 7, label: '7' }, { value: 10, label: '10' }]} />
          </Field>
          <Field label="Founding leniency" layout="stack">
            <SegmentedControl value={r.foundingLeniency} onChange={(v) => set(setRule(form, 'foundingLeniency', v))} options={[{ value: 'lenient', label: 'Lenient' }, { value: 'normal', label: 'Normal' }, { value: 'strict', label: 'Strict' }]} />
          </Field>
          <Field label="Nest collapse">
            <Toggle checked={r.collapse} onChange={(v) => set(setRule(form, 'collapse', v))} />
          </Field>
          <p class="ui-field-help">Rival count and season length are fixed when the world is generated.</p>
        </div>
      )}
    </div>
  );
}

function RulesColumn({ form, set }: { form: NewGameForm; set: (f: NewGameForm) => void }) {
  const custom = isCustom(form);
  const presets = (['gentle', 'naturalist', 'harsh'] as const).map((value) => ({ value }));
  const options: RadioCardOption<DifficultyId | 'custom'>[] = custom ? [...presets, { value: 'custom' }] : presets;
  return (
    <>
      <RadioCards
        aria-label="Difficulty" options={options} value={custom ? 'custom' : form.preset} class="ui-stack is-tight"
        onChange={(v) => { if (v !== 'custom') set(applyPreset(form, v)); }}
        render={(o, selected) => (
          <div class="ui-difficulty">
            <span class="ui-difficulty-name">{o.value === 'custom' ? 'Custom' : PRESET_TEXT[o.value].name}</span>
            <span class="ui-difficulty-text">{o.value === 'custom' ? `Your own rules, starting from ${PRESET_TEXT[form.preset].name}.` : PRESET_TEXT[o.value].text}</span>
            {selected && <Icon name="check" size={18} class="ui-card-check" decorative />}
          </div>
        )}
      />
      <CustomRules form={form} set={set} />
      <Field label="Hints">
        <Toggle checked={form.hints} onChange={(hints) => set({ ...form, hints })} />
      </Field>
    </>
  );
}

export function NewGame({ onClose }: { onClose: () => void }) {
  const form = newGameForm.value;
  const set = (f: NewGameForm) => { newGameForm.value = f; };
  const f = facade.value;
  const begin = () => {
    if (!f) return;
    const req = buildRequest(newGameForm.value);
    lastRequest.value = req;
    updateNav((n) => ({ ...n, afterLoadingCancel: 'new-game' }));
    void f.newGame(req);
  };
  return (
    <BookPage title="New colony" onClose={onClose} initialFocus="[role=radio][aria-checked=true]" class="ui-newgame">
      <div class="ui-columns">
        <section class="ui-column" aria-label="Species">
          <h2 class="ui-column-title">Species</h2>
          <ScrollArea label="Species list" class="ui-column-scroll"><SpeciesColumn form={form} set={set} /></ScrollArea>
        </section>
        <section class="ui-column" aria-label="Locality">
          <h2 class="ui-column-title">Locality</h2>
          <ScrollArea label="Locality options" class="ui-column-scroll"><LocalityColumn form={form} set={set} /></ScrollArea>
        </section>
        <section class="ui-column" aria-label="Rules">
          <h2 class="ui-column-title">Rules</h2>
          <ScrollArea label="Rules" class="ui-column-scroll"><RulesColumn form={form} set={set} /></ScrollArea>
        </section>
      </div>
      <div class="ui-newgame-foot">
        <Button variant="primary" block class="ui-begin" onClick={begin} disabled={!f} data-testid="begin">Begin</Button>
      </div>
    </BookPage>
  );
}
