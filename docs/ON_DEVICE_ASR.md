# On-device speech recognition (Whisper)

VoiceRiders can transcribe speech **on the phone** with [whisper.cpp](https://github.com/ggerganov/whisper.cpp)
through [`whisper.rn`](https://github.com/mybigday/whisper.rn). That is the recommended engine while riding:

| | On-device Whisper | Cloud ASR |
|---|---|---|
| Network needed | ❌ none | ✅ every command |
| Latency | no round trip | + network RTT |
| Privacy | audio never leaves the phone | audio is uploaded |
| Cost | free | per request |
| Setup | dev build + one 75 MB download | endpoint + key |
| Works in Expo Go | ❌ (native module) | ✅ |

---

## 1. Why a development build is required

`whisper.rn` is a native module, so it cannot run in Expo Go. The provider is written so that this
degrades **gracefully** rather than crashing:

* `src/voice/asr/whisper/whisperModule.ts` loads `whisper.rn` with a **dynamic `import()`** inside a
  `try/catch`.
* In Expo Go that import rejects and becomes a `WhisperUnavailableError` — the app keeps working and
  Settings explains what to do.
* In a development build the module resolves and the engine is used.

```bash
npx eas-cli@latest build --profile development --platform android
# or locally, if you have the native toolchain:
npx expo run:android
```

> `whisper.rn` ships a `postinstall` step that downloads pre-built native libraries from GitHub. If
> that fails offline, run `RNWHISPER_SKIP_POSTINSTALL=1 npm install` locally and let the EAS build
> fetch them (or re-run `npx whisper-rn-download-artifacts`).

## 2. Get a model

The model is **never committed to this repository** or bundled into the app. It is downloaded once at
runtime, from **Settings → Speech recognition → Download speech model**, into the app's document
directory (`expo-file-system`).

| Model | Size | Notes |
|-------|-----:|-------|
| `ggml-tiny.en.bin` | ~75 MB | default; fastest, good enough for short commands |
| `ggml-base.en.bin` | ~142 MB | noticeably better in wind/engine noise |
| `ggml-small.en.bin` | ~466 MB | best accuracy, slowest; needs a modern phone |

Configure via `.env`:

```env
EXPO_PUBLIC_WHISPER_MODEL_URL=https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
EXPO_PUBLIC_WHISPER_MODEL_FILENAME=ggml-base.en.bin
EXPO_PUBLIC_WHISPER_USE_GPU=true
EXPO_PUBLIC_WHISPER_MAX_THREADS=4
```

Changing the filename makes the app treat it as a different model (download again, old file can be
deleted from Settings).

## 3. How the pipeline uses it

```
VAD closes an utterance (mono float32 PCM @ 16 kHz)
        │
        ▼
encodeWav16()  ->  cache/voiceriders-utterance.wav     (16-bit PCM mono)
        │
        ▼
whisperContext.transcribe(uri, {
  language: 'en', translate: false, maxThreads,
  temperature: 0, beamSize: 1, bestOf: 1,     // greedy: deterministic + fast
  prompt: COMMAND_BIAS_PROMPT,                // ← command biasing
})
        │
        ▼
AsrResult { text, provider: 'whisper-on-device', latencyMs }
        │
        ▼
NLP pipeline (normalization → intent → entities → confidence → dispatch)
```

### Command biasing

Whisper conditions its decoder on an initial `prompt`. Seeding it with the command vocabulary
(`next song, previous song, pause, resume, increase volume, …`) makes the correct phrase far more
likely than a phonetically similar one. See `COMMAND_BIAS_PROMPT` in
`src/voice/asr/whisper/onDeviceWhisperProvider.ts` — add new intents there when you add commands.

### Confidence

whisper.cpp does not expose a calibrated confidence, so `AsrResult.confidence` is `undefined`. The
confidence engine (`src/nlp/confidence/confidenceEngine.ts`) falls back to `DEFAULT_ASR_CONFIDENCE`
(0.75) and leans on intent + fuzzy + context instead — which is exactly why those signals are
weighted the way they are.

## 4. Performance expectations

Numbers from the whisper.rn project (tiny.en, release build): roughly **0.5–1 s for a 2 s command**
on a modern phone, faster on GPU/Core ML/NPU. In practice, transcription is not the bottleneck — the
VAD's silence hangover (`minSilenceMs`, default 500 ms) usually dominates end-to-end latency.

Tuning knobs:

* `EXPO_PUBLIC_WHISPER_MAX_THREADS` — 4 is a good default; more helps on big cores only.
* `EXPO_PUBLIC_WHISPER_USE_GPU` — leave `true`; `context.reasonNoGPU` is logged when it falls back.
* `EnergyVad`'s `minSilenceMs` / `maxUtteranceMs` in `src/voice/vad/energyVad.ts`.

## 5. Swapping in another engine

Any engine works as long as it implements `AsrProvider` (`src/voice/asr/types.ts`):

```ts
export interface AsrProvider {
  readonly name: string;
  readonly isConfigured: boolean;
  transcribe(utterance: AudioUtterance): Promise<AsrResult>;
  dispose?(): Promise<void>;
}
```

`AudioUtterance` is already mono float32 PCM plus a sample rate, so:
* **native platform recognisers** (e.g. a community `expo-speech-recognition` module) can be wrapped
  in an adapter;
* **whisper.cpp via a different binding** just replaces `whisperModule.ts`;
* **cloud providers** (OpenAI, Deepgram, AssemblyAI, Google, Groq) already work through
  `CloudAsrProvider` — it is a plain "POST a WAV, read `{ text }`" contract.

Then return your provider from `createAsrProvider()` in `src/voice/asr/index.ts`.

## 6. Native notes

* **Android**: whisper.rn compiles a small JNI wrapper against your RN version; the whisper.cpp core
  ships pre-built. If ProGuard/R8 is enabled in release, add `-keep class com.rnwhisper.** { *; }`.
  On Snapdragon 8 Gen 1+ the Hexagon NPU can be used automatically when `useGpu` is on.
* **iOS**: whisper.rn uses the pre-built `rnwhisper.xcframework`; Core ML can be enabled for extra
  speed by supplying an `.mlmodelc` alongside the ggml model.
* `large`/`medium` models need the *Extended Virtual Addressing* entitlement on iOS.
* Keep the model on the **document** directory (not cache) so the OS does not evict it mid-ride.
