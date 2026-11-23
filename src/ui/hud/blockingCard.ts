// Cards that take the middle of the screen and wait for the player: the opening's intro card, its time-lapse and result
// cards, the hand-over banner, the winter banner / lapse / report, the flight prompts. The context prompts ("Groom yourself", "F Dig") stay
// hidden while one is up: they used to be drawn over the intro card's text (docs-final, test-output/readme-shot).
import type { FlightUi } from '../screens/flight/store';
import { flightUi } from '../screens/flight/store';
import type { FoundingUi } from '../screens/founding/store';
import { foundingUi } from '../screens/founding/store';
import type { WinterUi } from '../screens/overwinter/store';
import { winterUi } from '../screens/overwinter/store';

export function isBlockingCardUp(founding: FoundingUi | null, winter: WinterUi | null, flight: FlightUi | null): boolean {
  if (founding && (founding.phase === 'intro-card' || founding.phase === 'timelapse' || founding.outcome || founding.failure)) return true;
  // the hand-over banner sits in the same top-centre band as the prompt and hint cards (look pass 4: "Why?" was drawn under it)
  if (founding?.handover) return true;
  if (winter) return true;
  if (flight && (flight.ask || flight.launch || flight.ended)) return true;
  return false;
}

/** Reads the three read-out signals (inside a component this subscribes to them). */
export function blockingCardUp(): boolean {
  return isBlockingCardUp(foundingUi.value, winterUi.value, flightUi.value);
}

/**
 * The cards that hold the centre of the screen through a stretch of lapse or until the player answers: the intro card, the time-lapse, its
 * result and failure cards, the winter lapse and its report. While one is up a "Resolved" alert card is not kept (GDD 08 section 6.3: its 4 s
 * would be spent unread behind the card). The hand-over banner, the winter banner and the flight prompts are not in this set: they sit
 * beside the alert column and play goes on under them, so alerts keep their normal life.
 */
export function isCentreCardUp(founding: FoundingUi | null, winter: WinterUi | null): boolean {
  if (founding && (founding.phase === 'intro-card' || founding.phase === 'timelapse' || founding.outcome || founding.failure)) return true;
  return !!winter && winter.phase !== 'banner';
}

/** Reads the two signals (inside a component this subscribes to them). */
export function centreCardUp(): boolean {
  return isCentreCardUp(foundingUi.value, winterUi.value);
}
