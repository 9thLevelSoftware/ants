// Wording rules for the codex and every other text in src/content (GDD 08 tone line, §6.4 conflict wording, §11.8;
// directions K). Pure data, used by the tests in this folder and by anyone adding text.

/** Words the conflict wording rule (GDD 08 §6.4) forbids in display strings. "major" is the caste term and is allowed. */
export const AVOIDED_WORDS: readonly string[] = [
  'defeated', 'defeat', 'conquered', 'conquer', 'conquest', 'enemy', 'enemies', 'soldier', 'soldiers', 'war', 'wars',
  'battle', 'battles', 'army', 'armies', 'victory', 'victorious', 'truce', 'warrior', 'invasion', 'invade',
];

/** First-person speech: no ant, queen or colony ever speaks, and the notes never say "I" or "we" (GDD 08 tone line). */
export const FIRST_PERSON_PATTERNS: readonly RegExp[] = [
  /\bI\b/, /\bI['’](m|ve|ll|d)\b/i, /\bme\b/i, /\bmy\b/i, /\bmine\b/i, /\bwe\b/i, /\bwe['’](re|ve|ll|d)\b/i,
  /\bour\b/i, /\bours\b/i, /\bus\b/i, /\blet['’]s\b/i,
];

/** A short list of joke markers (puns on "ant", exclamations, laughter). The tone is calm: no jokes. */
export const JOKE_PATTERNS: readonly RegExp[] = [
  /!/, /\bant-?ics\b/i, /\bant-?astic\b/i, /\bant-?icipat/i, /\bant-?ly\b/i, /\blol\b/i, /\bhaha/i, /\bpun\b/i,
  /\bantsy\b/i, /\bpicnic crashers?\b/i, /\bmarching orders\b/i, /\bhilarious\b/i,
  /\bfunny\b/i, /:\)/, /\bemoji\b/i,
];

/** Speech and character markers: quoted speech, "she said", dialogue verbs (the game has no dialogue). */
export const SPEECH_PATTERNS: readonly RegExp[] = [
  /\b(she|he|it|the (queen|ant|worker|colony)) (said|says|whispers|shouts|exclaims|replied)\b/i, /“[^”]{1,80}”/,
];

/** Human institutions and personifications the conflict wording rule rules out (GDD 08 §6.4). */
export const INSTITUTION_PATTERNS: readonly RegExp[] = [
  /\b(king|kingdom|empire|emperor|commander|captain|police|government|nation|tribe)\b/i,
];

export interface WordingProblem {
  rule: 'avoided-word' | 'first-person' | 'joke' | 'speech' | 'institution';
  match: string;
}

/**
 * Checks one string against the wording rules. `allow` lists exact lower-case substrings that may appear even though
 * a rule would match them (for instance a mandated title); matching ignores case.
 */
export function wordingProblems(text: string, allow: readonly string[] = []): WordingProblem[] {
  let t = text;
  for (const a of allow) t = t.replace(new RegExp(a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ');
  const out: WordingProblem[] = [];
  for (const w of AVOIDED_WORDS) {
    const m = new RegExp(`\\b${w}\\b`, 'i').exec(t);
    if (m) out.push({ rule: 'avoided-word', match: m[0] });
  }
  const groups: [WordingProblem['rule'], readonly RegExp[]][] = [
    ['first-person', FIRST_PERSON_PATTERNS], ['joke', JOKE_PATTERNS], ['speech', SPEECH_PATTERNS],
    ['institution', INSTITUTION_PATTERNS],
  ];
  for (const [rule, patterns] of groups) {
    for (const re of patterns) {
      const m = re.exec(t);
      if (m) out.push({ rule, match: m[0] });
    }
  }
  return out;
}

/** Counts the words of a string (runs of non-space characters that contain a letter or digit). */
export function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
}
