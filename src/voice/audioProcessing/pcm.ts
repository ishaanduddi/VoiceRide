/**
 * PCM decoding for expo-audio's microphone stream.
 *
 * `useAudioStream` delivers an `AudioStreamBuffer` whose `data` is either
 * float32 (default) or int16, interleaved when stereo.
 */

export type PcmEncoding = 'float32' | 'int16';

/**
 * Decodes an interleaved PCM buffer into a mono Float32Array in [-1, 1].
 *
 * We downmix because voice commands never need stereo, and mono halves both
 * the CPU and the bytes sent to ASR.
 */
export function decodeToMonoFloat32(
  data: ArrayBuffer,
  channels = 1,
  encoding: PcmEncoding = 'float32',
): Float32Array {
  if (encoding === 'int16') {
    const frameCount = Math.floor(data.byteLength / 2);
    const source = new Int16Array(data, 0, frameCount);
    const scaled = new Float32Array(frameCount);
    for (let i = 0; i < frameCount; i += 1) {
      scaled[i] = (source[i] as number) / 32768;
    }
    return downmix(scaled, channels);
  }

  const frameCount = Math.floor(data.byteLength / 4);
  const source = new Float32Array(data, 0, frameCount);
  return downmix(source, channels);
}

function downmix(interleaved: Float32Array, channels: number): Float32Array {
  if (channels <= 1) return interleaved;

  const frameCount = Math.floor(interleaved.length / channels);
  const mono = new Float32Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      sum += interleaved[frame * channels + channel] as number;
    }
    mono[frame] = sum / channels;
  }
  return mono;
}

/** Duration of `frameCount` samples at `sampleRate`, in milliseconds. */
export function durationMsFor(frameCount: number, sampleRate: number): number {
  if (sampleRate <= 0) return 0;
  return (frameCount / sampleRate) * 1000;
}

/** Concatenates captured frames into one contiguous utterance buffer. */
export function concatFloat32(chunks: Float32Array[]): Float32Array {
  let total = 0;
  for (const chunk of chunks) total += chunk.length;

  const merged = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}
