// Codex: the Interface category, which forms the in-game manual's short form (GDD 06 §10, GDD 08 §9.4). Written in the
// same voice as the field notes. These entries describe the game's own simplifications (directions K: the codex says
// so honestly) and point to the key bindings by action, never by a fixed key, because bindings can be changed.
import type { CodexEntry } from '../types';

export const INTERFACE_ENTRIES: readonly CodexEntry[] = [
  {
    id: 'cx-interface-orders',
    title: 'Orders without a commander',
    category: 'interface',
    species: ['ALL'],
    body:
      'No queen gives orders. A colony coordinates its work through each ant\'s local encounters and chemical cues, and ' +
      'how it does so differs from species to species; the work of Deborah Gordon on harvester ants, "Control without ' +
      'hierarchy", is one well-known account. The queen lays the eggs, and the research for this game describes her ' +
      'as doing little else once workers have emerged. A panel of priorities and a set of markers are therefore a ' +
      'simplification for play. Each worker still decides, one at a time, whether to take up the work.',
    inGame:
      'Colony orders shift the colony\'s targets for forage, nurse, dig and defend, its diet and its brood. Markers ' +
      'bias where the work goes. Nothing is forced: the ants answer in their own time.',
    related: ['cx-interface-markers', 'cx-polyethism'],
    controlActions: ['directives'],
  },
  {
    id: 'cx-interface-why',
    title: 'Why? The colony-health view',
    category: 'interface',
    species: ['ALL'],
    body:
      'A colony has no single number that says how it is doing, so the game keeps a list of causes. Each line reports ' +
      'one part of the colony, such as food intake, brood growth, nest space or the queen, and ranks its state as ' +
      'Good, Note, Strained or Failing. Opening a line shows the causes behind it, ranked by weight, each with its ' +
      'measured detail and unit. A cause can lead to another line, and to a place in the world that the camera can ' +
      'show. The remedies it suggests open the control concerned, and never change anything on their own.',
    inGame: 'Open the view from the colony pulse or with the Colony health key. Alerts open it at the line that raised them.',
    related: ['cx-interface-orders', 'cx-interface-time'],
    alwaysUnlocked: true,
    controlActions: ['why-view'],
  },
  {
    id: 'cx-interface-markers',
    title: 'Markers and the dig planner',
    category: 'interface',
    species: ['ALL'],
    body:
      'Markers are an explicit abstraction. In colony view you can place a mark to dig, forage, avoid, rally, ' +
      'open a new entrance, move the brood or move the queen, and the carpenter ant adds a satellite marker. A ' +
      'marker raises the chance that ants take up the work near it; it does not give an ant an order. The dig planner ' +
      'draws a ghost of a chamber, tunnel or shaft on the wall of the nest. A valid ghost is drawn with a dashed ' +
      'outline, and an invalid one is cross-hatched, with the reason written beside it. Each kind of marker has ' +
      'a limit.',
    inGame: 'Markers are placed in colony view. Select one and press {key:cv-delete} to cancel it.',
    related: ['cx-interface-orders', 'cx-material-loam'],
    alwaysUnlocked: true,
    controlActions: ['colony-view', 'cv-confirm', 'cv-delete', 'cv-slice-up', 'cv-slice-down'],
  },
  {
    id: 'cx-interface-time',
    title: 'Two clocks',
    category: 'interface',
    species: ['ALL'],
    body:
      'The game runs on two clocks. Ants walk, dig and share food in real time at their own scale, but development, ' +
      'ageing and the seasons run on a compressed calendar in which one game day stands for roughly 13 real days. ' +
      'A year is 28 game days, with seven days to a season, and one game day lasts ten real minutes at normal speed. ' +
      'You can pause, or run at two, four or eight times normal speed, and the highest speed is for watching, not ' +
      'for controlling an ant. The first brood and each winter are time-lapses that can be skipped.',
    inGame: 'Pause, the speed keys and Skip to next event are listed under Controls. Rebinding a key changes the key hint in the game too.',
    related: ['cx-brood-warmth', 'cx-hibernation'],
    alwaysUnlocked: true,
    controlActions: ['pause-toggle', 'speed-1', 'speed-2', 'speed-4', 'speed-8', 'skip-ahead'],
  },
];
