// The registry: every replaced sound, its seed, its level convention and the range its measurements must fall in.
// `expect` is what the sound's job calls for (centroid in Hz and the share of spectral energy above 2 kHz); the reason is
// written next to each range. Ranges are checked by tools/audio/measure.ts and the provenance test.
import * as beds from './beds.mjs';
import * as foley from './foley.mjs';
import * as wood from './wood.mjs';
import * as giants from './giants.mjs';
import * as creatures from './creatures.mjs';
import * as ui from './ui.mjs';

import fs from 'node:fs';
const OLD = JSON.parse(fs.readFileSync(new URL('./old-levels.json', import.meta.url), 'utf8')).files;
/** One-shots keep the loudness of the file they replace (see old-levels.json). */
const shot = (id) => ({ oneShot: true, peakDb: -3, matchMeanLufs: OLD[id].meanLufs });

const BED = { loop: true, lufs: -24 };
const LOOP22 = { loop: true, lufs: -22 };

export const SOUNDS = [
  { id: 'audio/ambience/crickets_night', channels: 1, seed: 1101, ...BED, render: beds.cricketsNight,
    role: 'night insects, dense and steady', expect: { centroidHz: [3000, 5200], above2k: [0.8, 1], why: 'cricket carriers sit at 2.7-5.1 kHz' } },
  { id: 'audio/ambience/rain_heavy', channels: 1, seed: 1102, ...BED, render: beds.rainHeavy,
    role: 'steady heavy rain', expect: { centroidHz: [1500, 4500], above2k: [0.4, 0.95], why: 'broadband hiss with drop transients, low thrum underneath' } },
  { id: 'audio/ambience/street_suburban', channels: 1, seed: 1103, ...BED, render: beds.streetSuburban,
    role: 'suburban street wash with far cars and birds', expect: { centroidHz: [250, 1500], above2k: [0, 0.3], why: 'a wash that is mostly 140 Hz-2.6 kHz' } },
  { id: 'audio/ambience/traffic_distant', channels: 1, seed: 1104, ...BED, render: beds.trafficDistant,
    role: 'distant city traffic, low rumble character', expect: { centroidHz: [130, 600], above2k: [0, 0.15], why: 'low-passed wash, rumble under 110 Hz' } },
  { id: 'audio/ambience/playground_distant', channels: 1, seed: 1105, ...BED, render: beds.playgroundDistant,
    role: 'voice-less distant play-area activity', expect: { centroidHz: [400, 2200], above2k: [0.05, 0.5], why: 'band 120 Hz-4.2 kHz wash, knocks and clinks' } },
  { id: 'audio/ambience/underground_rumble', channels: 2, seed: 1106, loop: true, lufs: -26, render: beds.undergroundRumble,
    role: 'deep earth rumble', expect: { centroidHz: [30, 200], above2k: [0, 0.02], why: 'low-passed at 320 Hz, drones at 38-57 Hz' } },

  // ---- ground foley
  { id: 'audio/sfx/soil_scrape_01', channels: 1, seed: 2101, ...shot('audio/sfx/soil_scrape_01'), render: foley.soilScrape01,
    role: 'blade scraping dry soil (played pitched up 12-19 semitones for ant scale)', expect: { centroidHz: [900, 4000], why: 'grit grains in 0.9-5 kHz over a dull 700 Hz body' } },
  { id: 'audio/sfx/soil_scrape_02', channels: 1, seed: 2102, ...shot('audio/sfx/soil_scrape_02'), render: foley.soilScrape02,
    role: 'shovel in soil: plunge, then two coarser strokes', expect: { centroidHz: [1200, 3500], why: 'coarser grit (0.65-4.2 kHz) with a low plunge knock' } },
  { id: 'audio/sfx/gravel_grit_02', channels: 1, seed: 2103, ...shot('audio/sfx/gravel_grit_02'), render: foley.gravelGrit02,
    role: 'stone ticks from three sliding steps', expect: { centroidHz: [1500, 3400], why: 'short stone ticks rung at 1.9-5.4 kHz' } },
  { id: 'audio/sfx/gravel_grit_03', channels: 1, seed: 2104, ...shot('audio/sfx/gravel_grit_03'), render: foley.gravelGrit03,
    role: 'stone ticks, second take', expect: { centroidHz: [1500, 3400], why: 'as grit_02, bands 1.7-5 kHz' } },
  { id: 'audio/sfx/crunch_03', channels: 1, seed: 2105, ...shot('audio/sfx/crunch_03'), squash: 3, render: foley.crunch03,
    role: 'dry brittle crackle and crunch', expect: { centroidHz: [2000, 4800], why: 'cracks in 1.2-6.2 kHz, a few low pops' } },
  // ---- wood
  { id: 'audio/sfx/wood_creak_01', channels: 1, seed: 2201, ...shot('audio/sfx/wood_creak_01'), render: wood.woodCreak01,
    role: 'light wood creak', expect: { centroidHz: [500, 2600], why: 'slip pulses at 150-235 Hz rung through 0.7-3 kHz wood modes' } },
  { id: 'audio/sfx/wood_creak_02', channels: 1, seed: 2202, ...shot('audio/sfx/wood_creak_02'), render: wood.woodCreak02,
    role: 'creaky wood, two long strokes', expect: { centroidHz: [350, 2000], why: 'slower slip (75-150 Hz), lower modes 0.36-1.8 kHz' } },
  { id: 'audio/sfx/wood_creak_03', channels: 1, seed: 2203, ...shot('audio/sfx/wood_creak_03'), render: wood.woodCreak03,
    role: 'tree creak, long and low', expect: { centroidHz: [450, 2200], why: 'very slow slip (40-95 Hz), modes 0.2-1.5 kHz' } },
  { id: 'audio/sfx/wood_rasp_01', channels: 1, seed: 2204, ...shot('audio/sfx/wood_rasp_01'), squash: 2, render: wood.woodRasp01,
    role: 'rough tooth drawn over wood (stand-in for gnawing)', expect: { centroidHz: [450, 1900], why: 'noisy grains rung at 1.5-3.9 kHz' } },
  { id: 'audio/sfx/wood_rasp_02', channels: 1, seed: 2205, ...shot('audio/sfx/wood_rasp_02'), render: wood.woodRasp02,
    role: 'finer, faster rasp (ant-scale gnaw)', expect: { centroidHz: [550, 2200], why: 'as rasp_01 raised by about a quarter' } },
  // ---- giants
  { id: 'audio/sfx/thud_giant_step_01', channels: 1, seed: 2301, ...shot('audio/sfx/thud_giant_step_01'), lowCutHz: 20, render: giants.thudGiantStep01,
    role: 'giant footfall: heavy boom on a wooden floor', expect: { centroidHz: [110, 400], why: 'low-passed at 700 Hz with a bass shelf; body 52-115 Hz' } },
  { id: 'audio/sfx/thud_giant_step_02', channels: 1, seed: 2302, ...shot('audio/sfx/thud_giant_step_02'), lowCutHz: 20, render: giants.thudGiantStep02,
    role: 'giant footfall: hollow wooden surface', expect: { centroidHz: [110, 400], why: 'floor modes 74-262 Hz ringing' } },
  { id: 'audio/sfx/lawnmower_loop', channels: 1, seed: 2303, ...LOOP22, render: giants.lawnmowerLoop,
    role: 'petrol mower running (engine loop)', expect: { centroidHz: [600, 2800], why: 'engine pulses at 27 Hz with exhaust modes to 620 Hz, blade hiss to 5 kHz' } },
  { id: 'audio/sfx/lawnmower_push_loop', channels: 1, seed: 2304, ...LOOP22, render: giants.lawnmowerPushLoop,
    role: 'push reel mower (blade clicks and whirr)', expect: { centroidHz: [1200, 3600], why: 'clicks rung at 0.95-4.1 kHz, whirr around 1.7 kHz' } },
  { id: 'audio/sfx/car_pass_01', channels: 1, seed: 2305, ...shot('audio/sfx/car_pass_01'), squash: 3, lowCutHz: 60, fadeOutS: 0.3, render: giants.carPass01,
    role: 'car driving past (older car, steady)', expect: { centroidHz: [250, 900], why: 'engine harmonics under 700 Hz and tyre noise 0.25-2.4 kHz' } },
  { id: 'audio/sfx/car_pass_02', channels: 1, seed: 2306, ...shot('audio/sfx/car_pass_02'), squash: 4, lowCutHz: 60, fadeOutS: 0.3, render: giants.carPass02,
    role: 'car passing in low gear', expect: { centroidHz: [250, 900], why: 'higher engine order, less tyre noise' } },
  { id: 'audio/sfx/broom_sweep_01', channels: 1, seed: 2307, ...shot('audio/sfx/broom_sweep_01'), render: giants.broomSweep01,
    role: 'push broom on a dirty floor', expect: { centroidHz: [1500, 4800], why: 'bristle hiss centred 2.2-4 kHz, grit ticks, dull sweep' } },
  { id: 'audio/sfx/broom_sweep_02', channels: 1, seed: 2308, ...shot('audio/sfx/broom_sweep_02'), render: giants.broomSweep02,
    role: 'push broom, second take', expect: { centroidHz: [1500, 4800], why: 'as broom_01' } },
  // ---- insects
  { id: 'audio/sfx/insect_wing_buzz_01', channels: 1, seed: 2401, ...shot('audio/sfx/insect_wing_buzz_01'), squash: 2.5, render: creatures.insectWingBuzz01,
    role: 'a fly flying past', expect: { centroidHz: [1200, 3600], why: 'wingbeat near 190 Hz with harmonics to 3 kHz' } },
  { id: 'audio/sfx/insect_wing_buzz_02', channels: 1, seed: 2402, ...shot('audio/sfx/insect_wing_buzz_02'), render: creatures.insectWingBuzz02,
    role: 'a swarm of bees', expect: { centroidHz: [900, 3000], why: 'seven wingbeats at 205-255 Hz, harmonics to 3 kHz' } },
  { id: 'audio/sfx/cricket_chirp_01', channels: 1, seed: 2403, ...shot('audio/sfx/cricket_chirp_01'), render: creatures.cricketChirp01,
    role: 'two crickets chirping', expect: { centroidHz: [3800, 5200], why: 'cricket carriers 4.15 and 4.6 kHz' } },
  { id: 'audio/sfx/cricket_chirp_02', channels: 1, seed: 2404, ...shot('audio/sfx/cricket_chirp_02'), render: creatures.cricketChirp02,
    role: 'a cricket chirping three times', expect: { centroidHz: [3800, 5000], why: 'carrier 4.3 kHz' } },
  { id: 'audio/sfx/stridulation_grasshopper_01', channels: 1, seed: 2405, ...shot('audio/sfx/stridulation_grasshopper_01'), render: creatures.stridulationGrasshopper,
    role: 'grasshopper stridulation, three phrases', expect: { centroidHz: [2800, 6200], why: 'scrape pulses in 2.5-7 kHz (the cue raises it a fifth)' } },
  // ---- interface and water
  { id: 'audio/sfx/ui_click_01', channels: 1, seed: 2501, ...shot('audio/sfx/ui_click_01'), render: ui.uiClick01,
    role: 'soft UI click', expect: { centroidHz: [1200, 3600], why: 'tick at 3.2 kHz over a 1.5 kHz tone' } },
  { id: 'audio/sfx/ui_click_02', channels: 1, seed: 2502, ...shot('audio/sfx/ui_click_02'), render: ui.uiClick02,
    role: 'softer, lower UI click', expect: { centroidHz: [1200, 3500], why: 'tone at 1.05 kHz' } },
  { id: 'audio/sfx/ui_click_03', channels: 1, seed: 2503, ...shot('audio/sfx/ui_click_03'), squash: 6, render: ui.uiClick03,
    role: 'short sharp UI tick', expect: { centroidHz: [3500, 8500], why: 'tone at 2.4 kHz, tick at 4.2 kHz' } },
  { id: 'audio/sfx/ui_hover_01', channels: 1, seed: 2504, ...shot('audio/sfx/ui_hover_01'), render: ui.uiHover01,
    role: 'UI hover blip', expect: { centroidHz: [550, 1100], why: 'sine glide 1.7-2.15 kHz' } },
  { id: 'audio/sfx/ui_switch_01', channels: 1, seed: 2505, ...shot('audio/sfx/ui_switch_01'), squash: 3, render: ui.uiSwitch01,
    role: 'UI toggle: two clicks', expect: { centroidHz: [1000, 3200], why: 'two clicks at 1.25 kHz and 0.82 kHz' } },
  { id: 'audio/sfx/water_drip_01', channels: 1, seed: 2506, ...shot('audio/sfx/water_drip_01'), squash: 3, render: ui.waterDrip01,
    role: 'a drip in a hollow room, with a second smaller drop', expect: { centroidHz: [900, 3200], why: 'bubble 0.8-1.3 kHz, splash tick near 3.4 kHz' } },
  { id: 'audio/sfx/water_drip_02', channels: 1, seed: 2507, ...shot('audio/sfx/water_drip_02'), render: ui.waterDrip02,
    role: 'a higher drip and two smaller ones', expect: { centroidHz: [900, 3400], why: 'bubble 0.96-1.8 kHz' } },
];
