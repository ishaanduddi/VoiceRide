/**
 * Volume-direction guard.
 *
 * "increase volume" and "decrease volume" are the confusable pair this project is
 * built around, and a statistical classifier can still flip them on a short,
 * noisy utterance (the evaluated model confuses them on some held-out samples).
 *
 * Doing the opposite of what the rider asked is the worst failure mode here, so
 * an explicit direction word overrides the classifier. Only unambiguous,
 * correctly-heard direction words trigger this: misspellings are left to the
 * fuzzy matcher, which has more context to work with.
 */

import type { Intent } from '../types';

const DOWN_WORDS = ['decrease', 'lower', 'quieter', 'down', 'reduce', 'softer'];
const UP_WORDS = ['increase', 'louder', 'up', 'raise', 'boost'];

const VOLUME_INTENTS: Intent[] = ['INCREASE_VOLUME', 'DECREASE_VOLUME', 'UNKNOWN'];

export function applyVolumeDirection(
  intent: Intent,
  canonicalTokens: string[],
): { intent: Intent; reason?: string } {
  if (!VOLUME_INTENTS.includes(intent)) return { intent };

  const hasDown = canonicalTokens.some((token) => DOWN_WORDS.includes(token));
  const hasUp = canonicalTokens.some((token) => UP_WORDS.includes(token));

  // Both directions present ("turn it up, no, down") -> leave it to confidence.
  if (hasDown === hasUp) return { intent };

  const forced: Intent = hasDown ? 'DECREASE_VOLUME' : 'INCREASE_VOLUME';
  if (forced === intent) return { intent };

  return {
    intent: forced,
    reason: `direction word overrode ${intent} -> ${forced}`,
  };
}
