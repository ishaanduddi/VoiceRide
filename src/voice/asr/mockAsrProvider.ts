/**
 * Deterministic ASR provider used by tests, demos and the ML evaluation
 * harness. It returns queued transcripts in order, so the whole pipeline can be
 * exercised without a microphone or network.
 */

import type { AudioUtterance, AsrProvider } from './types';

export class MockAsrProvider implements AsrProvider {
  readonly name = 'mock';
  readonly isConfigured = true;

  private queue: string[];

  constructor(transcripts: string[] = ['next song']) {
    this.queue = [...transcripts];
  }

  setTranscripts(transcripts: string[]): void {
    this.queue = [...transcripts];
  }

  push(transcript: string): void {
    this.queue.push(transcript);
  }

  async transcribe(_utterance: AudioUtterance) {
    const text = this.queue.shift() ?? '';
    return { text, confidence: 0.9, provider: this.name, latencyMs: 0 };
  }
}
