/** Shared NLP types. Kept dependency-free so they can be unit tested easily. */

export type Intent =
  | 'INCREASE_VOLUME'
  | 'DECREASE_VOLUME'
  | 'PLAY'
  | 'PAUSE'
  | 'RESUME'
  | 'NEXT_SONG'
  | 'PREVIOUS_SONG'
  | 'PLAY_SONG'
  | 'STOP'
  | 'UNKNOWN';

export const INTENTS: Intent[] = [
  'INCREASE_VOLUME',
  'DECREASE_VOLUME',
  'PLAY',
  'PAUSE',
  'RESUME',
  'NEXT_SONG',
  'PREVIOUS_SONG',
  'PLAY_SONG',
  'STOP',
  'UNKNOWN',
];

export interface Entities {
  songNumber?: number;
}

/** Result of text normalization (see nlp/preprocessing/normalize.ts). */
export interface NormalizedCommand {
  /** Exactly what the ASR produced. */
  original: string;
  /** Lowercased, punctuation-free, spoken numbers converted to digits. */
  cleaned: string;
  /** Tokens of `cleaned`. */
  tokens: string[];
  /** Stop-words removed. */
  contentTokens: string[];
  /** `contentTokens` after synonym canonicalisation, e.g. song -> track. */
  canonicalTokens: string[];
  /** Space-joined canonical tokens — the string matched against templates. */
  canonicalText: string;
  /** Numeric value found in the utterance, if any. */
  numberValue?: number;
}

export interface IntentPrediction {
  intent: Intent;
  confidence: number;
  /** Per-intent score in [0, 1]. */
  scores: Partial<Record<Intent, number>>;
  /** Gap between the best and second-best intent; small margin = risky. */
  margin: number;
  method: 'ml' | 'rules' | 'hybrid';
}

export interface AsrResult {
  text: string;
  /** Provider-reported confidence in [0, 1], when available. */
  confidence?: number;
  provider: string;
  /** Wall-clock latency of the ASR call, ms. */
  latencyMs?: number;
}

export type Decision = 'execute' | 'confirm' | 'reject';

/** Everything the pipeline concluded about one utterance. */
export interface Interpretation {
  transcript: string;
  asrConfidence?: number;
  normalized: NormalizedCommand;
  prediction: IntentPrediction;
  entities: Entities;
  /** Best fuzzy similarity to the winning intent's vocabulary, in [0, 1]. */
  fuzzyScore: number;
  /** How well the command fits the current app context, in [0, 1]. */
  contextScore: number;
  /** Final blended confidence, in [0, 1]. */
  confidence: number;
  decision: Decision;
  /** Human-readable explanation, surfaced in the UI / logs. */
  reasons: string[];
}
