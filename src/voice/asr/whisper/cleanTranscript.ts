/**
 * Whisper non-speech annotation handling.
 *
 * whisper.cpp emits bracketed sound annotations when it hears audio that is not
 * speech, for example:
 *
 *   [Music]   [BLANK_AUDIO]   [ Silence ]   (music)   [APPLAUSE]
 *
 * These are not commands. Passing them into the NLP pipeline is actively
 * harmful: "music" fuzzy-matches "play music", so the app decided the rider had
 * said PLAY and asked them to repeat — while all it had heard was the song.
 *
 * So: strip the annotations, and report when nothing but annotation was left.
 */

/** Bracketed annotations for non-speech audio (covers [] and () styles). */
const NON_SPEECH_ANNOTATION =
  /[[(]\s*(?:music|silence|blank_audio|blank audio|inaudible|noise|applause|laughter|background noise|sound effect|no speech|singing)\s*[\])]/gi;

export interface CleanedTranscript {
  text: string;
  /** True when the original contained only non-speech annotations. */
  nonSpeech: boolean;
}

/** Removes Whisper's sound annotations and normalises whitespace. */
export function cleanTranscript(raw: string): CleanedTranscript {
  const original = (raw ?? '').trim();
  if (original.length === 0) return { text: '', nonSpeech: false };

  const stripped = original
    .replace(NON_SPEECH_ANNOTATION, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Nothing but annotations (or punctuation) -> it was music/noise, not speech.
  const nonSpeech = stripped.length === 0 || /^[\s.,!?-]*$/.test(stripped);

  return { text: nonSpeech ? '' : stripped, nonSpeech };
}
