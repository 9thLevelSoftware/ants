// Codex: weather, seasons and the human scale of events (GDD 06 §10).
import type { CodexEntry } from '../types';

export const WEATHER_ENTRIES: readonly CodexEntry[] = [
  {
    id: 'cx-raindrops',
    title: 'Rain at ant scale',
    category: 'weather',
    species: ['ALL'],
    body:
      'A drop of drizzle is less than 0.5 to 1 mm across and falls slower than 1 m/s. A 2 mm raindrop weighs about 4 mg, ' +
      'several times as much as a black garden ant worker, which weighs about 1 mg. Drops of 4 to 5 mm weigh 34 to ' +
      '65 mg and fall at about 9 m/s; larger drops break up, and drops above 5 to 6 mm are rare. Measured ' +
      'speeds in turbulent rain can be 25 to 30 percent below the terminal speed. For an ant in the open, a heavy ' +
      'shower is a series of heavy impacts.',
    inGame: 'Rain falls as separate impacts: small drops only wet an ant, shower drops can knock it off a wall, and downpour drops are dangerous in the open and harmless under a leaf, a stone or in a tunnel.',
    related: ['cx-material-water', 'cx-dew'],
  },
  {
    id: 'cx-hot-surfaces',
    title: 'Hot ground',
    category: 'weather',
    species: ['ALL'],
    body:
      'Sunlit asphalt exceeds 50 degrees Celsius in summer. Ants can lose muscle control well below that. In a ' +
      'study of 27 ant species, the lowest critical thermal maximum was 38.3 degrees, and at a species\' limit the ' +
      'ants collapsed after 8.5 minutes on average in a slow temperature ramp and 2.2 minutes in a fast one. A figure ' +
      'for the black garden ant was not found. Two harvester ant species in Almería began collecting in the evening, ' +
      'once the soil surface fell below 40 degrees.',
    inGame:
      'Heat stress begins at about 35 degrees on the ant and ends in paralysis at 40 to 42 degrees, which are design ' +
      'estimates. A foraging ant that is hot looks for shade.',
    related: ['cx-habitat-asphalt', 'cx-night-foraging'],
  },
  {
    id: 'cx-dew',
    title: 'Dew',
    category: 'weather',
    species: ['ALL'],
    body:
      'Dew settles on the blades and the ground after clear nights, and in summer it is common in the morning. The ' +
      'droplets are an estimated 0.2 to 2 mm across, hundreds to the square centimetre on a blade. To an ant they are ' +
      'a drink, and a sticky hazard to walk through. The dew is estimated to be gone by about nine or ten in the ' +
      'morning. The research used for this game did not measure droplet sizes or timing, and the figures ' +
      'here are the game\'s estimates.',
    inGame: 'Dew is a short morning source of water. It makes plants and tile more slippery until it dries.',
    related: ['cx-frost', 'cx-material-water'],
  },
  {
    id: 'cx-frost',
    title: 'Ground frost',
    category: 'weather',
    species: ['ALL'],
    body:
      'Air frost forms on clear, cold nights, and rime coats the blades. Ants shelter underground, where the soil ' +
      'lags behind the air in cooling. Flight is impossible, and activity needs warm patches. Black carpenter ants ' +
      'are inactive below about 5 degrees Celsius. Winter frost brings other hazards: frozen puddles, de-icing salt ' +
      'on paving, and snow, which insulates a nest. A late frost in spring is a risk as well.',
    inGame: 'The first frost of the year is noted in the journal. A colony underground stays above freezing.',
    related: ['cx-hibernation', 'cx-dew'],
  },
  {
    id: 'cx-wind',
    title: 'Wind',
    category: 'weather',
    species: ['ALL'],
    body:
      'Wind near the ground is a fraction of what a weather station reports: 1 m/s at 2 m is thought to be about 0.1 to ' +
      '0.3 m/s at ground level, though that ratio is an estimate. Winged black garden ants were seen only in wind ' +
      'below 6.3 m/s, and an older study found no flights above about 1.7 m/s at 2 m early in the season. Wind blows ' +
      'light prey about, topples small ants on grass tips, and helps winged ants once they are in the air.',
    inGame: 'Gusts can topple an ant on a tall stem, and strong wind rules a day out for flights.',
    related: ['cx-nuptial-flight', 'cx-raindrops'],
  },
  {
    id: 'cx-brood-warmth',
    title: 'Warmth and development',
    category: 'weather',
    species: ['ALL'],
    body:
      'Ant brood develops faster in warm chambers and stops in the cold. In the black garden ant, the queen stops laying ' +
      'before winter and the brood overwinters as larvae. Carpenter ants keep older brood in drier, warmer satellite ' +
      'nests, where it develops faster. Leafcutter workers move fungus and brood to chambers of 21 to 25 degrees ' +
      'Celsius when they have the choice. The temperature below which development halts has not been measured for ' +
      'these species.',
    inGame: 'For the black garden ant, development is switched off at about 10 degrees, an estimate, and speeds up as the chamber warms. The nursery is the warmest chamber.',
    related: ['cx-brood-stages', 'cx-overwinter-larvae'],
  },
  {
    id: 'cx-hibernation',
    title: 'The cold months',
    category: 'weather',
    species: ['LN', 'CP', 'MB'],
    body:
      'In a laboratory experiment, black garden ant workers survived less well at 2 degrees Celsius than at 7 to 8 degrees, ' +
      'while the survival of founding queens was not affected. Keepers hibernate colonies at 5 to 10 degrees for a few ' +
      'months, which is hobbyist practice and not a field measurement. The colony\'s dormancy is partly internal, a ' +
      'timer that does not depend only on temperature. Black carpenter ants enter diapause in September or October, ' +
      'and kept at a constant temperature they do not overwinter.',
    inGame: 'Winter is a time-lapse with a Winter Report. It can be skipped, and the result is the same either way.',
    related: ['cx-overwinter-larvae', 'cx-frost'],
  },
  {
    id: 'cx-overwinter-larvae',
    title: 'Larvae through the winter',
    category: 'weather',
    species: ['LN', 'CP'],
    body:
      'Queens stop laying before winter, and the brood overwinters as larvae. Development resumes in spring as the soil ' +
      'warms. In the black garden ant all brood is converted to larvae before or during hibernation. In the black ' +
      'carpenter ant the larva is the only overwintering stage: eggs laid in late summer overwinter as larvae and ' +
      'become workers the next June or July, and a spring brood takes 55 to 70 days to grow from egg to worker in an ' +
      'established colony.',
    inGame: 'The Winter Report lists the workers lost and the stores used. Larvae are the brood that carry on in spring.',
    related: ['cx-hibernation', 'cx-brood-warmth'],
  },
];
