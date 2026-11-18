// Cards that take the middle of the screen and wait for the player: the opening's intro card, its time-lapse and result
// cards, the winter banner / lapse / report, the flight prompts. The context prompts ("Groom yourself", "F Dig") stay
// hidden while one is up: they used to be drawn over the intro card's text (docs-final, test-output/readme-shot).
import type { FlightUi } from '../screens/flight/store';
import { flightUi } from '../screens/flight/store';
import type { FoundingUi } from '../screens/founding/store';
import { foundingUi } from '../screens/founding/store';
import type { WinterUi } from '../screens/overwinter/store';
import { winterUi } from '../screens/overwinter/store';

export function isBlockingCardUp(founding: FoundingUi | null, winter: WinterUi | null, flight: FlightUi | null): boolean {
  if (founding && (founding.phase === 'intro-card' || founding.phase === 'timelapse' || founding.outcome || founding.failure)) return true;
  if (winter) return true;
  if (flight && (flight.ask || flight.launch || flight.ended)) return true;
  return false;
}

/** Reads the three read-out signals (inside a component this subscribes to them). */
export function blockingCardUp(): boolean {
  return isBlockingCardUp(foundingUi.value, winterUi.value, flightUi.value);
}
