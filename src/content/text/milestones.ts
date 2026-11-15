// Milestone titles and journal lines (GDD 06 §8; GDD 03 nest milestones). Calm naturalist voice, no score, no
// exclamation marks. Tokens: {n} {depth_mm} {zone} {zone_from} {zone_to} {species} {doy_date}. Ids are
// MILESTONE_IDS; changing a text never changes an id.
import type { MilestoneId, SpeciesId } from '@/sim/types';

export interface MilestoneText {
  title: string;
  /** Journal line (a template; see the tokens above). */
  text: string;
  /** Species the milestone belongs to; absent means every species (GDD 06 §8 species column). */
  species?: readonly SpeciesId[];
}

export const MILESTONE_TEXT: Record<MilestoneId, MilestoneText> = {
  'ms-first-shaft': { title: 'A shaft in the soil', text: 'The queen has driven a shaft {depth_mm} mm into the ground. Pellets of soil lie scattered at the entrance, where she left them.' },
  'ms-founding-chamber': { title: 'A chamber closed on all sides', text: 'At the foot of the shaft she has widened a small cell, barely larger than herself. It will hold everything she raises.' },
  'ms-sealed-in': { title: 'Sealed in', text: 'The entrance is plugged with soil. From here she will not feed; her body is the only store.' },
  'ms-first-eggs': { title: 'The first eggs', text: 'The first eggs lie in a small pile. She turns them and licks them clean.' },
  'ms-first-larva': { title: 'Larvae', text: 'The first larvae have hatched. She feeds them from her own reserves.' },
  'ms-first-pupa': { title: 'Cocoons', text: 'The larvae have spun cocoons. Development now needs only warmth.' },
  'ms-first-worker': { title: 'The first worker', text: 'The first worker has emerged. She is smaller than the workers that will follow and paler than her mother; she will darken as her body hardens.' },
  'ms-nest-reopened': { title: 'The nest reopens', text: 'A worker has opened the plug and stood in daylight for the first time. The colony is no longer closed.' },
  'ms-first-food': { title: 'First food', text: 'A worker has returned with food. The colony now depends on more than the queen\'s reserves.' },
  'ms-first-honeydew': { title: 'Honeydew', text: 'A forager has come home carrying honeydew, the sugary liquid that aphids excrete.' },
  'ms-first-prey': { title: 'First protein', text: 'A small animal has been dragged into the nest. The larvae can now grow on more than sugar.' },
  'ms-first-trail': { title: 'A trail', text: 'Three ants have followed the same line of scent. Each ant that follows it strengthens it, and a line that is not followed fades.' },
  'ms-second-chamber': { title: 'A second chamber', text: 'The nest has a second chamber. Brood can be kept apart from stores.' },
  'ms-nursery': { title: 'A nursery', text: 'Brood has been gathered in one chamber, the warmest the nest has.' },
  'ms-first-midden': { title: 'The refuse heap', text: 'The dead and the discarded now lie in one place, away from the brood.' },
  'ms-second-entrance': { title: 'A second way out', text: 'A second entrance opens to the surface. The nest is harder to block now.' },
  'ms-depth-50': { title: 'Fifty body lengths down', text: 'The deepest gallery now lies fifty body lengths below the surface, where the soil barely feels the day.' },
  'ms-depth-100': { title: 'A hundred down', text: 'The nest reaches a hundred body lengths into the ground.' },
  'ms-chambers-10': { title: 'Ten chambers', text: 'Ten chambers now open off the galleries.' },
  'ms-volume-1000': { title: 'A larger nest', text: 'The nest has grown to a thousand cubic body lengths of tunnels and rooms.' },
  'ms-first-aphid-herd': { title: 'Herding aphids', text: 'Workers stand among a cluster of aphids, stroking them with their antennae for droplets.' },
  'ms-first-possession': { title: 'Seen from within', text: 'For the first time the colony has been seen from the height of a worker.' },
  'ms-first-trophallaxis': { title: 'Mouth to mouth', text: 'Food has passed from crop to mouth. The same act carries nutrients, and anything toxic, through the whole colony.' },
  'ms-zone-crossed': { title: 'Across the boundary', text: 'A forager has crossed from {zone_from} onto {zone_to}. The ground underfoot has changed.' },
  'ms-micro-connection': { title: 'A narrow way', text: 'A crack too narrow for a larger animal has opened a route. A single body length of passage can join two worlds.' },
  'ms-workers-25': { title: 'Twenty-five workers', text: 'Twenty-five workers now share the work.' },
  'ms-workers-100': { title: 'A hundred workers', text: 'The colony has passed a hundred workers. Individual ants matter less, and the trails more.' },
  'ms-workers-500': { title: 'Five hundred', text: 'The colony has passed five hundred workers.' },
  'ms-workers-1000': { title: 'A thousand', text: 'The colony has passed a thousand workers.' },
  'ms-stage-growing': { title: 'A growing colony', text: 'The colony has passed its first fragile weeks. It now holds more brood than the queen could ever tend alone.' },
  'ms-stage-mature': { title: 'A mature colony', text: 'The colony is large enough to spare labour for the next generation.' },
  'ms-first-rain': { title: 'The first rain', text: 'Rain has fallen on open ground and the trails across it are gone. Those under leaves and stones remain.' },
  'ms-first-flood-rescue': { title: 'Brood carried uphill', text: 'Water entered a chamber. The workers carried the brood to higher ground before it rose.' },
  'ms-first-heat-wave': { title: 'Heat', text: 'A spell of heat has passed. The hottest ground was too hot to cross at midday.' },
  'ms-first-frost': { title: 'Frost', text: 'The first frost has settled on the grass. Below ground the nest stays warmer than the air above.' },
  'ms-first-storm': { title: 'A storm', text: 'A thunderstorm has passed overhead. The colony came through it.' },
  'ms-first-footfall': { title: 'A shadow overhead', text: 'A giant shape passed over the trail. Ants froze or scattered; the ground trembled before it fell.' },
  'ms-first-fight': { title: 'First contact', text: 'The first fight: a worker met a stranger and neither backed away.' },
  'ms-first-rival-defeated': { title: 'A rival repelled', text: 'A neighbouring colony has been turned back from the territory the workers hold.' },
  'ms-first-winter-survived': { title: 'First winter', text: 'The colony has come through its first winter. The queen is alive.' },
  'ms-winter-3': { title: 'Third winter', text: 'A third winter survived.' },
  'ms-winter-10': { title: 'Tenth winter', text: 'Ten winters survived.' },
  'ms-year-1': { title: 'One year', text: 'One year since the first egg.' },
  'ms-year-5': { title: 'Five years', text: 'Five years since the first egg.' },
  'ms-first-alate': { title: 'Winged', text: 'The first winged ants have emerged. They will wait in the nest for the right day.' },
  'ms-first-flight': { title: 'A nuptial flight', text: 'The winged ants have left the nest. Many will be eaten or lost before they find a place to found a nest.' },
  'ms-first-daughter': { title: 'A daughter', text: 'A young queen has landed, shed her wings and begun to dig, somewhere beyond the colony\'s range.' },
  'ms-flight-flown': { title: 'Flown', text: 'The flight is over: wind, height, the sound of other wings, and the ground coming up.' },
  'ms-queen-lost': { title: 'The queen is gone', text: 'The queen has died. Brood already in the nest will mature, but no more eggs will be laid.' },
  'ms-first-gallery': { title: 'A chewed gallery', text: 'A gallery now runs through the wood. Pale shavings have collected below the opening.', species: ['camponotus-pennsylvanicus'] },
  'ms-satellite-nest': { title: 'A satellite', text: 'Older brood has been carried to a drier, warmer satellite; the queen stays in the damp parent nest.', species: ['camponotus-pennsylvanicus'] },
  'ms-night-trail': { title: 'After dark', text: 'The first night trail runs along a trunk. Carpenter ants forage in the dark.', species: ['camponotus-pennsylvanicus'] },
  'ms-first-seed': { title: 'A seed', text: 'The first seed has been carried in and stored.', species: ['messor-barbarus'] },
  'ms-first-granary': { title: 'A granary', text: 'A chamber of stored seed stands dry beside the brood. Husks lie in a heap near the entrance.', species: ['messor-barbarus'] },
  'ms-trunk-trail': { title: 'A trunk trail', text: 'A worn road now leads out from the nest and stays after the ants have left it.', species: ['messor-barbarus'] },
  'ms-fungus-planted': { title: 'The garden', text: 'The queen has set down the fungus she carried from her mother\'s nest.', species: ['atta-texana'] },
  'ms-first-leaf': { title: 'First leaf', text: 'A green fragment has been carried in. Leaves feed the fungus, and the fungus feeds the brood.', species: ['atta-texana'] },
  'ms-garden-chamber': { title: 'A second garden', text: 'A second chamber holds fungus.', species: ['atta-texana'] },
  'ms-first-major': { title: 'A larger worker', text: 'The first of the largest workers has emerged. Its head is far wider than its sisters\'.', species: ['camponotus-pennsylvanicus', 'messor-barbarus', 'atta-texana'] },
};
