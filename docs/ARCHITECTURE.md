# VoiceRiders Architecture

This document explains every layer, the data flow between them, and exactly where to add a new
command, a new intent, or a new speech engine.

---

## 1. Full system pipeline

```
                 USER
                   │
                   ▼
            Microphone (expo-audio / AudioStream, float32 PCM)
                   │
                   ▼
        ┌─── Energy VAD ───┐            (src/voice/vad/energyVad.ts)
        │                  │
     ambient             speech
        │                  │
        │                  ▼
        │            ASR provider        (src/voice/asr/*)
        │                  │
        │                  ▼
        │        Text normalization      (src/nlp/preprocessing)
        │                  │
        │                  ▼
        │        Intent classification   (src/nlp/intentClassifier)
        │                  │
        │                  ▼
        │        Entity extraction       (src/nlp/entityExtractor)
        │                  │
        │                  ▼
        │        Fuzzy matching          (src/nlp/fuzzyMatcher)
        │                  │
        │                  ▼
        │        Context manager         (src/nlp/context)
        │                  │
        │                  ▼
        │        Confidence engine       (src/nlp/confidence)
        │                  │
        │                  ▼
        │        Command dispatcher      (src/nlp/dispatcher)
        │                  │
        ▼                  ▼
  Adaptive Audio     Spotify Web API     (src/spotify/api)
  (src/adaptiveAudio)      │
        │                  ▼
        └──────────► Spotify playback
```

`VoiceController` (`src/voice/voiceController.ts`) stitches the voice front-end to the NLP pipeline;
`useRideMode` (`src/ride/useRideMode.ts`) owns the microphone stream and the Adaptive Audio branch.

---

## 2. Layers and responsibilities

### 2.1 `src/voice` — audio in

| File | Responsibility |
|------|----------------|
| `microphone/useMicrophoneStream.ts` | Wraps `useAudioStream`; downmixes to mono, measures frames, drives the VAD, requests permission, configures the audio session |
| `vad/energyVad.ts` | Streaming energy VAD: adaptive noise floor + onset/hangover timers |
| `audioProcessing/rms.ts` | RMS, peak, dBFS conversions |
| `audioProcessing/pcm.ts` | int16/float32 → mono Float32, frame duration, concatenation |
| `audioProcessing/wav.ts` | 16-bit mono WAV encoder for cloud ASR |
| `asr/*` | `AsrProvider` interface + Cloud / Mock / Unconfigured implementations + factory |
| `asr/whisper/modelManager.ts` | Runtime download + cache of the GGML model (`expo-file-system`) |
| `asr/whisper/whisperModule.ts` | The only module that loads `whisper.rn`, via a guarded dynamic import |
| `asr/whisper/onDeviceWhisperProvider.ts` | Offline transcription + command-biasing prompt |
| `voiceController.ts` | utterance → ASR → `interpretCommand()` → dispatcher |

**Why an energy VAD?** It is ~30 lines of arithmetic per 30 ms frame, works in Expo Go, and gives an
adaptive noise floor for free. `EnergyVad` is injectable, so a WebRTC/Silero VAD can replace it
behind the same `process(frame, durationMs)` call.

**Pre-roll:** the hook keeps a 300 ms rolling buffer and seeds the utterance with it on
`speech-start`, so the first phoneme ("ne**xt**") is never clipped.

### 2.2 `src/spotify` — Spotify out

| File | Responsibility |
|------|----------------|
| `auth/pkce.ts` | RFC 7636 verifier / S256 challenge / state |
| `auth/spotifyAuth.ts` | Consent screen + code exchange + refresh (public client) |
| `auth/authService.ts` | Session lifecycle; single-flight refresh; connect/disconnect |
| `auth/tokenStore.ts` | Token persistence contract (backed by `src/storage/secureStore`) |
| `api/client.ts` | Authenticated fetch; 401 → refresh once; typed errors |
| `api/playlists.ts` | Playlists + paginated playlist tracks (field-filtered) |
| `api/playback.ts` | Play/pause/next/previous/volume/seek/transfer |
| `playback/playlistTrackMap.ts` | `displayIndex ↔ spotifyPosition ↔ trackId` mapping |
| `playback/playbackController.ts` | Wake an idle device, resolve `PLAY_SONG`, apply volume |

**Two indices per track.** `displayIndex` is the number the rider speaks (only playable tracks).
`spotifyPosition` is the raw playlist position, which is what `PUT /me/player/play` wants for
`offset.position`. Keeping both means hiding an unplayable local file never shifts "song 7".

### 2.3 `src/nlp` — understanding

| Stage | File | Notes |
|-------|------|-------|
| Normalization | `preprocessing/normalize.ts` | lowercase → punctuation strip → phrase rewrites → number words → digits → stop-words → synonyms |
| Lexicons | `preprocessing/synonyms.ts` ← `shared/lexicon.json` | **shared with Python** (train/serve consistency) |
| Number parsing | `preprocessing/numberWords.ts` | digits, cardinals, ordinals; ordinals terminate a run so "the seventh one" = 7 |
| Intent | `intentClassifier/classifier.ts` | hybrid: ML (0.65) + rule/fuzzy (0.35); ML weights in `model.json` |
| Vocabulary | `intentClassifier/labels.ts` ← `shared/intentKeywords.json` | shared with Python |
| Entities | `entityExtractor/songNumber.ts` | `songNumber` |
| Fuzzy | `fuzzyMatcher/*` | Levenshtein + Jaro-Winkler + Soundex/consonant skeleton |
| Context | `context/contextManager.ts` | observable context, contextual scoring, `play → resume` |
| Confidence | `confidence/confidenceEngine.ts` | blends 4 signals, ambiguity penalty, thresholds |
| Dispatch | `dispatcher/commandDispatcher.ts` | the only place intent → action |
| Orchestration | `pipeline.ts` | pure, synchronous, no I/O |

### 2.4 `src/adaptiveAudio`

| File | Responsibility |
|------|----------------|
| `config.ts` | Three profiles with thresholds, deltas, dwell/cooldown times |
| `hysteresis.ts` | `MovingAverage`, `HysteresisGate`, `Cooldown` |
| `noiseZones.ts` | dBFS → zone, with an extra margin to move *louder* |
| `adaptiveAudioController.ts` | The engine: ambient frames → smoothed level → zone → volume delta |

**Baseline rule (important):** Adaptive Audio works in **deltas from a user baseline**. Any voice or
programmatic volume change calls `notifyManualVolumeChange()`, which rebases the baseline. So:

```
volume 50 → rider says "increase volume" → 55  (baseline 50 → 55)
noisy road → adaptive raises 55 → 57           (still relative to 55)
rider says "decrease volume" → 52              (baseline rebased to 52)
```

Adaptive Audio never "undoes" a manual command, and a manual command never cancels the adaptive
offset — they compose.

### 2.5 `src/state` + `src/services`

`src/state` holds four plain observable stores (no state-management dependency, and usable outside
React — which the ML harness and services rely on):

| Store | Holds |
|-------|-------|
| `sessionStore` | Spotify connection status + profile |
| `libraryStore` | Playlists, selected playlist, track map |
| `settingsStore` | Preferences (thresholds, toggles, profile) |
| `contextStore` | The `AppContextManager` instance + `useAppContext()` |

`src/services/appServices.ts` is the **composition root**: it constructs the playback controller,
the adaptive engine and the voice controller exactly once and wires the callbacks that enforce the
rules above. `src/services/bootstrap.ts` performs one-time startup.

---

## 3. Context management

`AppContext` (see `src/nlp/context/types.ts`) holds: Spotify connection, selected playlist + URI,
track count, current track index/name, playback state, volume, Ride Mode flag, Adaptive Audio flag,
and the last transcript/intent.

It is used in two directions:

1. **Scoring** — `evaluateContext()` returns a plausibility score. Saying "pause" when nothing is
   playing, or "play number 7" with no playlist, lowers confidence.
2. **Resolution** — `resolveIntentWithContext()` rewrites intents that are ambiguous alone:
   `PLAY` while paused, with a track loaded, is really `RESUME`.

Crucially, an out-of-range number is **not** treated as an unknown command. It resolves to
`PLAY_SONG`, scores just low enough to still execute, and the dispatcher replies with the real track
count: *"That playlist has only 20 songs."*

---

## 4. Confidence engine

```
confidence = 0.45·intent + 0.25·fuzzy + 0.20·asr + 0.10·context
```

Then:

* `UNKNOWN` is capped at 0.3 (never executed).
* If the top-2 intents are a **confusable pair** and their margin < 0.12 → ×0.7 and a reason is
  logged ("ambiguous between INCREASE_VOLUME and DECREASE_VOLUME").
* `PLAY_SONG` without a number is capped at 0.45.

Decision thresholds (configurable in Settings): `≥ 0.72` execute · `≥ 0.50` ask again · else reject.

### Worked example — the brief's case

```
ASR:         "decrese volum"                (asr confidence 0.8)
normalized:  "decrease volume"
intent:      DECREASE_VOLUME                (hybrid: ML ≈ 0.5, rules ≈ 0.95 → ≈ 0.66)
fuzzy:       0.93  (canonical text vs "decrease volume")
context:     1.00  (playing, volume known)
p_inc:       ≈ 0.22

confidence = 0.45·0.66 + 0.25·0.93 + 0.20·0.80 + 0.10·1.00
           = 0.297 + 0.233 + 0.160 + 0.100 = 0.790   -> execute
```

Swap the transcript to `"increse volum"` and the ML/rule split flips toward `INCREASE_VOLUME`; if the
margin were under 0.12 the ambiguity penalty would push the result down and the app would ask the
rider to repeat rather than risk blasting the volume.

Numbers above are illustrative of the formula's shape; the executable truth is
`src/nlp/confidence/confidenceEngine.ts` and the measured behaviour is in
`ml/metrics/intent_metrics.json`.

---

## 5. Extension points

### Add a new command intent

1. Add the intent to `Intent` / `INTENTS` in `src/nlp/types.ts`.
2. Add canonical phrases to `src/nlp/shared/intentKeywords.json`.
3. Add examples to `ml/data/commands.jsonl` (include noisy variants).
4. Handle it in the `switch` in `src/nlp/dispatcher/commandDispatcher.ts` (+ a string in `responses.ts`).
5. Add a counterpart in `src/spotify/playback/playbackController.ts` if it touches Spotify.
6. Run `npm run ml:train && npm run ml:eval-intent` and commit `model.json` with the metrics.

No changes are needed in the microphone, VAD, confidence or UI layers.

### Add a speech recognition engine

Implement `AsrProvider` (`src/voice/asr/types.ts`):

```ts
export interface AsrProvider {
  readonly name: string;
  readonly isConfigured: boolean;
  transcribe(utterance: AudioUtterance): Promise<AsrResult>;
}
```

`AudioUtterance` is already mono float32 PCM plus a sample rate, so an on-device Whisper
(`whisper.rn`, `whisper.cpp`) or a native platform recogniser is a drop-in: encode to WAV
(`audioProcessing/wav.ts`) or feed PCM directly. Then return it from `createAsrProvider()`.

**This is implemented**: `whisper.rn` (whisper.cpp) is the default engine, with a runtime model
download and a command-biasing prompt — see [`ON_DEVICE_ASR.md`](ON_DEVICE_ASR.md). Note that the
native module is loaded with a guarded dynamic import so Expo Go degrades gracefully instead of
crashing.

### Swap the VAD

Construct `new EnergyVad(config)` with different thresholds, or pass any object with
`process(frame, durationMs): VadFrameResult` and `reset()` into `useMicrophoneStream({ vad })`.

---

## 6. Performance notes

* ASR runs **only** on VAD-confirmed speech, never on the continuous stream.
* Voice features are mono 16 kHz; `PLAY_SONG` understanding is O(vocabulary) dot products.
* The adaptive engine evaluates once per second over a moving average, and enforces a cooldown.
* Spotify track fetches request only the fields the UI renders, paginated at 100.
* The microphone is stopped when the Ride Mode screen unmounts and TTS is cancelled on exit.

## 7. Error model

All layers throw typed `AppError`s (`src/utils/errors.ts`) with a stable `code`
(`SPOTIFY_NOT_CONNECTED`, `SONG_OUT_OF_RANGE`, `ASR_NOT_CONFIGURED`, …). The dispatcher catches them,
speaks a short sentence and returns `ok: false`, so the pipeline never crashes a ride and never
executes a command it could not complete.
