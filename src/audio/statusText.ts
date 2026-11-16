// What Settings > Audio says about the sound, truthfully (GDD 08 §13.1, 7.4 status line). One place for the words and
// for whether a click can help, so the UI and the tests agree.

/** More detail than the context status: why sound is not playing, or that it is but the tab is hidden. */
export type AudioStatusDetail = 'test' | 'no-game' | 'waiting' | 'running' | 'muted-hidden' | 'blocked' | 'unsupported';

export interface StatusLine {
  text: string;
  /** A user click can start or retry the sound: the status line shows the "Click to enable sound" button. */
  needsClick: boolean;
  /** Visual tone of the line. */
  tone: 'ok' | 'warn' | 'bad' | 'neutral';
}

export const ENABLE_BUTTON_LABEL = 'Click to enable sound';

export function statusLine(d: AudioStatusDetail): StatusLine {
  switch (d) {
    case 'running': return { text: 'Sound running', needsClick: false, tone: 'ok' };
    case 'muted-hidden': return { text: 'Sound muted while this tab is hidden', needsClick: false, tone: 'neutral' };
    case 'waiting': return { text: 'Sound is waiting for a click or key press: browsers only allow sound after one', needsClick: true, tone: 'warn' };
    case 'blocked': return { text: 'Sound blocked by the browser: click to enable', needsClick: true, tone: 'bad' };
    case 'unsupported': return { text: 'This browser cannot play game sound. The game works without it.', needsClick: false, tone: 'bad' };
    case 'no-game': return { text: 'Sound starts when a game does', needsClick: false, tone: 'neutral' };
    case 'test': return { text: 'Sound is off in test mode', needsClick: false, tone: 'neutral' };
  }
}

/** The buses a "Test" button can play something on. */
export const TEST_BUSES = ['master', 'ambience', 'effects', 'giants', 'ui', 'music'] as const;
export type TestBus = (typeof TEST_BUSES)[number];
