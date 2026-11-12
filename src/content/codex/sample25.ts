// Sentence-by-sentence fact trace of 25 entries chosen across the four species and the habitats (acceptance 2 of task
// codex-content). For each entry, element i traces sentence i of the body (sentences split by `splitSentences`):
// either the indexes of the claims in PROVENANCE[id].claims that support it, or a short reason when the sentence is a
// hedge ("is thought to", "has not been measured"), a framing sentence, or a statement about the game itself.
// `provenance.test.ts` checks that the trace covers every sentence and that every cited claim is a verified quote.

export type SentenceTrace = readonly number[] | string;

/** Splits a body into sentences (a full stop, question or exclamation mark followed by a capital letter or digit). */
export function splitSentences(body: string): string[] {
  return body.split(/(?<=[.!?])\s+(?=[A-Z0-9])/);
}

export const SAMPLE_25_TRACE: Readonly<Record<string, readonly SentenceTrace[]>> = {
  'cx-species-lasius-niger': ['framing: reference species of the game (design seed)', [0, 2], [1, 3], [4], [5], [6, 7]],
  'cx-species-camponotus-pennsylvanicus': [[7, 8], [9, 10, 1, 0], [2], [3, 11], [4, 12, 13], [5, 6, 14]],
  'cx-species-messor-barbarus': [[0, 7], [1, 2], [9, 8, 6], [3], [4, 5]],
  'cx-species-atta-texana': [[3], [1, 2], [4, 7], [6, 8, 9], [5], [0]],
  'cx-queen-reserves': [[2], [2], [0], [1], 'hedge: the gauge figures are the game\'s estimates (stated as such)'],
  'cx-brood-stages': [[6], [4, 3], [0, 1], [2], [5]],
  'cx-nanitics': [[3], [0, 1, 4], [2, 3]],
  'cx-claustral-founding': [[0], [4, 5, 6], [1], [2], [3]],
  'cx-trail-pheromone': [[6, 2, 3], [0], [0, 1], 'hedge: trail lifetime is uncertain; the dossier marks the published values unverified', [4, 5]],
  'cx-route-memory': [[0], [0], [1, 2], 'hedge: "may help", an inference from the two findings'],
  'cx-home-range': [[0], [0], [0], [1], 'hedge: "is thought to", an inference'],
  'cx-cofounding': [[0], [1, 2], [5], [3], [6, 4]],
  'cx-nuptial-flight': [[1, 6], [0, 1, 2], [3], [4, 5, 7], [6, 8]],
  'cx-satellite-nests': [[3, 4], [0, 5], [1, 2], [4], [3, 6]],
  'cx-wood-moisture': [[0], [1, 6], [2, 7], [3, 8], [4, 5]],
  'cx-trunk-trail': [[0, 2, 6], [1], [3], [4], [5]],
  'cx-seed-classes': [[0, 1], [2, 3, 7, 8], [6], [4], [5]],
  'cx-hybridogenesis': [[4], [0], [1], [2], [3], 'hedge: an inference, stated as not observed'],
  'cx-fungus-garden': [[5], [0], [1], [2], [3], [4]],
  'cx-leaf-cutting': [[1], [0], [2], [3, 4, 5]],
  'cx-garden-waste': [[3], [0, 4], [1], [2]],
  'cx-mound-structure': [[0, 2, 7], [3, 4], [1, 6], [5]],
  'cx-honeydew': [[0], [1], [2, 3], [0], [4]],
  'cx-antlion': [[2, 1, 0], [0], [0], [0]],
  'cx-habitat-asphalt': [[0], [0, 1], [3, 4], [2], [5]],
};

/** The 25 sampled entries, in the order of the trace table. */
export const SAMPLE_25: readonly string[] = Object.keys(SAMPLE_25_TRACE);
